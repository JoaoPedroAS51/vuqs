import type { QueryCore } from '../../../../src/core/module-system/query-core'
import type {
  ApplyPipelineEffects,
  Enforce,
  OrderedPipelineDescriptors,
  PipelineDescriptor,
  PipelinePath,
  PipelineReadContext,
  PipelineWriteContext,
  QueryPipelineBus,
  QueryValues,
} from '../../../../src/core/runtime/pipeline/contract'
import type { QueryStateValues } from '../../../../src/core/schema/schema'
import { describe, expectTypeOf, it } from 'vitest'
import { codecs } from '../../../../src/core/codecs/catalog'
import { createCodec } from '../../../../src/core/codecs/codec'
import { createInstallationRegistry } from '../../../../src/core/runtime/installations'
import { createQueryPipeline } from '../../../../src/core/runtime/pipeline/pipeline'
import { queryParam } from '../../../../src/core/schema/params/query-param'
import { defineQuerySchema } from '../../../../src/core/schema/schema'

const record = queryParam.object('record', {
  a: queryParam('a', codecs.integer.withDefault(0)),
  b: queryParam('b', codecs.integer),
})

const schema = defineQuerySchema({
  'value': codecs.integer.withDefault(1),
  'text': codecs.string,
  'nullable': codecs.integer.nullable(),
  'payload': codecs.json<{ items: number[] }>(),
  'list': codecs.arrayOf(codecs.integer),
  'when': codecs.isoDate,
  'instance': createCodec<Map<string, number>>({ parse: () => undefined, serialize: () => undefined }),
  'shaped': queryParam('shaped', codecs.integer).transform<{ a: number, b: number }>({
    read: value => ({ a: value, b: value }),
    write: value => value.a,
  }),
  record,
  'prefixed': queryParam.object('p', record),
  'record.a': codecs.string,
})

type Schema = typeof schema

declare const pipeline: QueryPipelineBus<Schema>

expectTypeOf(schema).not.toBeAny()

describe('pipeline presence paths', () => {
  it('addresses schema params and declared composed children as logical tuples', () => {
    expectTypeOf<['value']>().toExtend<PipelinePath<Schema>>()
    expectTypeOf<['record']>().toExtend<PipelinePath<Schema>>()
    expectTypeOf<['record', 'a']>().toExtend<PipelinePath<Schema>>()
    expectTypeOf<['prefixed', 'b']>().toExtend<PipelinePath<Schema>>()
  })

  it('keeps a literal dotted key distinct from a child path', () => {
    expectTypeOf<['record.a']>().toExtend<PipelinePath<Schema>>()
    expectTypeOf<['record', 'a']>().toExtend<PipelinePath<Schema>>()
    expectTypeOf<['record.b']>().not.toExtend<PipelinePath<Schema>>()
  })

  it('stops at atomic params and rejects unknown paths', () => {
    expectTypeOf<['payload', 'items']>().not.toExtend<PipelinePath<Schema>>()
    expectTypeOf<['list', 0]>().not.toExtend<PipelinePath<Schema>>()
    expectTypeOf<['when', 'getTime']>().not.toExtend<PipelinePath<Schema>>()
    expectTypeOf<['value', 'x']>().not.toExtend<PipelinePath<Schema>>()
    expectTypeOf<['record', 'zzz']>().not.toExtend<PipelinePath<Schema>>()
    expectTypeOf<['unknown']>().not.toExtend<PipelinePath<Schema>>()
  })

  it('rejects invalid declarations at definition', () => {
    // @ts-expect-error - payload is atomic: its internals are not addressable
    pipeline.define('read', values => values, { projection: 'resolved', presence: { optional: [['payload', 'items']] } })
    // @ts-expect-error - unknown child
    pipeline.define('read', values => values, { projection: 'resolved', presence: { optional: [['record', 'zzz']] } })
    // The literal key and the child path are distinct and both valid.
    pipeline.define('read', values => values, { projection: 'resolved', presence: { optional: [['record.a'], ['record', 'a']] } })
  })
})

describe('pipeline callback contexts', () => {
  it('infers the stage and projection literals of a read callback', () => {
    pipeline.define('read', (_values, context) => {
      expectTypeOf(context.stage).toEqualTypeOf<'read'>()
      expectTypeOf(context.projection).toEqualTypeOf<'defaults'>()
      // @ts-expect-error - a read context has no request
      void context.request

      return _values
    }, { projection: 'defaults' })
  })

  it('exposes the original request on a write context only', () => {
    pipeline.define('write', (values, context) => {
      expectTypeOf(context.stage).toEqualTypeOf<'write'>()
      expectTypeOf(context.request.mode).toEqualTypeOf<'patch' | 'replace'>()
      expectTypeOf(context.request.origin).toEqualTypeOf<symbol | undefined>()
      expectTypeOf(context.request.defaultPolicy).toEqualTypeOf<'binding' | 'preserve-explicit' | undefined>()
      expectTypeOf(context.request.navigation).toExtend<{ history?: 'push' | 'replace' } | undefined>()
      // @ts-expect-error - a write context has no projection
      void context.projection

      return values
    })
  })

  it('makes context metadata readonly in both stages', () => {
    pipeline.define('read', (values, context) => {
      // @ts-expect-error - readonly
      context.stage = 'read'
      // @ts-expect-error - readonly
      context.projection = 'resolved'
      // @ts-expect-error - readonly
      context.query.value = 'x'

      return values
    }, { projection: 'resolved' })
    pipeline.define('write', (values, context) => {
      // @ts-expect-error - readonly
      context.request.mode = 'patch'
      // @ts-expect-error - readonly
      context.request.values.value = 2

      return values
    })
  })
})

describe('pipeline callback value views', () => {
  it('makes map properties and declared composed children readonly', () => {
    pipeline.define('write', (values, context) => {
      // @ts-expect-error - readonly map property
      values.value = 2
      // @ts-expect-error - readonly composed child
      values.record = { a: 1 }
      if (values.record !== undefined) {
        // @ts-expect-error - readonly composed child property
        values.record.a = 1
      }
      if (context.request.values.record !== undefined) {
        // @ts-expect-error - readonly composed child property
        context.request.values.record.a = 1
      }

      return values
    })
  })

  it('preserves the exact atomic types', () => {
    pipeline.define('write', (values) => {
      expectTypeOf(values.list).toEqualTypeOf<number[] | undefined>()
      expectTypeOf(values.payload).toEqualTypeOf<{ items: number[] } | undefined>()
      expectTypeOf(values.when).toEqualTypeOf<Date | undefined>()
      expectTypeOf(values.instance).toEqualTypeOf<Map<string, number> | undefined>()
      expectTypeOf(values.shaped).toEqualTypeOf<{ a: number, b: number } | undefined>()
      expectTypeOf(values.nullable).toEqualTypeOf<number | null | undefined>()

      return values
    })
  })

  it('admits absence of every param in a resolved view', () => {
    pipeline.define('read', (values) => {
      expectTypeOf(values.value).toEqualTypeOf<number | undefined>()
      expectTypeOf(values.record).toEqualTypeOf<{ readonly a?: number, readonly b?: number } | undefined>()

      return values
    }, { projection: 'resolved' })
  })
})

describe('pipeline callback outputs', () => {
  it('returns the input unchanged and reaches the explicit writer type without casts', () => {
    const identity = pipeline.define('write', values => values)
    const spread = pipeline.define('write', values => ({ ...values, value: 2 }))
    const copy = pipeline.define('write', (values) => {
      const next: QueryStateValues<Schema> = values

      return next
    })

    expectTypeOf(identity).not.toBeAny()
    expectTypeOf(spread).not.toBeAny()
    expectTypeOf(copy).not.toBeAny()
  })

  it('keeps atomic arrays, JSON and instances untouched through a spread', () => {
    pipeline.define('write', (values) => {
      const next = { ...values, text: 'x' }

      expectTypeOf(next.list).toEqualTypeOf<number[] | undefined>()
      expectTypeOf(next.when).toEqualTypeOf<Date | undefined>()
      expectTypeOf(next.payload).toEqualTypeOf<{ items: number[] } | undefined>()
      expectTypeOf(next.instance).toEqualTypeOf<Map<string, number> | undefined>()
      expectTypeOf(next.shaped).toEqualTypeOf<{ a: number, b: number } | undefined>()

      return next
    })
  })

  it('rejects a value outside the param domain', () => {
    // @ts-expect-error - value is a number
    pipeline.define('write', values => ({ ...values, value: 'x' }))
  })

  it('rejects an identity return that cannot satisfy a required path', () => {
    // @ts-expect-error - the input can be absent, the declaration promises presence
    pipeline.define('read', values => values, { projection: 'resolved', presence: { required: [['value']] } })
    pipeline.define('read', values => ({ ...values, value: values.value ?? 1 }), {
      projection: 'resolved',
      presence: { required: [['value']] },
    })
  })

  it('requires nested children only while their parent is defined', () => {
    pipeline.define('read', values => ({
      ...values,
      record: values.record === undefined ? undefined : { ...values.record, a: values.record.a ?? 0 },
    }), { projection: 'resolved', presence: { required: [['record', 'a']] } })
  })

  it('does not remove supported null with a required effect', () => {
    pipeline.define('read', (values) => {
      const next = { ...values, nullable: values.nullable ?? null }

      expectTypeOf(next.nullable).toEqualTypeOf<number | null>()

      return next
    }, { projection: 'resolved', presence: { required: [['nullable']] } })
  })
})

declare function accept(descriptors: readonly PipelineDescriptor[]): void

describe('descriptors in typed positions', () => {
  it('keeps the declared effects when the descriptor is passed where a descriptor is expected', () => {
    accept([
      pipeline.define('read', values => ({ ...values, value: values.value ?? 1 }), {
        projection: 'resolved',
        presence: { required: [['value']] },
      }),
    ])
    accept([
      // @ts-expect-error - the declaration promises presence the identity cannot give
      pipeline.define('read', values => values, { projection: 'resolved', presence: { required: [['value']] } }),
    ])
  })
})

describe('pipeline descriptor ordering', () => {
  const omit = pipeline.define('read', values => ({ ...values, value: undefined }), {
    projection: 'resolved',
    presence: { optional: [['value']] },
  })
  const fill = pipeline.define('read', values => values, { projection: 'resolved' })
  const guarantee = pipeline.define('read', values => ({ ...values, value: values.value ?? 1 }), {
    projection: 'resolved',
    presence: { required: [['value']] },
  })
  const late = pipeline.define('read', values => ({ ...values, value: undefined }), {
    projection: 'resolved',
    enforce: 'post',
    presence: { optional: [['value']] },
  })
  const early = pipeline.define('read', values => ({ ...values, value: values.value ?? 1 }), {
    projection: 'resolved',
    enforce: 'pre',
    presence: { required: [['value']] },
  })

  interface Base { value: number | undefined, text: string | undefined }

  it('orders descriptors by band, then registration', () => {
    expectTypeOf([omit, fill, guarantee, late, early]).not.toBeAny()
    type Ordered = OrderedPipelineDescriptors<[typeof late, typeof omit, typeof early, typeof fill]>

    expectTypeOf<Ordered>().toEqualTypeOf<[typeof early, typeof omit, typeof fill, typeof late]>()
  })

  it('applies a final guarantee after earlier filtering', () => {
    expectTypeOf<ApplyPipelineEffects<Base, [typeof omit, typeof fill, typeof guarantee]>['value']>().toEqualTypeOf<number>()
    expectTypeOf<ApplyPipelineEffects<Base, [typeof omit, typeof guarantee, typeof fill]>['value']>().toEqualTypeOf<number>()
    expectTypeOf<ApplyPipelineEffects<Base, [typeof fill, typeof omit, typeof guarantee]>['value']>().toEqualTypeOf<number>()
  })

  it('removes a guarantee that a later descriptor can omit', () => {
    expectTypeOf<ApplyPipelineEffects<Base, [typeof fill, typeof guarantee, typeof omit]>['value']>().toEqualTypeOf<number | undefined>()
    expectTypeOf<ApplyPipelineEffects<Base, [typeof guarantee, typeof omit, typeof fill]>['value']>().toEqualTypeOf<number | undefined>()
    expectTypeOf<ApplyPipelineEffects<Base, [typeof guarantee, typeof fill, typeof omit]>['value']>().toEqualTypeOf<number | undefined>()
  })

  it('lets the enforce band decide over the composition syntax', () => {
    expectTypeOf<ApplyPipelineEffects<Base, [typeof late, typeof guarantee]>['value']>().toEqualTypeOf<number | undefined>()
    expectTypeOf<ApplyPipelineEffects<Base, [typeof early, typeof omit]>['value']>().toEqualTypeOf<number | undefined>()
  })

  it('leaves untouched params and the explicit write domain alone', () => {
    expectTypeOf<ApplyPipelineEffects<Base, [typeof guarantee]>['text']>().toEqualTypeOf<string | undefined>()
  })

  it('ignores descriptors of other projections for the resolved read', () => {
    const explicitOnly = pipeline.define('read', values => values, {
      projection: 'explicit',
      presence: { optional: [['value']] },
    })

    expectTypeOf(explicitOnly).not.toBeAny()
    expectTypeOf<ApplyPipelineEffects<Base, [typeof guarantee, typeof explicitOnly]>['value']>().toEqualTypeOf<number>()
  })
})

declare const requiredMaybeEmpty: readonly [['value']] | readonly []
declare const requiredEither: readonly [['value'], ['text']] | readonly [['value']]
declare const widened: PipelinePath<Schema>[]

describe('conditional pipeline declarations', () => {
  interface Base { value: number | undefined, text: string | undefined }

  it('admits absence when an omitting descriptor has an unknown execution band', () => {
    type Omit = PipelineDescriptor<'read', 'resolved', [['value']], [], Enforce>

    expectTypeOf<ApplyPipelineEffects<{ value: number }, [Omit]>['value']>().toEqualTypeOf<number | undefined>()
  })

  it('establishes a guarantee only when every alternative declares it', () => {
    const maybe = pipeline.define('read', values => ({ ...values, value: values.value ?? 1 }), {
      projection: 'resolved',
      presence: { required: requiredMaybeEmpty },
    })
    const either = pipeline.define('read', values => ({ ...values, value: values.value ?? 1, text: values.text ?? '' }), {
      projection: 'resolved',
      presence: { required: requiredEither },
    })

    expectTypeOf([maybe, either]).not.toBeAny()
    expectTypeOf<ApplyPipelineEffects<Base, [typeof maybe]>['value']>().toEqualTypeOf<number | undefined>()
    expectTypeOf<ApplyPipelineEffects<Base, [typeof either]>['value']>().toEqualTypeOf<number>()
    expectTypeOf<ApplyPipelineEffects<Base, [typeof either]>['text']>().toEqualTypeOf<string | undefined>()
  })

  it('treats a widened required list as no guarantee and a widened optional list as possible absence', () => {
    // A callback cannot satisfy every path of a widened list, so only the descriptor type is inspected.
    const wideRequired = {} as PipelineDescriptor<'read', 'resolved', readonly [], PipelinePath<Schema>[], 'default'>
    const wideOptional = pipeline.define('read', values => values, {
      projection: 'resolved',
      presence: { optional: widened },
    })

    expectTypeOf([wideRequired, wideOptional]).not.toBeAny()
    expectTypeOf<ApplyPipelineEffects<{ value: number }, [typeof wideRequired]>['value']>().toEqualTypeOf<number>()
    expectTypeOf<ApplyPipelineEffects<{ value: number }, [typeof wideOptional]>['value']>().toEqualTypeOf<number | undefined>()
  })
})

describe('uncertain descriptor ordering', () => {
  interface Base {
    value: number
    text: string
    nullable: number | null
    record: { a: number, b: string }
    payload: { items: number[] }
  }

  type OmitValue<TBand extends Enforce = 'default'> = PipelineDescriptor<'read', 'resolved', [['value']], [], TBand>
  type RequireValue<TBand extends Enforce = 'default'> = PipelineDescriptor<'read', 'resolved', [], [['value']], TBand>
  type OmitChild = PipelineDescriptor<'read', 'resolved', [['record', 'a']], [], 'default'>
  type RequireChild = PipelineDescriptor<'read', 'resolved', [], [['record', 'a']], 'post'>

  it('retains possible omission after a guarantee when the band can be later', () => {
    expectTypeOf<ApplyPipelineEffects<Base, [OmitValue<Enforce>, RequireValue]>['value']>().toEqualTypeOf<number | undefined>()
    expectTypeOf<ApplyPipelineEffects<Base, [RequireValue<'post'>, OmitValue<Enforce>]>['value']>().toEqualTypeOf<number | undefined>()
    expectTypeOf<ApplyPipelineEffects<Base, [OmitValue<'pre'> | OmitValue<'post'>, RequireValue]>['value']>().toEqualTypeOf<number | undefined>()
  })

  it('recovers presence when the final guarantee is known to run after every possible omission', () => {
    expectTypeOf<ApplyPipelineEffects<Base, [OmitValue<'pre' | 'default'>, RequireValue<'post'>]>['value']>().toEqualTypeOf<number>()
    expectTypeOf<ApplyPipelineEffects<Base, [OmitValue<Enforce>, RequireValue<'post'>]>['value']>().toEqualTypeOf<number>()
  })

  it('admits absence from mutable and readonly arrays without changing unrelated params', () => {
    expectTypeOf<ApplyPipelineEffects<Base, OmitValue[]>['value']>().toEqualTypeOf<number | undefined>()
    expectTypeOf<ApplyPipelineEffects<Base, readonly OmitValue[]>['value']>().toEqualTypeOf<number | undefined>()
    expectTypeOf<ApplyPipelineEffects<Base, OmitValue<Enforce>[]>['text']>().toEqualTypeOf<string>()
    expectTypeOf<ApplyPipelineEffects<Base, (OmitValue | RequireValue)[]>['value']>().toEqualTypeOf<number | undefined>()
  })

  it('does not establish presence from a list that can be empty', () => {
    interface Absent { value: number | undefined }

    expectTypeOf<ApplyPipelineEffects<Absent, RequireValue[]>['value']>().toEqualTypeOf<number | undefined>()
    expectTypeOf<ApplyPipelineEffects<Absent, [RequireValue?]>['value']>().toEqualTypeOf<number | undefined>()
    expectTypeOf<ApplyPipelineEffects<Absent, [] | [RequireValue]>['value']>().toEqualTypeOf<number | undefined>()
    expectTypeOf<ApplyPipelineEffects<Base, [OmitValue?]>['value']>().toEqualTypeOf<number | undefined>()
    expectTypeOf<ApplyPipelineEffects<Base, [] | [OmitValue]>['value']>().toEqualTypeOf<number | undefined>()
  })

  it('keeps known suffix guarantees after an uncertain rest', () => {
    expectTypeOf<ApplyPipelineEffects<Base, [...OmitValue[], RequireValue<'post'>]>['value']>().toEqualTypeOf<number>()
    expectTypeOf<ApplyPipelineEffects<Base, [...OmitValue<'pre' | 'default'>[], RequireValue<'post'>]>['value']>().toEqualTypeOf<number>()
    expectTypeOf<ApplyPipelineEffects<Base, [RequireValue<'pre'>, ...OmitValue[], RequireValue<'post'>]>['value']>().toEqualTypeOf<number>()
  })

  it('orders known prefixes and rest elements by their execution bands', () => {
    expectTypeOf<ApplyPipelineEffects<Base, [RequireValue<'post'>, ...OmitValue<'pre'>[]]>['value']>().toEqualTypeOf<number>()
    expectTypeOf<ApplyPipelineEffects<Base, [RequireValue<'pre'>, ...OmitValue[]]>['value']>().toEqualTypeOf<number | undefined>()
    expectTypeOf<ApplyPipelineEffects<Base, [OmitValue, ...RequireValue[], OmitValue<'post'>]>['value']>().toEqualTypeOf<number | undefined>()
    expectTypeOf<ApplyPipelineEffects<{ value: number | undefined }, [RequireValue, ...RequireValue[]]>['value']>().toEqualTypeOf<number>()
  })

  it('applies uncertain nested effects without widening siblings or atomic values', () => {
    type Result = ApplyPipelineEffects<Base, OmitChild[]>

    expectTypeOf<Result['record']>().toEqualTypeOf<{ a?: number, b: string }>()
    expectTypeOf<Result['payload']>().toEqualTypeOf<{ items: number[] }>()
    expectTypeOf<ApplyPipelineEffects<Base, [...OmitChild[], RequireChild]>['record']>().toEqualTypeOf<{ a: number, b: string }>()
  })

  it('does not require a parent when a suffix guarantees only its child', () => {
    type OmitParent = PipelineDescriptor<'read', 'resolved', [['record']], [], 'default'>

    expectTypeOf<ApplyPipelineEffects<Base, [...OmitParent[], RequireChild]>['record']>().toEqualTypeOf<{ a: number, b: string } | undefined>()
  })

  it('preserves supported null while admitting absence', () => {
    type OmitNullable = PipelineDescriptor<'read', 'resolved', [['nullable']], [], Enforce>

    expectTypeOf<ApplyPipelineEffects<Base, OmitNullable[]>['nullable']>().toEqualTypeOf<number | null | undefined>()
  })

  it('admits effects of a possible resolved projection and ignores other projections and writes', () => {
    type Write = PipelineDescriptor<'write', undefined, [['value']], [], Enforce>
    type Explicit = PipelineDescriptor<'read', 'explicit', [['value']], [], Enforce>
    type MaybeResolved = PipelineDescriptor<'read', 'explicit' | 'resolved', [['value']], [], 'default'>

    expectTypeOf<ApplyPipelineEffects<Base, Write[]>['value']>().toEqualTypeOf<number>()
    expectTypeOf<ApplyPipelineEffects<Base, Explicit[]>['value']>().toEqualTypeOf<number>()
    expectTypeOf<ApplyPipelineEffects<Base, MaybeResolved[]>['value']>().toEqualTypeOf<number | undefined>()
  })
})

describe('module pipeline view', () => {
  it('offers descriptor creation without execution or installation', () => {
    expectTypeOf<QueryCore<typeof schema>['pipeline']>().toHaveProperty('define')
    expectTypeOf<QueryCore<typeof schema>['pipeline']>().not.toHaveProperty('run')
    expectTypeOf<QueryCore<typeof schema>['pipeline']>().not.toHaveProperty('install')
    expectTypeOf<QueryCore<typeof schema>['pipeline']>().not.toHaveProperty('tap')
  })
})

describe('pipeline execution context', () => {
  it('requires a schema and an installation snapshot', () => {
    const installations = createInstallationRegistry()

    expectTypeOf(createQueryPipeline(schema, installations.snapshot)).not.toBeAny()
    // @ts-expect-error - pipeline construction requires its inputs
    createQueryPipeline()
    // @ts-expect-error - the installation snapshot is required
    createQueryPipeline(schema)
    // @ts-expect-error - the schema cannot be omitted
    createQueryPipeline(undefined, installations.snapshot)
    // @ts-expect-error - the installation snapshot cannot be omitted
    createQueryPipeline(schema, undefined)
  })

  it('requires a complete context matching the requested stage', () => {
    const runtime = createQueryPipeline(schema, createInstallationRegistry().snapshot)
    const readContext: PipelineReadContext<Schema, 'resolved'> = {
      stage: 'read',
      projection: 'resolved',
      schema,
      query: {},
    }
    const writeContext: PipelineWriteContext<Schema> = {
      stage: 'write',
      schema,
      query: {},
      request: { mode: 'patch', values: { value: 1 } },
    }

    expectTypeOf(runtime.run('read', {}, readContext)).toEqualTypeOf<QueryValues>()
    expectTypeOf(runtime.run('write', {}, writeContext)).toEqualTypeOf<QueryValues>()
    runtime.run('read', {}, readContext, (output) => {
      expectTypeOf(output).toEqualTypeOf<QueryValues>()
    })
    runtime.run('write', {}, writeContext, (output) => {
      expectTypeOf(output).toEqualTypeOf<QueryValues>()
    })

    // @ts-expect-error - execution requires a context
    runtime.run('read', {})
    // @ts-expect-error - undefined is not an execution context
    runtime.run('write', {}, undefined)
    // @ts-expect-error - read execution requires a read context
    runtime.run('read', {}, writeContext)
    // @ts-expect-error - write execution requires a write context
    runtime.run('write', {}, readContext)
    // @ts-expect-error - a read context requires its projection
    runtime.run('read', {}, { stage: 'read', schema, query: {} })
    // @ts-expect-error - a write context requires the original request
    runtime.run('write', {}, { stage: 'write', schema, query: {} })
    // @ts-expect-error - a read context requires the evaluated query
    runtime.run('read', {}, { stage: 'read', projection: 'resolved', schema })
  })
})
