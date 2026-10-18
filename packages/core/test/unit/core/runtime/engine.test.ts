import type { ParsedQuery } from '../../../../src/core/query/types'
import type { QueryStateSchema } from '../../../../src/core/schema/schema'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { effectScope, ref, watch } from 'vue'
import { createTestingAdapter } from '../../../../src/adapters/testing'
import { codecs } from '../../../../src/core/codecs/catalog'
import { createCodec } from '../../../../src/core/codecs/codec'
import { addDebugReporter } from '../../../../src/core/diagnostics/bus'
import { createQueryStateEngine } from '../../../../src/core/runtime/engine'
import { queryParam } from '../../../../src/core/schema/params/query-param'
import { installContributions, installRead, installWrite } from '../../../helpers/pipeline'

const flush = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0))

// createQueryStateEngine is public API (exported from the package root) for
// consumers building their own composable on top of it. useQueryState(s) always
// goes through the binding layer, which pre-resolves clearOnDefault before the
// schema reaches the engine, so its own fallback chain needs its own direct
// coverage here.
function setup(schema: Parameters<typeof createQueryStateEngine>[0]['schema'], engineOptions: Partial<Parameters<typeof createQueryStateEngine>[0]> = {}, existing?: ReturnType<typeof createTestingAdapter>) {
  const adapter = existing ?? createTestingAdapter({ hasMemory: true })
  const scope = effectScope()
  onTestFinished(() => {
    try {
      scope.stop()
    }
    finally {
      adapter.resetQueue()
    }
  })
  const engine = scope.run(() => createQueryStateEngine({
    id: 'test',
    schema,
    adapter,
    ...engineOptions,
  }))!

  return { adapter, engine, scope }
}

describe('createQueryStateEngine', () => {
  describe('clearOnDefault precedence', () => {
    const schema = { page: queryParam('page', codecs.integer.withDefault(1)) }

    it('falls back to the adapter-level default when nothing more specific is set', async () => {
      const { adapter, engine, scope } = setup(schema, { adapterClearOnDefault: false })

      engine.query.transact({ mode: 'patch', values: { page: 1 } })
      await flush()

      expect(adapter.query.value).toEqual({ page: '1' })
      scope.stop()
    })

    it('falls back to true when neither the instance nor the adapter set it', async () => {
      const { adapter, engine, scope } = setup(schema)

      engine.query.transact({ mode: 'patch', values: { page: 1 } })
      await flush()

      expect(adapter.query.value).toEqual({})
      scope.stop()
    })

    it('the instance-level option overrides the adapter default', async () => {
      const { adapter, engine, scope } = setup(schema, { clearOnDefault: true, adapterClearOnDefault: false })

      engine.query.transact({ mode: 'patch', values: { page: 1 } })
      await flush()

      expect(adapter.query.value).toEqual({})
      scope.stop()
    })

    it('compares writes with the resolved default after the read pipeline', async () => {
      const transformedSchema = { q: queryParam('q', codecs.string.withDefault('default')) }
      const { adapter, engine, scope } = setup(transformedSchema)
      installRead(engine, values => ({
        ...values,
        q: typeof values.q === 'string' ? values.q.toUpperCase() : values.q,
      }))
      installWrite(engine, values => ({
        ...values,
        q: typeof values.q === 'string' ? values.q.toLowerCase() : values.q,
      }))

      engine.query.transact({ mode: 'patch', values: { q: 'DEFAULT' } })
      await flush()

      expect(adapter.query.value).toEqual({})
      scope.stop()
    })
  })

  describe('param-level clearOnDefault precedence', () => {
    it('lets the binding option override a keep-on-default param', async () => {
      const { adapter, engine, scope } = setup({ page: queryParam('page', codecs.integer.withDefault(1)).keepOnDefault() }, { clearOnDefault: true })

      engine.query.transact({ mode: 'patch', values: { page: 1 } })
      await flush()

      expect(adapter.query.value).toEqual({})
      scope.stop()
    })

    it('lets the param policy override the adapter baseline', async () => {
      const { adapter, engine, scope } = setup(
        { page: queryParam('page', codecs.integer.withDefault(1)).keepOnDefault() },
        { adapterClearOnDefault: true },
      )

      engine.query.transact({ mode: 'patch', values: { page: 1 } })
      await flush()

      expect(adapter.query.value).toEqual({ page: '1' })
      scope.stop()
    })

    it('keeps explicit clears and codec omission when automatic omission is disabled', async () => {
      const nullable = queryParam('n', codecs.integer.withDefault(2).nullable())
      const { adapter, engine, scope } = setup({ page: queryParam('page', codecs.integer.withDefault(1)), n: nullable }, { clearOnDefault: false })
      adapter.query.value = { page: '3', n: '7' }

      engine.query.transact({ mode: 'patch', values: { page: undefined, n: null } })
      await flush()

      expect(adapter.query.value).toEqual({})
      scope.stop()
    })

    it('does not read the complete state when the transaction preserves explicit values', async () => {
      const { adapter, engine, scope } = setup({ page: queryParam('page', codecs.integer.withDefault(1)) })
      const read = vi.fn((values: Record<string, unknown>) => values)
      installRead(engine, read)
      read.mockClear()

      engine.query.transact({ mode: 'patch', values: { page: 1 }, defaultPolicy: 'preserve-explicit' })
      await flush()

      expect(read).not.toHaveBeenCalled()
      expect(adapter.query.value).toEqual({ page: '1' })
      scope.stop()
    })
  })

  describe('value resolution', () => {
    it('retains the keys and static defaults captured at creation', () => {
      const schema: QueryStateSchema = { page: queryParam('page', codecs.integer.withDefault(1)) }
      const { adapter, engine, scope } = setup(schema)

      try {
        expect(engine.state.values.value).toEqual({ page: 1 })
        schema.page = queryParam('page', codecs.integer.withDefault(9))
        schema.extra = queryParam('extra', codecs.string.withDefault('late'))
        adapter.query.value = { page: '2', extra: 'incoming' }

        expect(engine.state.values.value).toEqual({ page: 2 })
        adapter.query.value = {}
        expect(engine.state.values.value).toEqual({ page: 1 })
      }
      finally {
        scope.stop()
      }
    })

    it('runs the read pipeline after resolving values and defaults', () => {
      const { adapter, engine, scope } = setup({ page: queryParam('page', codecs.integer.withDefault(1)) })
      installRead(engine, values => ({ ...values, page: Number(values.page) + 10 }))

      try {
        expect(engine.defaults.candidates.value).toEqual({ page: 11 })
        expect(engine.state.values.value).toEqual({ page: 11 })
        adapter.query.value = { page: '2' }
        expect(engine.state.values.value).toEqual({ page: 12 })
      }
      finally {
        scope.stop()
      }
    })
  })

  describe('optimistic overlay', () => {
    it('reflects a pending clear before the URL catches up', () => {
      const schema = { q: queryParam('q', codecs.string) }
      const { adapter, engine, scope } = setup(schema)
      adapter.query.value = { q: 'phone' }

      engine.query.transact({ mode: 'patch', values: { q: undefined } })

      expect(engine.state.explicitValues.value.q).toBeUndefined()
      scope.stop()
    })
  })

  describe('schema validation', () => {
    it('rejects duplicate paths for direct engine callers', () => {
      const clashing = {
        first: queryParam('shared', codecs.string),
        second: queryParam('shared', codecs.string),
      }

      expect(() => setup(clashing)).toThrow('duplicate query path "shared"')
    })
  })

  describe('default omission evaluation', () => {
    const schema = { page: queryParam('page', codecs.integer.withDefault(1)) }

    it('runs the write pipeline once per param while evaluating the omission alternative', async () => {
      const { adapter, engine, scope } = setup(schema)
      const write = vi.fn((values: Record<string, unknown>) => values)
      installWrite(engine, write)

      engine.query.transact({ mode: 'patch', values: { page: 1 } })
      await flush()

      expect(write).toHaveBeenCalledTimes(1)
      expect(adapter.query.value).toEqual({})
      scope.stop()
    })

    it('judges safety against the complete read of each evaluated representation', async () => {
      const gated = () => queryParam.object('g', { n: queryParam('n', codecs.integer.withDefault(1)) }).withDefaultsWhenPresent()
      const { adapter, engine, scope } = setup({ a: gated(), b: queryParam.object('h', { n: queryParam('n', codecs.integer.withDefault(1)) }).withDefaultsWhenPresent() })
      // Either gated object fills the other while at least one exists.
      installRead(engine, (values) => {
        const filler = values.a ?? values.b

        return filler === undefined ? values : { a: filler, b: filler }
      })

      engine.query.transact({ mode: 'patch', values: { a: { n: 1 }, b: { n: 1 } } })
      await flush()

      expect(adapter.query.value).toEqual({ g: { n: '1' }, h: { n: '1' } })
      scope.stop()
    })

    it('keeps the prepared normal write when only the additional evaluation fails', async () => {
      const { adapter, engine, scope } = setup(schema)
      let writing = false
      installRead(engine, (values) => {
        if (writing) {
          throw new Error('evaluation failed')
        }

        return values
      })
      installWrite(engine, (values) => {
        writing = true

        return values
      })

      engine.query.transact({ mode: 'patch', values: { page: 1 } })
      await flush()

      expect(adapter.query.value).toEqual({ page: '1' })
      scope.stop()
    })

    it('publishes nothing when the normal write preparation fails', async () => {
      const { adapter, engine, scope } = setup(schema)
      installWrite(engine, () => {
        throw new Error('write failed')
      })

      expect(() => engine.query.transact({ mode: 'patch', values: { page: 1 } })).toThrow('write failed')
      await flush()

      expect(adapter.query.value).toEqual({})
      scope.stop()
    })

    it('rejects an alternative whose read violates a presence contract and keeps the normal write', async () => {
      const { adapter, engine, scope } = setup(schema)
      adapter.query.value = { page: '3' }
      // Removes `page` without permission, but only while the evaluated query lacks it.
      installContributions(engine, {
        pipeline: [engine.pipeline.define('read', ((values: Record<string, unknown>, context: { query: Record<string, unknown> }) =>
          context.query.page === undefined ? { ...values, page: undefined } : values) as never, {
          projection: 'resolved',
        } as never)],
      })

      engine.query.transact({ mode: 'patch', values: { page: 1 } })
      await flush()

      expect(adapter.query.value).toEqual({ page: '1' })
      scope.stop()
    })

    it('emits no speculative write or parse events for the evaluated alternatives', async () => {
      const codes: string[] = []
      onTestFinished(addDebugReporter(event => codes.push(event.code)))
      const { adapter, engine, scope } = setup(schema)
      adapter.query.value = { page: 'bad' }

      engine.query.transact({ mode: 'patch', values: { page: 1 } })
      await flush()

      expect(codes.filter(code => code === 'binding:set')).toHaveLength(1)
      expect(codes.filter(code => code === 'engine:clear-on-default')).toHaveLength(1)
      expect(codes.filter(code => code === 'engine:parse-miss').length).toBeLessThanOrEqual(1)
      scope.stop()
    })

    it('emits the write event without a clear-on-default decision when nothing is omitted', async () => {
      const codes: string[] = []
      onTestFinished(addDebugReporter(event => codes.push(event.code)))
      const { adapter, engine, scope } = setup(schema)

      engine.query.transact({ mode: 'patch', values: { page: 5 } })
      await flush()

      expect(codes).toContain('binding:set')
      expect(codes).not.toContain('engine:clear-on-default')
      expect(adapter.query.value).toEqual({ page: '5' })
      scope.stop()
    })

    it('skips omission evaluation when the effective policy disables it', async () => {
      const { adapter, engine, scope } = setup(schema, { clearOnDefault: false })
      const read = vi.fn((values: Record<string, unknown>) => values)
      installRead(engine, read)
      read.mockClear()

      engine.query.transact({ mode: 'patch', values: { page: 1 } })
      await flush()

      expect(read).not.toHaveBeenCalled()
      expect(adapter.query.value).toEqual({ page: '1' })
      scope.stop()
    })

    it.each(['binding', 'param', 'request'] as const)('does not evaluate default sources when omission is disabled by the %s', async (policy) => {
      const page = queryParam('page', codecs.integer.withDefault(1))
      const { adapter, engine } = setup(
        { page: policy === 'param' ? page.keepOnDefault() : page },
        policy === 'binding' ? { clearOnDefault: false } : {},
      )
      const source = vi.fn(() => {
        throw new Error('default source must stay lazy')
      })
      const read = vi.fn((values: Record<string, unknown>) => values)
      installContributions(engine, { defaults: [source] })
      installRead(engine, read)

      engine.query.transact({
        mode: 'patch',
        values: { page: 1 },
        ...(policy === 'request' ? { defaultPolicy: 'preserve-explicit' as const } : {}),
      })
      await flush()

      expect(source).not.toHaveBeenCalled()
      expect(read).not.toHaveBeenCalled()
      expect(adapter.query.value).toEqual({ page: '1' })
    })

    it('skips default sources, pipelines and publication for an empty patch', async () => {
      const { adapter, engine } = setup(schema)
      const source = vi.fn(() => ({ page: 1 }))
      const read = vi.fn((values: Record<string, unknown>) => values)
      const write = vi.fn((values: Record<string, unknown>) => values)
      const start = vi.fn()
      installContributions(engine, { defaults: [source] })
      installRead(engine, read)
      installWrite(engine, write)
      engine.query.transactions.observe({ start })

      engine.query.transact({ mode: 'patch', values: {} })
      await flush()

      expect(source).not.toHaveBeenCalled()
      expect(read).not.toHaveBeenCalled()
      expect(write).not.toHaveBeenCalled()
      expect(start).not.toHaveBeenCalled()
      expect(adapter.query.value).toEqual({})
    })

    it('keeps the normal write when a default source fails but propagates the failure on a real read', async () => {
      const { adapter, engine } = setup(schema)
      const failure = new Error('default source failed')
      const source = vi.fn(() => {
        throw failure
      })
      installContributions(engine, { defaults: [source] })

      expect(() => engine.query.transact({ mode: 'patch', values: { page: 1 } })).not.toThrow()
      await flush()

      expect(source).toHaveBeenCalled()
      expect(adapter.query.value).toEqual({ page: '1' })
      expect(() => engine.state.values.value).toThrow(failure)
    })

    it('uses the complete normal query for explicit omission classification', async () => {
      const { adapter, engine } = setup({ page: queryParam('page', codecs.integer.withDefault(1)) })
      adapter.query.value = { flag: 'show' }
      expect(engine.state.values.value.page).toBe(1)
      installContributions(engine, { pipeline: [
        engine.pipeline.define('read', (values, context) => context.query.flag === 'hide' ? {} : values, {
          projection: 'explicit',
          presence: { optional: [['page']] },
        }),
      ] })

      adapter.query.value = { flag: 'hide' }
      engine.query.transact({ mode: 'patch', values: { page: 1 } })
      await flush()

      expect(adapter.query.value).toEqual({ flag: 'hide', page: '1' })
    })

    it('reports the default candidate used for the normal representation without projecting it again', async () => {
      const { adapter, engine } = setup({
        page: queryParam('page', codecs.integer.withDefault(1)),
        mode: queryParam('mode', codecs.string),
      })
      adapter.query.value = { mode: 'old' }
      const defaults = vi.fn((values: Record<string, unknown>, context: { query: ParsedQuery }) => ({
        ...values,
        page: context.query.mode === 'mirror' ? 2 : 1,
      }))
      installContributions(engine, { pipeline: [
        engine.pipeline.define('read', defaults, { projection: 'defaults' }),
        engine.pipeline.define('read', (values, context) => ({
          ...values,
          page: context.query.mode === 'mirror' ? 2 : values.page,
        }), { projection: 'resolved' }),
      ] })
      expect(engine.defaults.candidates.value.page).toBe(1)
      defaults.mockClear()
      const decisions: unknown[] = []
      onTestFinished(addDebugReporter((event) => {
        if (event.code === 'engine:clear-on-default') {
          decisions.push(event.data)
        }
      }))

      engine.query.transact({ mode: 'patch', values: { page: 2, mode: 'mirror' } })

      expect(defaults).toHaveBeenCalledOnce()
      expect(decisions).toEqual([expect.objectContaining({ key: 'page', defaultValue: 2 })])
      await flush()
      expect(adapter.query.value).toEqual({ mode: 'mirror' })
      expect(engine.state.values.value.page).toBe(2)
    })

    it('preserves the same read with and without omission when a sibling write supplies query context', async () => {
      const create = (clearOnDefault: boolean) => {
        const adapter = createTestingAdapter({ hasMemory: true, searchParams: { flag: 'off' } })
        const record = queryParam.object('record', { n: queryParam('n', codecs.integer.withDefault(1)) }).withDefaultsWhenPresent()
        const { engine } = setup({ record }, { clearOnDefault }, adapter)
        const { engine: sibling } = setup({ flag: queryParam('flag', codecs.string) }, {}, adapter)
        installContributions(engine, { pipeline: [
          engine.pipeline.define('read', (values, context) => context.query.flag === 'on' && values.record === undefined
            ? { ...values, record: { n: 1 } }
            : values, { projection: 'resolved' }),
        ] })
        return { adapter, engine, sibling }
      }
      const omitted = create(true)
      const retained = create(false)

      for (const binding of [omitted, retained]) {
        expect(binding.engine.state.values.value.record).toBeUndefined()
        binding.sibling.query.transact({ mode: 'patch', values: { flag: 'on' } })
        binding.engine.query.transact({ mode: 'patch', values: { record: { n: 1 } } })
        expect(binding.engine.state.values.value.record).toEqual({ n: 1 })
      }

      await flush()

      expect(omitted.adapter.query.value).toEqual({ flag: 'on' })
      expect(retained.adapter.query.value).toEqual({ flag: 'on', record: { n: '1' } })
      expect(omitted.engine.state.values.value).toEqual(retained.engine.state.values.value)
    })

    it('reads the complete sibling context changed by the same request', async () => {
      const { adapter, engine, scope } = setup({
        record: queryParam.object('record', { a: queryParam('a', codecs.integer.withDefault(1)) }).withDefaultsWhenPresent(),
        flag: queryParam('flag', codecs.boolean),
      })
      // The projection supplies a missing record only while the flag is true.
      installRead(engine, values => (values.flag === true && values.record === undefined
        ? { ...values, record: { a: 1 } }
        : values))

      engine.query.transact({ mode: 'patch', values: { record: { a: 1 }, flag: true } })
      await flush()

      expect(adapter.query.value).toEqual({ flag: 'true' })
      expect(engine.state.values.value).toEqual({ record: { a: 1 }, flag: true })
      scope.stop()
    })

    it('retains the record when the flag that restores it is not part of the read', async () => {
      const { adapter, engine, scope } = setup({
        record: queryParam.object('record', { a: queryParam('a', codecs.integer.withDefault(1)) }).withDefaultsWhenPresent(),
        flag: queryParam('flag', codecs.boolean),
      })
      installRead(engine, values => (values.flag === true && values.record === undefined
        ? { ...values, record: { a: 1 } }
        : values))

      engine.query.transact({ mode: 'patch', values: { record: { a: 1 } } })
      await flush()

      expect(adapter.query.value).toEqual({ record: { a: '1' } })
      scope.stop()
    })

    it('evaluates against a fresh base that includes earlier pending writes', async () => {
      const { adapter, engine, scope } = setup({
        record: queryParam.object('record', { a: queryParam('a', codecs.integer.withDefault(1)) }).withDefaultsWhenPresent(),
        flag: queryParam('flag', codecs.boolean),
      })
      installRead(engine, values => (values.flag === true && values.record === undefined
        ? { ...values, record: { a: 1 } }
        : values))

      // The flag is still pending when the record write is evaluated.
      engine.query.transact({ mode: 'patch', values: { flag: true } })
      engine.query.transact({ mode: 'patch', values: { record: { a: 1 } } })
      await flush()

      expect(adapter.query.value).toEqual({ flag: 'true' })
      scope.stop()
    })
  })

  describe('write query capture', () => {
    it('includes committed changes outside the binding after its read cache is populated', async () => {
      const { adapter, engine } = setup({ q: queryParam('q', codecs.string) }, { clearOnDefault: false })
      adapter.query.value = { q: 'initial', flag: 'old' }
      expect(engine.state.values.value.q).toBe('initial')
      installWrite(engine, (values, context) => ({ ...values, q: context.query.flag }))

      adapter.query.value = { q: 'initial', flag: 'new' }
      engine.query.transact({ mode: 'patch', values: { q: 'requested' } })
      await flush()

      expect(adapter.query.value).toEqual({ q: 'new', flag: 'new' })
    })

    it.each(['pending', 'simulated'] as const)('includes another binding\'s %s nested writes and clears', async (phase) => {
      const adapter = createTestingAdapter({
        hasMemory: false,
        searchParams: { q: 'initial', meta: { flag: 'old', removed: 'old', keep: 'kept' } },
      })
      const { engine } = setup({ q: queryParam('q', codecs.string) }, { clearOnDefault: false }, adapter)
      const { engine: sibling } = setup({
        flag: queryParam('meta.flag', codecs.string),
        removed: queryParam('meta.removed', codecs.string),
      }, { clearOnDefault: false }, adapter)
      expect(engine.state.values.value.q).toBe('initial')
      const contexts: ParsedQuery[] = []
      installWrite(engine, (values, context) => {
        contexts.push(context.query)
        return { ...values, q: 'new' }
      })
      installWrite(engine, (values, context) => {
        contexts.push(context.query)
        return values
      })

      sibling.query.transact({ mode: 'patch', values: { flag: 'new', removed: undefined } })
      if (phase === 'simulated') {
        await flush()
      }
      engine.query.transact({ mode: 'patch', values: { q: 'requested' } })

      expect(contexts).toEqual([
        { q: 'initial', meta: { flag: 'new', keep: 'kept' } },
        { q: 'initial', meta: { flag: 'new', keep: 'kept' } },
      ])
      expect(contexts[0]).toBe(contexts[1])
      await flush()
      expect(engine.state.values.value.q).toBe('new')
    })
  })

  describe('read descriptor contexts', () => {
    const schema = { page: queryParam('page', codecs.integer.withDefault(1)) }

    it('hands each read projection the query it is evaluated against', async () => {
      const { adapter, engine, scope } = setup(schema)
      const seen: Array<{ projection: string, query: unknown }> = []
      installContributions(engine, {
        pipeline: (['explicit', 'defaults', 'resolved'] as const).map(projection =>
          engine.pipeline.define('read', ((values: Record<string, unknown>, context: { projection: string, query: unknown }) => {
            seen.push({ projection: context.projection, query: context.query })

            return values
          }) as never, { projection } as never),
        ),
      })
      adapter.query.value = { page: '4' }

      void engine.state.values.value
      void engine.state.explicitValues.value
      void engine.defaults.candidates.value

      expect(seen.map(entry => entry.projection).sort()).toEqual(['defaults', 'explicit', 'resolved'])
      expect(seen.every(entry => (entry.query as { page?: string }).page === '4')).toBe(true)
      scope.stop()
    })

    it('evaluates the normal and omitted representations against their own queries', async () => {
      const { adapter, engine, scope } = setup(schema)
      const queries: Array<Record<string, unknown>> = []
      installContributions(engine, {
        pipeline: [engine.pipeline.define('read', ((values: Record<string, unknown>, context: { query: Record<string, unknown> }) => {
          queries.push({ ...context.query })

          return values
        }) as never, { projection: 'resolved' } as never)],
      })
      void engine.state.values.value
      queries.length = 0

      engine.query.transact({ mode: 'patch', values: { page: 1 } })
      await flush()

      expect(queries).toContainEqual({ page: '1' })
      expect(queries).toContainEqual({})
      expect(adapter.query.value).toEqual({})
      scope.stop()
    })
  })

  describe('lazy read query context', () => {
    it.each(['explicit', 'defaults', 'resolved'] as const)('updates the %s context without reparsing unchanged managed values', (projection) => {
      const parse = vi.fn((raw: unknown) => typeof raw === 'string' ? raw : undefined)
      const param = queryParam('q', createCodec({ parse, serialize: (value: string) => value })).withDefault('fallback')
      const { adapter, engine } = setup({ q: param })
      adapter.query.value = { q: 'initial', flag: 'old' }
      const contexts: unknown[] = []
      installContributions(engine, { pipeline: [
        engine.pipeline.define('read', (values, context) => {
          contexts.push(context.query, context.query)
          return { ...values, q: String(context.query.flag) }
        }, { projection }),
        engine.pipeline.define('read', (values, context) => {
          contexts.push(context.query)
          return values
        }, { projection }),
      ] })
      const view = projection === 'explicit'
        ? engine.state.explicitValues
        : projection === 'defaults' ? engine.defaults.candidates : engine.state.values

      expect(view.value.q).toBe('old')
      parse.mockClear()
      contexts.length = 0
      adapter.query.value = { q: 'initial', flag: 'new' }

      expect(view.value.q).toBe('new')
      expect(parse).not.toHaveBeenCalled()
      expect(contexts).toHaveLength(3)
      expect(contexts[0]).toEqual({ q: 'initial', flag: 'new' })
      expect(contexts[0]).toBe(contexts[1])
      expect(contexts[0]).toBe(contexts[2])
    })

    it('observes another binding\'s pending and simulated values through read context', async () => {
      const adapter = createTestingAdapter({ hasMemory: false, searchParams: { q: 'initial', flag: 'old' } })
      const { engine } = setup({ q: queryParam('q', codecs.string) }, {}, adapter)
      const { engine: sibling } = setup({ flag: queryParam('flag', codecs.string) }, {}, adapter)
      installRead(engine, (values, context) => ({ ...values, q: context.query.flag }))

      expect(engine.state.values.value.q).toBe('old')
      sibling.query.transact({ mode: 'patch', values: { flag: 'new' } })

      expect(engine.state.values.value.q).toBe('new')
      await flush()
      expect(engine.state.values.value.q).toBe('new')
      expect(adapter.query.value.flag).toBe('old')
    })

    it('keeps parsing and value-only projections cached across unrelated query changes', () => {
      const parse = vi.fn((raw: unknown) => typeof raw === 'string' ? raw : undefined)
      const param = queryParam('q', createCodec({ parse, serialize: (value: string) => value })).withDefault('fallback')
      const { adapter, engine } = setup({ q: param })
      const read = vi.fn((values: Record<string, unknown>) => values)
      installRead(engine, read)
      adapter.query.value = { q: 'initial', flag: 'old' }
      const before = [engine.state.explicitValues.value, engine.defaults.candidates.value, engine.state.values.value]
      parse.mockClear()
      read.mockClear()

      adapter.query.value = { q: 'initial', flag: 'new' }

      expect(engine.state.explicitValues.value).toBe(before[0])
      expect(engine.defaults.candidates.value).toBe(before[1])
      expect(engine.state.values.value).toBe(before[2])
      expect(parse).not.toHaveBeenCalled()
      expect(read).not.toHaveBeenCalled()
    })
  })

  describe('installed contributions', () => {
    const schema = { page: queryParam('page', codecs.integer.withDefault(1)) }

    it('follows a ref and a getter source without reinstalling', () => {
      const { engine, scope } = setup(schema)
      const fromRef = ref<Record<string, number>>({ page: 5 })
      const fromGetter = ref(7)

      installContributions(engine, { defaults: [fromRef] })
      expect(engine.defaults.candidates.value.page).toBe(5)

      fromRef.value = { page: 6 }
      expect(engine.defaults.candidates.value.page).toBe(6)

      installContributions(engine, { defaults: [() => ({ page: fromGetter.value })] })
      expect(engine.defaults.candidates.value.page).toBe(7)

      fromGetter.value = 8
      expect(engine.defaults.candidates.value.page).toBe(8)
      expect(engine.state.values.value.page).toBe(8)
      scope.stop()
    })

    it('keeps the lower default while a source supplies nothing', () => {
      const { engine, scope } = setup(schema)
      const source = ref<Record<string, number> | undefined>({ page: 5 })
      installContributions(engine, { defaults: [source] })

      expect(engine.defaults.candidates.value.page).toBe(5)

      source.value = undefined
      expect(engine.defaults.candidates.value.page).toBe(1)
      scope.stop()
    })

    it('gives a shared source one registration per occurrence and removes only the installation asked', () => {
      const { engine, scope } = setup(schema)
      const shared = ref({ page: 3 })
      const first = installContributions(engine, { defaults: [shared] })
      const second = installContributions(engine, { defaults: [shared, shared] })

      expect(first.id).not.toBe(second.id)
      expect(engine.installations.snapshot.value.map(entry => entry.defaults.length)).toEqual([1, 2])

      second.remove()
      expect(engine.installations.snapshot.value.map(entry => entry.id)).toEqual([first.id])

      shared.value = { page: 4 }
      expect(engine.defaults.candidates.value.page).toBe(4)
      scope.stop()
    })

    it('keeps source precedence in installation order, whichever source updates', () => {
      const { engine, scope } = setup(schema)
      const earlier = ref<Record<string, number>>({ page: 2 })
      const later = ref<Record<string, number>>({ page: 3 })
      installContributions(engine, { defaults: [earlier] })
      const second = installContributions(engine, { defaults: [later] })

      earlier.value = { page: 20 }
      expect(engine.state.values.value.page).toBe(3)

      later.value = {}
      expect(engine.state.values.value.page).toBe(20)

      later.value = { page: 30 }
      second.remove()
      expect(engine.state.values.value.page).toBe(20)
      scope.stop()
    })

    it('shows the candidate and resolved observations of one installation together', () => {
      const { engine, scope } = setup(schema)
      const seen: Array<{ candidate: unknown, resolved: unknown }> = []
      scope.run(() => watch(
        () => ({ candidate: engine.defaults.candidates.value.page, resolved: engine.state.values.value.page }),
        value => seen.push(value),
        { flush: 'sync' },
      ))

      installContributions(engine, {
        defaults: [{ page: 5 }],
        pipeline: [engine.pipeline.define('read', values => ({ ...values, page: (values.page ?? 0) + 100 }), { projection: 'resolved' })],
      })

      expect(seen).toEqual([{ candidate: 5, resolved: 105 }])
      scope.stop()
    })

    it('keeps bindings on the same adapter isolated from each other\'s installations', () => {
      const adapter = createTestingAdapter({ hasMemory: true })
      const first = setup(schema, { id: 'first' }, adapter)
      const second = setup(schema, { id: 'second' }, adapter)

      installContributions(first.engine, { defaults: [{ page: 5 }] })

      expect(first.engine.defaults.candidates.value.page).toBe(5)
      expect(second.engine.defaults.candidates.value.page).toBe(1)
      expect(second.engine.installations.snapshot.value).toHaveLength(0)
      first.scope.stop()
      second.scope.stop()
    })

    it('does not evaluate default sources again while a write evaluates its alternative', async () => {
      const { adapter, engine, scope } = setup(schema)
      let reads = 0
      installContributions(engine, { defaults: [() => {
        reads++

        return { page: 1 }
      }] })
      void engine.defaults.candidates.value
      const before = reads

      engine.query.transact({ mode: 'patch', values: { page: 1 } })
      await flush()

      expect(reads).toBe(before)
      expect(adapter.query.value).toEqual({})
      scope.stop()
    })
  })
})
