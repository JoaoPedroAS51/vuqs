import type { QueryModuleResult } from '../../../src/core/module-system/contract'
import type { QueryCore } from '../../../src/core/module-system/query-core'
import type { ParsedQuery } from '../../../src/core/query/types'
import type { QueryStateSchema } from '../../../src/core/schema/schema'
import { describe, expect, it } from 'vitest'
import { toQueryRef } from '../../../src/core/bindings/to-query-ref'
import { toQueryRefs } from '../../../src/core/bindings/to-query-refs'
import { useQueryState } from '../../../src/core/bindings/use-query-state'
import { useQueryStates } from '../../../src/core/bindings/use-query-states'
import { codecs } from '../../../src/core/codecs/catalog'
import { createCodec } from '../../../src/core/codecs/codec'
import { queryParam } from '../../../src/core/schema/params/query-param'
import { defineQuerySchema } from '../../../src/core/schema/schema'
import { withActiveParams } from '../../../src/modules/active-params'
import { withRuntimeDefaults } from '../../../src/modules/runtime-defaults'
import { withTestQuery } from '../../helpers/adapter'

interface PairedRun {
  url: ParsedQuery
  values: Record<string, unknown>
}

// Runs the same request on independent equivalent fixtures with default omission enabled and
// disabled, so each settled read and URL can be asserted literally and compared.
async function writePaired<TSchema extends QueryStateSchema>(
  schema: TSchema,
  options: {
    initial?: ParsedQuery
    defaults?: Record<string, unknown>
    modules?: readonly ModuleSetup[]
    write: (q: ReturnType<typeof mount<TSchema>>['q']) => void
  },
): Promise<{ clear: PairedRun, keep: PairedRun }> {
  const result: Partial<Record<'clear' | 'keep', PairedRun>> = {}

  for (const [name, clearOnDefault] of [['clear', true], ['keep', false]] as const) {
    const { q, test } = mount(schema, options.initial ?? {}, clearOnDefault, options.modules)

    if (options.defaults !== undefined) {
      q.setDefaults(options.defaults as never)
    }
    options.write(q)
    await new Promise(resolve => setTimeout(resolve, 0))
    result[name] = { url: structuredClone(test.query.value), values: { ...q.values } }
    test.dispose()
  }

  return result as { clear: PairedRun, keep: PairedRun }
}

type ModuleSetup = (core: QueryCore<any>) => QueryModuleResult

function mount<TSchema extends QueryStateSchema>(schema: TSchema, initial: ParsedQuery, clearOnDefault: boolean, modules: readonly ModuleSetup[] = []) {
  const test = withTestQuery(initial)
  const q = test.build(() => {
    const composed = useQueryStates(schema, { clearOnDefault }).use(withRuntimeDefaults())

    for (const module of modules) {
      composed.use(module)
    }

    return composed
  })

  return { q, test }
}

describe('default omission with composed defaults', () => {
  const record = () => queryParam.object('record', {
    a: queryParam('a', codecs.integer.withDefault(0)),
    b: queryParam('b', codecs.integer),
    c: queryParam('c', codecs.integer.withDefault(2)),
  })

  it('omits the representation of a written complete composed default', async () => {
    const { clear, keep } = await writePaired({ record: record() }, {
      initial: { keep: 'me' },
      defaults: { record: { a: 99 } },
      write: q => q.patch({ record: { a: 99, c: 2 } }),
    })

    expect(clear.url).toEqual({ keep: 'me' })
    expect(clear.values.record).toEqual({ a: 99, c: 2 })
    expect(keep.url).toEqual({ keep: 'me', record: { a: '99', c: '2' } })
    expect(keep.values.record).toEqual({ a: 99, c: 2 })
  })

  it('retains a partial explicit write that differs from the complete candidate under structural equality', async () => {
    const { clear, keep } = await writePaired({ record: record() }, {
      write: q => q.patch({ record: { c: 2 } }),
    })

    expect(clear.url).toEqual({ record: { c: '2' } })
    expect(keep.url).toEqual({ record: { c: '2' } })
    expect(clear.values.record).toEqual({ a: 0, c: 2 })
    expect(keep.values.record).toEqual({ a: 0, c: 2 })
  })

  it('retains a partial non-default write without injecting defaulted children', async () => {
    const { clear, keep } = await writePaired({ record: record() }, {
      write: q => q.patch({ record: { b: 10 } }),
    })

    for (const run of [clear, keep]) {
      expect(run.url).toEqual({ record: { b: '10' } })
      expect(run.values.record).toEqual({ a: 0, b: 10, c: 2 })
    }
  })
})

describe('default omission with presence gates', () => {
  const gated = () => queryParam.object('record', {
    a: queryParam('a', codecs.integer.withDefault(0)),
    b: queryParam('b', codecs.integer.withDefault(100)),
  })

  it.each([
    ['own default before the gate', () => gated().withDefault({ a: 0, b: 100 }).withDefaultsWhenPresent()],
    ['gate before the own default', () => gated().withDefaultsWhenPresent().withDefault({ a: 0, b: 100 })],
    ['gate without an own default', () => gated().withDefaultsWhenPresent()],
  ])('retains the represented presence of a gated object with %s', async (_name, build) => {
    const { clear, keep } = await writePaired({ record: build() }, {
      write: q => q.patch({ record: { a: 0, b: 100 } }),
    })

    for (const run of [clear, keep]) {
      expect(run.url).toEqual({ record: { a: '0', b: '100' } })
      expect(run.values.record).toEqual({ a: 0, b: 100 })
    }
  })

  it('retains the represented presence of a prefixed gated object with an own default', async () => {
    const prefixed = queryParam.object('p', gated().withDefault({ a: 0, b: 100 }).withDefaultsWhenPresent())
    const { clear, keep } = await writePaired({ record: prefixed }, {
      write: q => q.patch({ record: { a: 0, b: 100 } }),
    })

    for (const run of [clear, keep]) {
      expect(run.url).toEqual({ p: { record: { a: '0', b: '100' } } })
      expect(run.values.record).toEqual({ a: 0, b: 100 })
    }
  })

  it('retains an ungated parent whose explicit gated descendant omission would hide the descendant', async () => {
    const child = queryParam.object('child', {
      a: queryParam('a', codecs.integer.withDefault(1)),
    }).withDefaultsWhenPresent()
    const parent = queryParam.object('parent', { child })
    const { clear, keep } = await writePaired({ parent }, {
      write: q => q.patch({ parent: { child: { a: 1 } } }),
    })

    for (const run of [clear, keep]) {
      expect(run.url).toEqual({ parent: { child: { a: '1' } } })
      expect(run.values.parent).toEqual({ child: { a: 1 } })
    }
  })

  it('resolves a gated object as absent when codec omission removes its last presence key', async () => {
    const nullable = queryParam.object('record', {
      a: queryParam('a', codecs.integer.nullable()),
    }).withDefaultsWhenPresent()
    const { clear, keep } = await writePaired({ record: nullable }, {
      initial: { record: { a: '4' } },
      write: q => q.patch({ record: { a: null } }),
    })

    for (const run of [clear, keep]) {
      expect(run.url).toEqual({})
      expect(run.values.record).toBeUndefined()
    }
  })

  it('does not let an own default recover presence lost through codec omission', async () => {
    const nullable = queryParam.object('record', {
      a: queryParam('a', codecs.integer.nullable()),
    }).withDefault({ a: 2 }).withDefaultsWhenPresent()
    const { clear, keep } = await writePaired({ record: nullable }, {
      initial: { record: { a: '4' } },
      write: q => q.patch({ record: { a: null } }),
    })

    for (const run of [clear, keep]) {
      expect(run.url).toEqual({})
      expect(run.values.record).toBeUndefined()
    }
  })
})

describe('default omission with null and normalization', () => {
  it('keeps JSON null as null with or without omission', async () => {
    const payload = queryParam('payload', codecs.json<{ id: number } | null>().withDefault(null))
    const { clear, keep } = await writePaired({ payload }, {
      write: q => q.patch({ payload: null }),
    })

    expect(clear.url).toEqual({})
    expect(clear.values.payload).toBeNull()
    expect(keep.url).toEqual({ payload: 'null' })
    expect(keep.values.payload).toBeNull()
  })

  it('preserves a nested runtime null in both write paths and lets an explicit child win', async () => {
    const object = queryParam.object('record', {
      a: queryParam('a', codecs.integer.nullable().withDefault(2)),
      b: queryParam('b', codecs.integer),
    })
    const nullWrite = await writePaired({ record: object }, {
      initial: { record: { a: '7' } },
      defaults: { record: { a: null } },
      write: q => q.patch({ record: { a: null } }),
    })
    const valueWrite = await writePaired({ record: object }, {
      defaults: { record: { a: null } },
      write: q => q.patch({ record: { a: 5 } }),
    })

    for (const run of [nullWrite.clear, nullWrite.keep]) {
      expect(run.values.record).toEqual({ a: null })
    }
    for (const run of [valueWrite.clear, valueWrite.keep]) {
      expect(run.values.record).toEqual({ a: 5 })
    }
  })

  it('reveals a non-null default after a nullable null write in both paths', async () => {
    const page = queryParam('page', codecs.integer.nullable().withDefault(2))
    const { clear, keep } = await writePaired({ page }, {
      initial: { page: '5' },
      write: q => q.patch({ page: null }),
    })

    for (const run of [clear, keep]) {
      expect(run.url).toEqual({})
      expect(run.values.page).toBe(2)
    }
  })

  it('decides eligibility from the normal serialization, not the setter argument', async () => {
    const shifted = createCodec<number>({
      parse: raw => (raw === undefined ? undefined : Number(raw)),
      serialize: value => String(value + 1),
    })
    const n = queryParam('n', shifted.withDefault(1))
    const { clear, keep } = await writePaired({ n }, {
      write: q => q.patch({ n: 1 }),
    })

    for (const run of [clear, keep]) {
      expect(run.url).toEqual({ n: '2' })
      expect(run.values.n).toBe(2)
    }
  })

  it('treats a codec-normalized value equal to the candidate as eligible', async () => {
    const capped = createCodec<number>({
      parse: raw => (raw === undefined ? undefined : Number(raw)),
      serialize: value => String(Math.min(value, 7)),
    })
    const n = queryParam('n', capped.withDefault(7))
    const { clear, keep } = await writePaired({ n }, {
      write: q => q.patch({ n: 8 }),
    })

    expect(clear.url).toEqual({})
    expect(clear.values.n).toBe(7)
    expect(keep.url).toEqual({ n: '7' })
    expect(keep.values.n).toBe(7)
  })
})

describe('default omission with transformed params', () => {
  const range = () => queryParam.object('range', {
    a: queryParam('a', codecs.integer.withDefault(0)),
    b: queryParam('b', codecs.integer.withDefault(100)),
  })
  const text = {
    read: (value: { a: number, b: number }) => `${value.a}:${value.b}`,
    write: (value: string) => {
      const [a, b] = value.split(':').map(Number)
      return { a, b }
    },
  }

  it('keeps a transformed output default atomic during omission', async () => {
    const hash = queryParam('n', codecs.integer)
      .transform<string>({ read: v => `#${v}`, write: v => Number(v.slice(1)) })
    const { clear, keep } = await writePaired({ hash }, {
      defaults: { hash: '#20' },
      write: q => q.patch({ hash: '#20' }),
    })

    expect(clear.url).toEqual({})
    expect(clear.values.hash).toBe('#20')
    expect(keep.url).toEqual({ n: '20' })
    expect(keep.values.hash).toBe('#20')
  })

  it.each([
    ['own default before the gate', () => range().withDefault({ a: 0, b: 100 }).withDefaultsWhenPresent()],
    ['gate before the own default', () => range().withDefaultsWhenPresent().withDefault({ a: 0, b: 100 })],
  ])('cannot justify omission through a gated input candidate with %s', async (_name, build) => {
    const { clear, keep } = await writePaired({ text: build().transform(text) }, {
      write: q => q.patch({ text: '0:100' }),
    })

    for (const run of [clear, keep]) {
      expect(run.url).toEqual({ range: { a: '0', b: '100' } })
      expect(run.values.text).toBe('0:100')
    }
  })

  it('lets an independent output default make omission safe', async () => {
    const param = range().withDefaultsWhenPresent().transform(text).withDefault('0:100')
    const { clear, keep } = await writePaired({ text: param }, {
      write: q => q.patch({ text: '0:100' }),
    })

    expect(clear.url).toEqual({})
    expect(clear.values.text).toBe('0:100')
    expect(keep.url).toEqual({ range: { a: '0', b: '100' } })
    expect(keep.values.text).toBe('0:100')
  })
})

describe('default omission with composed pipelines', () => {
  const projections = ['explicit', 'defaults', 'resolved'] as const

  it('compares one value domain when the write and read projections differ', async () => {
    const textSchema = defineQuerySchema({ s: queryParam('s', codecs.string.withDefault('default')) })
    const lowerWriteUpperRead = (core: QueryCore<typeof textSchema>): QueryModuleResult => ({
      api: {},
      pipeline: [
        core.pipeline.define('write', values => ({ ...values, s: values.s?.toLowerCase() })),
        ...projections.map(projection => core.pipeline.define('read', values => ({ ...values, s: values.s?.toUpperCase() }), { projection })),
      ],
    })

    const { clear, keep } = await writePaired(textSchema, {
      modules: [lowerWriteUpperRead],
      write: q => q.patch({ s: 'DEFAULT' }),
    })

    expect(clear.url).toEqual({})
    expect(clear.values.s).toBe('DEFAULT')
    expect(keep.url).toEqual({ s: 'default' })
    expect(keep.values.s).toBe('DEFAULT')
  })

  it('does not treat a hidden non-default write as default-equal', async () => {
    const count = queryParam('n', codecs.integer.withDefault(1))
    const hideExplicit: ModuleSetup = core => ({
      api: {},
      pipeline: [core.pipeline.define('read', ({ n: _n, ...rest }) => rest, { projection: 'explicit', presence: { optional: [['n']] } })],
    })

    const { clear, keep } = await writePaired({ n: count }, {
      modules: [hideExplicit],
      write: q => q.patch({ n: 5 }),
    })

    for (const run of [clear, keep]) {
      expect(run.url).toEqual({ n: '5' })
      expect(run.values.n).toBe(5)
    }
  })

  it('compares the projected explicit value with the projected candidate, then the complete final reads', async () => {
    const textSchema = defineQuerySchema({ s: queryParam('s', codecs.string.withDefault('default')) })
    const upper = (core: QueryCore<typeof textSchema>, projections: ReadonlyArray<'explicit' | 'defaults' | 'resolved'>): QueryModuleResult => ({
      api: {},
      pipeline: projections.map(projection =>
        core.pipeline.define('read', values => ({ ...values, s: values.s?.toUpperCase() }), { projection }),
      ),
    })

    // Eligibility compares 'DEFAULT' with 'DEFAULT', and the resolved reads agree, so omission proceeds.
    const all = await writePaired(textSchema, {
      modules: [core => upper(core, projections)],
      write: q => q.patch({ s: 'DEFAULT' }),
    })

    expect(all.clear.url).toEqual({})
    expect(all.keep.url).toEqual({ s: 'DEFAULT' })
    expect(all.clear.values.s).toBe('DEFAULT')
    expect(all.keep.values.s).toBe('DEFAULT')

    // The same eligibility is not enough alone: the resolved reads 'DEFAULT' and 'default' differ, so the write stays.
    const partial = await writePaired(textSchema, {
      modules: [core => upper(core, ['explicit', 'defaults'])],
      write: q => q.patch({ s: 'DEFAULT' }),
    })

    for (const run of [partial.clear, partial.keep]) {
      expect(run.url).toEqual({ s: 'DEFAULT' })
      expect(run.values.s).toBe('DEFAULT')
    }
  })

  it('judges every affected read when a changed sibling restores a gated object', async () => {
    const record = queryParam.object('record', { a: queryParam('a', codecs.integer.withDefault(1)) }).withDefaultsWhenPresent()
    const flag = queryParam('flag', codecs.boolean.withDefault(false))
    const fillWhenFlagged: ModuleSetup = core => ({
      api: {},
      pipeline: [
        core.pipeline.define('read', values => values.flag === true && values.record === undefined ? { ...values, record: { a: 1 } } : values, { projection: 'resolved' }),
      ],
    })

    const { clear, keep } = await writePaired({ record, flag }, {
      modules: [fillWhenFlagged],
      write: q => q.patch({ record: { a: 1 }, flag: true }),
    })

    expect(clear.url).toEqual({ flag: 'true' })
    expect(clear.values).toEqual({ record: { a: 1 }, flag: true })
    expect(keep.url).toEqual({ record: { a: '1' }, flag: 'true' })
    expect(keep.values).toEqual({ record: { a: 1 }, flag: true })
  })

  it('retains both objects when each omission is safe alone but unsafe together', async () => {
    const gated = () => queryParam.object('g', { n: queryParam('n', codecs.integer.withDefault(1)) }).withDefaultsWhenPresent()
    const schema = { a: gated(), b: queryParam.object('h', { n: queryParam('n', codecs.integer.withDefault(1)) }).withDefaultsWhenPresent() }
    const restoreFromSibling: ModuleSetup = core => ({
      api: {},
      pipeline: [
        core.pipeline.define('read', (values) => {
          if (values.a === undefined && values.b === undefined) {
            return values
          }

          return { ...values, a: values.a ?? { n: 1 }, b: values.b ?? { n: 1 } }
        }, { projection: 'resolved' }),
      ],
    })

    const { clear, keep } = await writePaired(schema, {
      modules: [restoreFromSibling],
      write: q => q.patch({ a: { n: 1 }, b: { n: 1 } }),
    })

    for (const run of [clear, keep]) {
      expect(run.url).toEqual({ g: { n: '1' }, h: { n: '1' } })
      expect(run.values).toEqual({ a: { n: 1 }, b: { n: 1 } })
    }
  })

  it.each([
    ['active params first', true],
    ['active params last', false],
  ])('retains the presence an inactive gated object needs (%s)', async (_name, activeFirst) => {
    const record = queryParam.object('record', {
      a: queryParam('a', codecs.integer.withDefault(0)),
      b: queryParam('b', codecs.integer.withDefault(100)),
    }).withDefaultsWhenPresent().withDefault({ a: 0, b: 100 })

    for (const clearOnDefault of [true, false]) {
      const test = withTestQuery({})
      const q = test.build(() => {
        const base = useQueryStates({ record }, { clearOnDefault })

        return activeFirst
          ? base.use(withActiveParams()).use(withRuntimeDefaults())
          : base.use(withRuntimeDefaults()).use(withActiveParams())
      })

      q.patch({ record: { a: 0, b: 100 } })
      await new Promise(resolve => setTimeout(resolve, 0))

      expect(test.query.value).toEqual({ record: { a: '0', b: '100' } })
      expect(q.values.record).toEqual({ a: 0, b: 100 })
      expect(q.isActive('record')).toBe(false)
      test.dispose()
    }
  })
})

describe('default omission is local to the writing binding', () => {
  const schema = { value: queryParam('value', codecs.integer) }

  async function writeA(clearOnDefault: boolean, mountObserver: boolean) {
    const test = withTestQuery({})
    const a = test.build(() => useQueryStates(schema, { clearOnDefault }).use(withRuntimeDefaults()))
    const b = mountObserver ? test.build(() => useQueryStates(schema).use(withRuntimeDefaults())) : undefined

    a.setDefaults({ value: 5 })
    b?.setDefaults({ value: 9 })
    a.patch({ value: 5 })
    await new Promise(resolve => setTimeout(resolve, 0))

    const result = { url: structuredClone(test.query.value), a: a.values.value, b: b?.values.value }
    test.dispose()

    return result
  }

  it('lets another binding reveal a different fallback without blocking the safe omission', async () => {
    const clear = await writeA(true, true)
    const keep = await writeA(false, true)

    expect(clear).toEqual({ url: {}, a: 5, b: 9 })
    expect(keep).toEqual({ url: { value: '5' }, a: 5, b: 5 })
  })

  it('decides the same with or without the observer mounted', async () => {
    for (const clearOnDefault of [true, false]) {
      const alone = await writeA(clearOnDefault, false)
      const observed = await writeA(clearOnDefault, true)

      expect(observed.url).toEqual(alone.url)
      expect(observed.a).toBe(alone.a)
    }
  })

  it('leaves the observer\'s registered defaults untouched by the evaluation', async () => {
    const test = withTestQuery({})
    const a = test.build(() => useQueryStates(schema, { clearOnDefault: true }).use(withRuntimeDefaults()))
    const b = test.build(() => useQueryStates(schema).use(withRuntimeDefaults()))

    a.setDefaults({ value: 5 })
    b.setDefaults({ value: 9 })
    a.patch({ value: 5 })
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(a.defaults).toEqual({ value: 5 })
    expect(b.defaults).toEqual({ value: 9 })
    test.dispose()
  })
})

describe('default omission across write interfaces', () => {
  const schema = { page: queryParam('page', codecs.integer.withDefault(1)) }
  const writers: Array<[string, (q: ReturnType<typeof mount<typeof schema>>['q']) => void]> = [
    ['a values assignment', (q) => { q.values.page = 1 }],
    ['patch', q => q.patch({ page: 1 })],
    ['replace', q => q.replace({ page: 1 })],
    ['toQueryRefs', (q) => { toQueryRefs(q).page.value = 1 }],
    ['toQueryRef', (q) => { toQueryRef(q).value = { page: 1 } }],
  ]

  it.each(writers)('applies the same omission through %s', async (_name, write) => {
    const { clear, keep } = await writePaired(schema, { write })

    expect(clear.url).toEqual({})
    expect(clear.values.page).toBe(1)
    expect(keep.url).toEqual({ page: '1' })
    expect(keep.values.page).toBe(1)
  })

  it.each([true, false])('applies the same omission through the single-param setter (clearOnDefault: %s)', async (clearOnDefault) => {
    const test = withTestQuery({})
    const page = test.build(() => useQueryState('page', codecs.integer.withDefault(1), { clearOnDefault }))

    page.set(1)
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(test.query.value).toEqual(clearOnDefault ? {} : { page: '1' })
    expect(page.value).toBe(1)
    test.dispose()
  })
})
