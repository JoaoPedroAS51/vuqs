import { describe, expect, it, vi } from 'vitest'
import { watch } from 'vue'
import { codecs } from '../../../../src/core/codecs/catalog'
import { queryParam } from '../../../../src/core/schema/params/query-param'
import { defineQuerySchema } from '../../../../src/core/schema/schema'
import { omitBy, pickBy } from '../../../../src/shared/utils/object'
import { createPipelineFixture, installContributions, installRead } from '../../../helpers/pipeline'
import { orderCases } from '../../../helpers/pipeline-order-cases'

describe('pickBy / omitBy', () => {
  const schema = defineQuerySchema({
    a: codecs.integer,
    b: codecs.integer,
    c: codecs.integer,
    secret: codecs.integer,
  })
  const context = { stage: 'read' as const, projection: 'resolved' as const, schema, query: {} }

  it.each([['a', 'b'], ['b', 'a']])('composes filters excluding %s then %s', (first, second) => {
    const { pipeline, installations } = createPipelineFixture(schema)
    installRead({ pipeline, installations }, pickBy(key => key !== first), { optional: [[first]] })
    installRead({ pipeline, installations }, pickBy(key => key !== second), { optional: [[second]] })

    expect(pipeline.run('read', { a: 1, b: 2, c: 3 }, context)).toEqual({ c: 3 })
  })

  it('inverts the predicate with omitBy', () => {
    const { pipeline, installations } = createPipelineFixture(schema)
    installRead({ pipeline, installations }, omitBy(key => key === 'secret'), { optional: [['secret']] })

    expect(pipeline.run('read', { a: 1, secret: 2 }, context)).toEqual({ a: 1 })
  })
})

describe('pipeline descriptors', () => {
  const schema = defineQuerySchema({
    'value': codecs.integer.withDefault(1),
    'text': codecs.string,
    'nullable': codecs.integer.nullable(),
    'payload': codecs.json<{ items: number[] }>(),
    'record': queryParam.object('record', {
      a: queryParam('a', codecs.integer.withDefault(0)),
      b: queryParam('b', codecs.integer),
    }),
    'record.a': codecs.string,
  })
  type Values = Record<string, unknown>

  const query = {}
  const readContext = (projection: 'explicit' | 'defaults' | 'resolved') => ({
    stage: 'read' as const,
    projection,
    schema,
    query,
  })
  const writeContext = {
    stage: 'write' as const,
    schema,
    query,
    request: { mode: 'patch' as const, values: { value: 1 } },
  }

  const setup = () => {
    const { pipeline, installations } = createPipelineFixture(schema)
    const read = (
      callback: (values: any, context: any) => Values,
      options: Record<string, unknown> = { projection: 'resolved' },
    ) => {
      // The module installer validates every descriptor before it publishes the installation.
      const descriptor = pipeline.define('read', callback as never, options as never)
      pipeline.validate(descriptor)

      return installContributions({ installations }, { pipeline: [descriptor] }).remove
    }

    return { pipeline, installations, read }
  }

  describe('execution', () => {
    it('hands each descriptor the progressive values and the unchanged original context', () => {
      const { pipeline, read } = setup()
      const seen: Array<{ values: Values, context: unknown }> = []
      read((values, context) => {
        seen.push({ values, context })
        return { ...values, text: 'first' }
      })
      read((values, context) => {
        seen.push({ values, context })
        return values
      })
      const context = readContext('resolved')

      const result = pipeline.run('read', { value: 1 }, context)

      expect(result).toEqual({ value: 1, text: 'first' })
      expect(seen[0]!.values).toEqual({ value: 1 })
      expect(seen[1]!.values).toEqual({ value: 1, text: 'first' })
      expect(seen[0]!.context).toBe(context)
      expect(seen[1]!.context).toBe(context)
    })

    it('runs a read descriptor only for its projection', () => {
      const { pipeline, read } = setup()
      const callback = vi.fn((values: Values) => values)
      read(callback, { projection: 'defaults' })

      pipeline.run('read', {}, readContext('explicit'))
      pipeline.run('read', {}, readContext('resolved'))
      expect(callback).not.toHaveBeenCalled()

      pipeline.run('read', {}, readContext('defaults'))
      expect(callback).toHaveBeenCalledOnce()
    })

    it('hands a write descriptor the original request without effective-option normalization', () => {
      const { pipeline, installations } = setup()
      installContributions({ installations }, {
        pipeline: [pipeline.define('write', ((values: Values, context: any) => {
          expect(context.stage).toBe('write')
          expect(context.request).toBe(writeContext.request)
          expect(Object.hasOwn(context.request, 'navigation')).toBe(false)
          expect(Object.hasOwn(context.request, 'defaultPolicy')).toBe(false)

          return values
        }) as never)],
      })

      pipeline.run('write', { value: 2 }, writeContext)
    })

    it('returns the input itself when nothing applies', () => {
      const { pipeline } = setup()
      const values = { value: 1 }

      expect(pipeline.run('read', values, readContext('resolved'))).toBe(values)
      expect(pipeline.run('write', values, writeContext)).toBe(values)
    })

    it('lets a callback return its input and keeps atomic references', () => {
      const { pipeline, read } = setup()
      const payload = { items: [1] }
      read(values => values)
      read(values => ({ ...values, text: 'x' }))
      const input = { payload }

      const result = pipeline.run('read', input, readContext('resolved'))

      expect(result.payload).toBe(payload)
      expect(input).toEqual({ payload })
    })

    it('removes the descriptor on cleanup, idempotently', () => {
      const { pipeline, read } = setup()
      const callback = vi.fn((values: Values) => values)
      const remove = read(callback)

      remove()
      remove()
      pipeline.run('read', {}, readContext('resolved'))

      expect(callback).not.toHaveBeenCalled()
    })

    it('re-runs a computed read when a descriptor is installed', async () => {
      const { computed } = await import('vue')
      const { pipeline, read } = setup()
      const result = computed(() => pipeline.run('read', { text: 'a' }, readContext('resolved')))

      expect(result.value).toEqual({ text: 'a' })
      read(values => ({ ...values, text: 'b' }))
      expect(result.value).toEqual({ text: 'b' })
    })
  })

  describe('ordering', () => {
    it.each(orderCases)('executes in the expected order: $name', ({ registrations, expected }) => {
      const { pipeline, read } = setup()
      const order: string[] = []

      for (const { label, enforce } of registrations) {
        read((values) => {
          order.push(label)
          return values
        }, { projection: 'resolved', enforce })
      }
      pipeline.run('read', {}, readContext('resolved'))

      expect(order).toEqual(expected)
    })
  })

  describe('declaration validation', () => {
    it.each([
      ['an unknown path', [['unknown']]],
      ['an unknown child', [['record', 'zzz']]],
      ['an atomic internal', [['payload', 'items']]],
    ])('rejects %s at installation', (_name, optional) => {
      const { read } = setup()

      expect(() => read(values => values, { projection: 'resolved', presence: { optional } })).toThrow(/presence path/)
    })

    it('rejects the same exact path as optional and required', () => {
      const { read } = setup()

      expect(() => read(values => values, {
        projection: 'resolved',
        presence: { optional: [['record', 'a']], required: [['record', 'a']] },
      })).toThrow(/both optional and required/)
    })

    it('accepts a literal dotted key and a child path as distinct', () => {
      const { read } = setup()

      expect(() => read(values => values, {
        projection: 'resolved',
        presence: { optional: [['record.a']], required: [['record', 'a']] },
      })).not.toThrow()
    })

    it('leaves nothing installed when validation fails', () => {
      const { pipeline, read } = setup()
      const callback = vi.fn((values: Values) => values)

      expect(() => read(callback, { projection: 'resolved', presence: { optional: [['unknown']] } })).toThrow()
      pipeline.run('read', {}, readContext('resolved'))

      expect(callback).not.toHaveBeenCalled()
    })
  })

  describe('optional effects', () => {
    it('restores static guarantees between executions', () => {
      const { pipeline, read } = setup()
      const introduce = () => ({ record: { b: 2 } })
      const remove = read(introduce, { projection: 'resolved', presence: { optional: [['record', 'a']] } })

      expect(pipeline.run('read', {}, readContext('resolved'))).toEqual({ record: { b: 2 } })

      remove()
      read(introduce)

      expect(() => pipeline.run('read', {}, readContext('resolved'))).toThrow(/\["record","a"\]/)
    })

    it('ignores presence effects from other projections and retains stage-relative diagnostic indices', () => {
      const { pipeline, read } = setup()
      const skipped = vi.fn((values: Values) => values)
      read(skipped, { projection: 'defaults', presence: { optional: [['record', 'a']] } })
      read(() => ({ record: { b: 2 } }))

      expect(() => pipeline.run('read', {}, readContext('resolved'))).toThrow(/descriptor #2.*\["record","a"\]/)
      expect(skipped).not.toHaveBeenCalled()
    })

    it('permits removing exactly the declared path', () => {
      const { pipeline, read } = setup()
      read(({ record: _record, ...rest }) => rest, { projection: 'resolved', presence: { optional: [['record']] } })

      expect(pipeline.run('read', { record: { a: 1, b: 2 }, text: 'x' }, readContext('resolved'))).toEqual({ text: 'x' })
    })

    it('distinguishes a parent permission from a child permission', () => {
      const parentOnly = setup()
      parentOnly.read(values => ({ ...values, record: { b: 2 } }), { projection: 'resolved', presence: { optional: [['record']] } })
      const childOnly = setup()
      childOnly.read(({ record: _record, ...rest }) => rest, { projection: 'resolved', presence: { optional: [['record', 'a']] } })

      expect(() => parentOnly.pipeline.run('read', { record: { a: 1, b: 2 } }, readContext('resolved'))).toThrow(/\["record","a"\]/)
      expect(() => childOnly.pipeline.run('read', { record: { a: 1, b: 2 } }, readContext('resolved'))).toThrow(/\["record"\]/)
    })

    it('identifies the stage, projection and offending path before the next callback runs', () => {
      const { pipeline, read } = setup()
      const next = vi.fn((values: Values) => values)
      const observe = vi.fn()
      read(values => ({ ...values, record: { b: 2 } }))
      read(next)

      expect(() => pipeline.run('read', { record: { a: 1, b: 2 } }, readContext('resolved'), observe)).toThrow(
        /read.*resolved.*\["record","a"\]/,
      )
      expect(next).not.toHaveBeenCalled()
      expect(observe).not.toHaveBeenCalled()
    })

    it('does not require a permission to preserve an absence it received', () => {
      const { pipeline, read } = setup()
      read(({ record: _record, ...rest }) => rest, { projection: 'resolved', presence: { optional: [['record']] } })
      const second = vi.fn((values: Values) => values)
      read(second)

      expect(pipeline.run('read', { record: { a: 1 } }, readContext('resolved'))).toEqual({})
      expect(second).toHaveBeenCalledOnce()
    })

    it('does not borrow a permission an earlier descriptor declared', () => {
      const { pipeline, read } = setup()
      read(values => values, { projection: 'resolved', presence: { optional: [['value']] } })
      read(({ value: _value, ...rest }) => rest)

      expect(() => pipeline.run('read', { value: 1 }, readContext('resolved'))).toThrow(/\["value"\]/)
    })

    it('treats a dropped touched value as absence and applies the same rule to write descriptors', () => {
      const { pipeline, installations } = setup()
      installContributions({ installations }, { pipeline: [pipeline.define('write', (({ value: _value, ...rest }: Values) => rest) as never)] })

      expect(() => pipeline.run('write', { value: 1 }, writeContext)).toThrow(/write.*\["value"\]/)
    })
  })

  describe('required effects', () => {
    it('does not retain requirements after a failed execution', () => {
      const { pipeline, read } = setup()
      const remove = read(values => values, { projection: 'resolved', presence: { required: [['text']] } })

      expect(() => pipeline.run('read', {}, readContext('resolved'))).toThrow(/\["text"\]/)

      remove()
      read(values => values)

      expect(pipeline.run('read', {}, readContext('resolved'))).toEqual({})
    })

    it('rejects an output that omits a required path and fills no default to repair it', () => {
      const { pipeline, read } = setup()
      read(values => values, { projection: 'resolved', presence: { required: [['text']] } })

      expect(() => pipeline.run('read', {}, readContext('resolved'))).toThrow(/\["text"\]/)
    })

    it('treats a supported null as defined', () => {
      const { pipeline, read } = setup()
      read(values => ({ ...values, nullable: null }), { projection: 'resolved', presence: { required: [['nullable']] } })

      expect(pipeline.run('read', {}, readContext('resolved'))).toEqual({ nullable: null })
    })

    it('requires a nested child only while its parent is defined', () => {
      const { pipeline, read } = setup()
      read(values => values, { projection: 'resolved', presence: { required: [['record', 'b']] } })

      expect(pipeline.run('read', { text: 'x' }, readContext('resolved'))).toEqual({ text: 'x' })
      expect(() => pipeline.run('read', { record: { a: 1 } }, readContext('resolved'))).toThrow(/\["record","b"\]/)
    })

    it('rejects an introduced object that lacks a child the effective structure requires', () => {
      const { pipeline, read } = setup()
      read(values => ({ ...values, record: { b: 2 } }))

      expect(() => pipeline.run('read', {}, readContext('resolved'))).toThrow(/\["record","a"\]/)
    })

    it('lets an earlier optional child effect permit reintroduction, but not a later one', () => {
      const earlier = setup()
      earlier.read(values => values, { projection: 'resolved', presence: { optional: [['record', 'a']] } })
      earlier.read(values => ({ ...values, record: { b: 2 } }))
      const later = setup()
      later.read(values => ({ ...values, record: { b: 2 } }))
      later.read(values => values, { projection: 'resolved', presence: { optional: [['record', 'a']] } })

      expect(earlier.pipeline.run('read', {}, readContext('resolved'))).toEqual({ record: { b: 2 } })
      expect(() => later.pipeline.run('read', {}, readContext('resolved'))).toThrow(/\["record","a"\]/)
    })

    it('restores the obligation of an optional child with a later required effect', () => {
      const { pipeline, read } = setup()
      read(values => values, { projection: 'resolved', presence: { optional: [['record', 'a']] } })
      read(values => values, { projection: 'resolved', presence: { required: [['record', 'a']] } })

      expect(() => pipeline.run('read', { record: { b: 2 } }, readContext('resolved'))).toThrow(/\["record","a"\]/)
    })

    it('rejects a composed value that is null', () => {
      const { pipeline, read } = setup()
      read(values => ({ ...values, record: null }))

      expect(() => pipeline.run('read', {}, readContext('resolved'))).toThrow(/\["record"\]/)
    })

    it('does not enforce the resolved guarantees on the explicit projection', () => {
      const { pipeline, read } = setup()
      read(values => ({ ...values, record: { b: 2 } }), { projection: 'explicit' })

      expect(pipeline.run('read', {}, readContext('explicit'))).toEqual({ record: { b: 2 } })
    })
  })
})

describe('installed registrations', () => {
  const schema = defineQuerySchema({ value: queryParam('value', codecs.integer), text: queryParam('text', codecs.string) })
  const context = { stage: 'read' as const, projection: 'resolved' as const, schema, query: {} }
  type Values = Record<string, unknown>

  const append = (fixture: ReturnType<typeof createPipelineFixture<typeof schema>>, label: string, options: { enforce?: 'pre' | 'default' | 'post' } = {}) => {
    return fixture.pipeline.define('read', ((values: Values) => ({ ...values, text: `${String(values.text ?? '')}${label}` })) as never, {
      projection: 'resolved',
      enforce: options.enforce,
    } as never)
  }

  it('orders registrations by band, then installation, then occurrence, across installations', () => {
    const fixture = createPipelineFixture(schema)
    installContributions(fixture, { pipeline: [append(fixture, 'a'), append(fixture, 'b', { enforce: 'post' })] })
    installContributions(fixture, { pipeline: [append(fixture, 'c', { enforce: 'pre' }), append(fixture, 'd')] })

    expect(fixture.pipeline.run('read', {}, context)).toEqual({ text: 'cadb' })
  })

  it('runs an installation\'s registrations only while it is installed', () => {
    const fixture = createPipelineFixture(schema)
    installContributions(fixture, { pipeline: [append(fixture, 'a')] })
    const second = installContributions(fixture, { pipeline: [append(fixture, 'b'), append(fixture, 'c')] })

    expect(fixture.pipeline.run('read', {}, context)).toEqual({ text: 'abc' })

    second.remove()
    expect(fixture.pipeline.run('read', {}, context)).toEqual({ text: 'a' })

    second.remove()
    expect(fixture.pipeline.run('read', {}, context)).toEqual({ text: 'a' })
  })

  it('keeps one descriptor installed twice as two registrations', () => {
    const fixture = createPipelineFixture(schema)
    const shared = append(fixture, 'x')
    installContributions(fixture, { pipeline: [shared] })
    const second = installContributions(fixture, { pipeline: [shared] })

    expect(fixture.pipeline.run('read', {}, context)).toEqual({ text: 'xx' })

    second.remove()
    expect(fixture.pipeline.run('read', {}, context)).toEqual({ text: 'x' })
  })

  it('becomes visible to a reactive reader as one change per installation', () => {
    const fixture = createPipelineFixture(schema)
    const runs: unknown[] = []
    const stop = watch(() => fixture.pipeline.run('read', {}, context), value => runs.push(value), { flush: 'sync' })

    installContributions(fixture, { pipeline: [append(fixture, 'a'), append(fixture, 'b')] })
    stop()

    expect(runs).toEqual([{ text: 'ab' }])
  })
})

describe('callback outputs', () => {
  const schema = defineQuerySchema({ value: queryParam('value', codecs.integer) })
  const context = { stage: 'read' as const, projection: 'resolved' as const, schema, query: {} }

  it('rejects a callback that returns a value that is not a map', () => {
    const fixture = createPipelineFixture(schema)
    installContributions(fixture, { pipeline: [fixture.pipeline.define('read', (() => 5) as never, { projection: 'resolved' } as never)] })

    expect(() => fixture.pipeline.run('read', { value: 1 }, context)).toThrow(/returned a value that is not a map/)
  })

  it('verifies a callback that receives no map as introducing every value it defines', () => {
    const fixture = createPipelineFixture(schema)
    installContributions(fixture, { pipeline: [fixture.pipeline.define('read', (() => ({ value: 3 })) as never, { projection: 'resolved' } as never)] })

    expect(fixture.pipeline.run('read', undefined as never, context)).toEqual({ value: 3 })
  })
})
