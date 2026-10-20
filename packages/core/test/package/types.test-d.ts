import type { StandardSchemaV1 } from '@standard-schema/spec'
import type {
  ApplyPipelineEffects,
  Codec,
  ModuleOptions,
  OrderedPipelineDescriptors,
  PipelineDescriptor,
  PipelinePath,
  QueryCore,
  QueryPipelineBus,
  QueryStateSchema,
  QueryStateValues,
} from '@vuqs/core'
import type { DebugEventCode, DebugEventMap, KnownDebugEvent } from '@vuqs/core/debug-protocol'
import type { StoredDebugConfigV1 } from '@vuqs/core/debug/console'
import type { QueryStorage, StorageStatus } from '@vuqs/core/modules'
import { codecs, defineQueryModule, defineQuerySchema, queryParam, toQueryRefs, useQueryState, useQueryStates } from '@vuqs/core'
import { createConsoleReporter, createPerformanceReporter, VUQS_DEBUG_STORAGE_KEY } from '@vuqs/core/debug/console'
import { withActiveParams, withContext, withRuntimeDefaults, withStorage } from '@vuqs/core/modules'
import { expectTypeOf } from 'vitest'
import { computed, ref } from 'vue'

declare module '@vuqs/core' {
  // eslint-disable-next-line unused-imports/no-unused-vars -- the params must match the base registry signature
  interface QueryModuleRegistry<TSchema extends QueryStateSchema, TOptions, TInference = unknown> {
    'consumer:explicit-value': {
      states: (options?: ModuleOptions<TOptions, { tag?: string }>) => typeof withExplicitValue.definition.states<TSchema>
    }
    'consumer:catalog-a': { states: () => typeof withCatalogA.definition.states<TSchema> }
    'consumer:catalog-b': { states: () => typeof withCatalogB.definition.states<TSchema> }
    'consumer:catalog-c': { states: () => typeof withCatalogC.definition.states<TSchema> }
    'consumer:catalog-d': { states: () => typeof withCatalogD.definition.states<TSchema> }
    'consumer:catalog-e': { states: () => typeof withCatalogE.definition.states<TSchema> }
    'consumer:mismatch': {
      states: () => (core: QueryCore<TSchema>) => { api: { count: number } }
    }
  }
}

const withCatalogA = defineQueryModule({ name: 'consumer:catalog-a', states: _core => ({ api: { catalogA: true as const } }) })
const withCatalogB = defineQueryModule({ name: 'consumer:catalog-b', states: _core => ({ api: { catalogB: 'b' as const } }) })
const withCatalogC = defineQueryModule({ name: 'consumer:catalog-c', states: _core => ({ api: { catalogC: 3 as const } }) })
const withCatalogD = defineQueryModule({ name: 'consumer:catalog-d', states: _core => ({ api: { catalogD: ['d'] as const } }) })
const withCatalogE = defineQueryModule({ name: 'consumer:catalog-e', states: _core => ({ api: { catalogE: { nested: true as const } } }) })
const withMismatch = defineQueryModule({ name: 'consumer:mismatch', states: () => ({ api: { count: 'not a number' } }) })

const withExplicitValue = defineQueryModule({
  name: 'consumer:explicit-value',
  states: <TSchema extends QueryStateSchema>(
    core: QueryCore<TSchema>,
    _options?: { tag?: string },
  ): { api: { explicitSnapshot: QueryStateValues<TSchema> } } => ({ api: { explicitSnapshot: core.state.explicitValues.value } }),
})

const schema = defineQuerySchema({ page: codecs.integer.withDefault(1), q: codecs.string })
const grouped = useQueryStates(schema).use(withActiveParams()).use(withRuntimeDefaults()).use(withExplicitValue())
const single = useQueryState('page', codecs.integer.withDefault(1)).use(withActiveParams()).use(withRuntimeDefaults())

expectTypeOf(grouped.activeKeys.value).toEqualTypeOf<readonly ('page' | 'q')[]>()
expectTypeOf(grouped.values.page).toEqualTypeOf<number>()
expectTypeOf(single.value).toEqualTypeOf<number>()
expectTypeOf(single.defaultValue.value).toEqualTypeOf<number | undefined>()
expectTypeOf(single.isActive.value).toEqualTypeOf<boolean>()
expectTypeOf(grouped.explicitSnapshot).toEqualTypeOf<{ readonly page?: number, readonly q?: string }>()
expectTypeOf(grouped.isActive).parameter(0).toEqualTypeOf<'page' | 'q'>()
expectTypeOf(single.setDefault).parameter(0).toEqualTypeOf<number>()
expectTypeOf<{ page: string }>().not.toExtend<typeof grouped.explicitSnapshot>()

interface Payload { id: string }
const validator: StandardSchemaV1<unknown, Payload> = {
  '~standard': {
    version: 1,
    vendor: 'consumer',
    validate: value => ({ value: { id: String(value) } }),
  },
}
const callback = (value: unknown): Payload => ({ id: String(value) })
declare const validation: typeof validator | typeof callback

expectTypeOf(codecs.json({ validate: validator })).toEqualTypeOf<Codec<Payload>>()
expectTypeOf(codecs.json({ validate: callback })).toEqualTypeOf<Codec<Payload>>()
expectTypeOf(codecs.json({ validate: validation })).toEqualTypeOf<Codec<Payload>>()
expectTypeOf(codecs.json<Payload>()).toEqualTypeOf<Codec<Payload>>()
expectTypeOf<'gtq:flush'>().toExtend<DebugEventCode>()
expectTypeOf<KnownDebugEvent>().extract<{ code: 'gtq:flush' }>().toHaveProperty('data').toEqualTypeOf<DebugEventMap['gtq:flush']>()
expectTypeOf(createConsoleReporter).toBeFunction()
expectTypeOf(createPerformanceReporter).toBeFunction()
expectTypeOf(VUQS_DEBUG_STORAGE_KEY).toBeString()
expectTypeOf<{ version: 1, console: { enabled: true, preset: 'trace' } }>().toExtend<StoredDebugConfigV1>()

// Explicit and resolved composed values
const record = queryParam.object('record', {
  a: queryParam('a', codecs.integer.withDefault(0)),
  b: queryParam('b', codecs.integer.withDefault(100)),
})
const composed = useQueryStates({ record }).use(withRuntimeDefaults())
const composedSingle = useQueryState(record).use(withRuntimeDefaults())

expectTypeOf(composed.values.record).toEqualTypeOf<{ a: number, b: number }>()
expectTypeOf(composedSingle.value).toEqualTypeOf<{ a: number, b: number }>()
expectTypeOf(composed.explicitValues.record).toEqualTypeOf<{ a?: number, b?: number } | undefined>()
expectTypeOf(composedSingle.explicitValue.value).toEqualTypeOf<{ a?: number, b?: number } | undefined>()
composed.patch({ record: { b: 10 } })
composedSingle.set({ b: 10 })
composed.setDefaults({ record: { a: 10 } })
composedSingle.setDefault({ a: 10 })
// @ts-expect-error - direct assignment keeps the projected read type
composed.values.record = { b: 10 }
// @ts-expect-error - numeric child
composed.patch({ record: { b: 'x' } })
// @ts-expect-error - numeric child
composed.setDefaults({ record: { a: 'x' } })
queryParam.object({ nested: record }).withDefault({ nested: { a: 20 } })

// Pipeline descriptors
const pipelineSchema = defineQuerySchema({
  value: codecs.integer.withDefault(1),
  record,
  payload: codecs.json<{ items: number[] }>(),
})
declare const pipeline: QueryPipelineBus<typeof pipelineSchema>
expectTypeOf(pipelineSchema).not.toBeAny()

expectTypeOf<['record', 'a']>().toExtend<PipelinePath<typeof pipelineSchema>>()
expectTypeOf<['payload', 'items']>().not.toExtend<PipelinePath<typeof pipelineSchema>>()

const guaranteeValue = pipeline.define('read', values => ({ ...values, value: values.value ?? 1 }), {
  projection: 'resolved',
  presence: { required: [['value']] },
})
const omitValue = pipeline.define('read', values => ({ ...values, value: undefined }), {
  projection: 'resolved',
  presence: { optional: [['value']] },
})
const copyRecord = pipeline.define('write', values => ({ ...values }))

expectTypeOf(guaranteeValue).toExtend<PipelineDescriptor<'read', 'resolved'>>()
expectTypeOf<OrderedPipelineDescriptors<[typeof omitValue, typeof guaranteeValue]>>().toEqualTypeOf<[typeof omitValue, typeof guaranteeValue]>()
expectTypeOf<ApplyPipelineEffects<{ value: number | undefined }, [typeof omitValue, typeof guaranteeValue]>['value']>().toEqualTypeOf<number>()
expectTypeOf<ApplyPipelineEffects<{ value: number | undefined }, [typeof guaranteeValue, typeof omitValue]>['value']>().toEqualTypeOf<number | undefined>()
expectTypeOf(copyRecord).toExtend<PipelineDescriptor<'write'>>()
expectTypeOf(omitValue).not.toBeAny()
// @ts-expect-error - payload internals are not addressable
pipeline.define('read', values => values, { projection: 'resolved', presence: { optional: [['payload', 'items']] } })

// Context navigation callbacks infer their domain from the active source
type Tab = 'products' | 'orders'
const tab = ref<Tab>('products')
const contextSchema = defineQuerySchema({ q: codecs.string, category: codecs.literal(['cpu', 'gpu'] as const) })
const fromRef = useQueryStates(contextSchema).use(withContext({
  active: tab,
  navigate: (target) => {
    expectTypeOf(target).toEqualTypeOf<Tab>()
  },
}))
const fromComputed = useQueryStates(contextSchema).use(withContext({
  active: computed(() => tab.value),
  only: { category: ['products'] },
  navigate: (target) => {
    expectTypeOf(target).toEqualTypeOf<Tab>()
  },
}))
const fromGetter = useQueryState('q').use(withContext({
  active: () => tab.value,
  navigate: (target) => {
    expectTypeOf(target).toEqualTypeOf<Tab>()
  },
}))
const fromLiteral = useQueryStates(contextSchema).use(withContext({
  active: 'products',
  navigate: (target) => {
    expectTypeOf(target).toEqualTypeOf<'products'>()
  },
}))
const widened = useQueryStates(contextSchema).use(withContext({
  active: ref('products'),
  navigate: (target) => {
    expectTypeOf(target).toEqualTypeOf<string>()
  },
}))

expectTypeOf(fromRef.activeContext.value).toEqualTypeOf<Tab>()
expectTypeOf(fromRef.switchTo).parameter(0).toEqualTypeOf<Tab>()
expectTypeOf(fromComputed.switchTo).parameter(0).toEqualTypeOf<Tab>()
expectTypeOf(fromComputed.values.category).toEqualTypeOf<'cpu' | 'gpu' | undefined>()
expectTypeOf(fromGetter.activeContext.value).toEqualTypeOf<Tab>()
expectTypeOf(fromLiteral.activeContext.value).toEqualTypeOf<'products'>()
expectTypeOf(widened.activeContext.value).toEqualTypeOf<string>()
// @ts-expect-error - the callback accepts a different context union
useQueryStates(contextSchema).use(withContext({ active: tab, navigate: (_target: 'other') => {} }))

// Storage controls on grouped and single state
declare const storage: QueryStorage
const persisted = useQueryStates(contextSchema).use(withStorage({ key: 'filters', storage }))
const persistedSingle = useQueryState('q').use(withStorage({ key: 'q', storage }))

expectTypeOf(persisted.storage.status.value).toEqualTypeOf<StorageStatus>()
expectTypeOf(persistedSingle.storage.flush).toEqualTypeOf<() => Promise<void>>()
// @ts-expect-error - storage options require a key
useQueryStates(contextSchema).use(withStorage({ storage }))

// A larger catalog leaves the selected composition exact
const catalogBare = useQueryStates(contextSchema)
const catalogFive = useQueryStates(contextSchema)
  .use(withCatalogA())
  .use(withCatalogB())
  .use(withCatalogC())
  .use(withCatalogD())
  .use(withCatalogE())

expectTypeOf(catalogBare.values.category).toEqualTypeOf<'cpu' | 'gpu' | undefined>()
expectTypeOf(catalogFive.catalogA).toEqualTypeOf<true>()
expectTypeOf(catalogFive.catalogB).toEqualTypeOf<'b'>()
expectTypeOf(catalogFive.catalogC).toEqualTypeOf<3>()
expectTypeOf(catalogFive.catalogD).toEqualTypeOf<readonly ['d']>()
expectTypeOf(catalogFive.catalogE).toEqualTypeOf<{ nested: true }>()
// @ts-expect-error - the actual producer differs from its registry specialization
useQueryStates(contextSchema).use(withMismatch())
// @ts-expect-error - a mismatching producer after a valid module
useQueryStates(contextSchema).use(withCatalogA()).use(withMismatch())
// @ts-expect-error - a grouped-only module on useQueryState
useQueryState('q').use(withCatalogB())

// Core configuration is readonly
declare const readonlyCore: QueryCore<typeof contextSchema>
expectTypeOf(readonlyCore.schema).toEqualTypeOf<Readonly<typeof contextSchema>>()
// @ts-expect-error - schema entries are configuration
readonlyCore.schema.q = codecs.string
// @ts-expect-error - baseline options are configuration
readonlyCore.options.history = 'push'

// Captured read facets follow module effects
const facetSchema = defineQuerySchema({
  page: codecs.integer.withDefault(1),
  size: codecs.integer.withDefault(20),
  label: codecs.string,
  reset: codecs.string.withDefault('fallback'),
})
const restrictedFacet = useQueryStates(facetSchema).use(withContext({ active: tab, preserve: ['page', 'reset'], only: { page: ['products'] } }))
const restrictedSingle = useQueryState('page', codecs.integer.withDefault(1)).use(withContext({ active: tab, preserve: true, only: ['products'] }))

expectTypeOf(restrictedFacet.values.page).toEqualTypeOf<number | undefined>()
expectTypeOf(restrictedFacet.values.size).toEqualTypeOf<number>()
expectTypeOf(restrictedFacet.values.label).toEqualTypeOf<string | undefined>()
expectTypeOf(restrictedFacet.values.reset).toEqualTypeOf<string>()
expectTypeOf(restrictedSingle.value).toEqualTypeOf<number | undefined>()
expectTypeOf(toQueryRefs(restrictedFacet).page.value).toEqualTypeOf<number | undefined>()
expectTypeOf(toQueryRefs(restrictedFacet).size.value).toEqualTypeOf<number>()

const optionalNumber = defineQueryModule({
  states: core => ({
    api: {},
    pipeline: [core.pipeline.define('read', values => ({ ...values, label: undefined }), {
      projection: 'resolved',
      presence: { optional: [['page']] },
    })],
  }),
})
const guaranteeNumber = defineQueryModule({
  states: core => ({
    api: {},
    pipeline: [core.pipeline.define('read', values => ({ ...values, page: values.page ?? 1 }), {
      projection: 'resolved',
      presence: { required: [['page']] },
    })],
  }),
})
const guaranteedLast = useQueryStates(facetSchema).use(optionalNumber()).use(guaranteeNumber())
const optionalLast = useQueryStates(facetSchema).use(guaranteeNumber()).use(optionalNumber())

expectTypeOf(guaranteedLast.values.page).toEqualTypeOf<number>()
expectTypeOf(optionalLast.values.page).toEqualTypeOf<number | undefined>()
