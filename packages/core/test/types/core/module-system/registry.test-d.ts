import type { ComputedRef } from 'vue'
import type { QueryCore } from '../../../../src/core/module-system/query-core'
import type { ModuleOptions } from '../../../../src/core/module-system/registry'
import type { QueryStateSchema, QueryStateValueAt, QueryStateWriteValues } from '../../../../src/core/schema/schema'
import type { QueryStatesContextOptions } from '../../../../src/modules/context/module'
import { describe, expectTypeOf, it } from 'vitest'
import { computed } from 'vue'
import { useQueryState } from '../../../../src/core/bindings/use-query-state'
import { useQueryStates } from '../../../../src/core/bindings/use-query-states'
import { codecs } from '../../../../src/core/codecs/catalog'
import { defineQueryModule } from '../../../../src/core/module-system/define-query-module'
import { queryParam } from '../../../../src/core/schema/params/query-param'
import { withContext } from '../../../../src/modules/context/module'

interface ExplicitValueApi<TValue> {
  explicitValue: ComputedRef<TValue | undefined>
  resetTo: (value: TValue) => void
}

declare module '@vuqs/core' {

  // eslint-disable-next-line unused-imports/no-unused-vars -- the params must match the base registry signature
  interface QueryModuleRegistry<TSchema extends QueryStateSchema, TOptions, TInference = unknown> {
    'test:explicit-value': {
      state: () => typeof withExplicitValue.definition.state<TSchema>
    }
    'test:catalog-a': {
      states: (options?: ModuleOptions<TOptions, { tag?: string }>) => typeof withCatalogA.definition.states<TSchema>
      state: () => typeof withCatalogA.definition.state<TSchema>
    }
    'test:catalog-b': {
      states: () => typeof withCatalogB.definition.states<TSchema>
    }
    'test:catalog-c': {
      states: () => typeof withCatalogC.definition.states<TSchema>
    }
    'test:catalog-d': {
      states: () => typeof withCatalogD.definition.states<TSchema>
    }
    'test:catalog-e': {
      states: () => typeof withCatalogE.definition.states<TSchema>
      state: () => typeof withCatalogE.definition.state<TSchema>
    }
    'test:mismatch': {
      states: () => (core: QueryCore<TSchema>) => { api: { count: number } }
      state: () => (core: QueryCore<TSchema>, key: keyof TSchema & string) => { api: { count: number } }
    }
    'test:union': {
      states: (options: ModuleOptions<TOptions, { mode: 'a', a: number } | { mode: 'b', b: string }>) => typeof withUnion.definition.states<TSchema, typeof options>
    }
    'test:array-context': {
      states: (options: ModuleOptions<TOptions, QueryStatesContextOptions<TSchema, string>>) => typeof withArrayContext.definition.states<TSchema, typeof options>
    }
  }
}

const withExplicitValue = defineQueryModule({
  name: 'test:explicit-value',
  state: <TSchema extends QueryStateSchema>(core: QueryCore<TSchema>, key: keyof TSchema & string): {
    api: ExplicitValueApi<QueryStateValueAt<TSchema, 'value'>>
  } => ({
    api: {
      explicitValue: computed(() => core.state.explicitValues.value[key] as QueryStateValueAt<TSchema, 'value'> | undefined),
      resetTo: value => core.query.transact({
        mode: 'patch',
        values: { [key]: value } as QueryStateWriteValues<TSchema>,
      }),
    },
  }),
})

const schema = {
  q: queryParam('q', codecs.string),
  category: queryParam('category', codecs.literal(['cpu', 'gpu'] as const)),
}

const withArrayContext = defineQueryModule({
  name: 'test:array-context',
  states: <TSchema extends QueryStateSchema, const TOptions>(
    core: QueryCore<TSchema>,
    options: TOptions & QueryStatesContextOptions<TSchema, string>,
  ) => {
    const result = withContext.definition.states(core, options)

    return { api: { ...result.api, registered: true as const }, pipeline: result.pipeline.slice() }
  },
})

declare const activeContext: 'a' | 'b'

describe('registry-based pipeline effects', () => {
  it('preserves option-dependent effects from a stored module with a descriptor array', () => {
    const stored = withArrayContext({ active: activeContext, only: { value: ['b'] } })
    const query = useQueryStates({ value: codecs.integer.withDefault(1), other: codecs.string.withDefault('kept') }).use(stored)

    expectTypeOf(query.values.value).toEqualTypeOf<number | undefined>()
    expectTypeOf(query.values.other).toEqualTypeOf<string>()
    expectTypeOf(query.activeContext.value).toEqualTypeOf<'a' | 'b'>()
    expectTypeOf(query.registered).toEqualTypeOf<true>()
  })
})

describe('registry-based single-state authoring', () => {
  it('resolves the contributed API against the bound param value type', () => {
    const page = useQueryState('page', codecs.integer.withDefault(1)).use(withExplicitValue())

    expectTypeOf(page.value).toEqualTypeOf<number>()
    expectTypeOf(page.explicitValue.value).toEqualTypeOf<number | undefined>()
    expectTypeOf(page.resetTo).parameter(0).toEqualTypeOf<number>()
  })

  it('resolves the value type for the implicit string param', () => {
    const q = useQueryState('q').use(withExplicitValue())

    expectTypeOf(q.explicitValue.value).toEqualTypeOf<string | undefined>()
    expectTypeOf(q.resetTo).parameter(0).toEqualTypeOf<string>()
  })

  it('enforces the value type against the param the single form binds', () => {
    const category = useQueryState('category', codecs.literal(['cpu', 'gpu'] as const)).use(withExplicitValue())

    expectTypeOf(category.explicitValue.value).toEqualTypeOf<'cpu' | 'gpu' | undefined>()
    expectTypeOf(category.resetTo).parameter(0).toEqualTypeOf<'cpu' | 'gpu'>()
  })

  it('rejects the single-only registry module on useQueryStates', () => {
    const grouped = useQueryStates(schema)

    expectTypeOf(grouped.use).toBeFunction()
    expectTypeOf(withExplicitValue()).not.toExtend<Parameters<typeof grouped.use>[0]>()
  })
})

// A larger catalog with unrelated entries
const withCatalogA = defineQueryModule({
  name: 'test:catalog-a',
  states: _core => ({ api: { catalogA: true as const } }),
  state: (_core, _key) => ({ api: { catalogA: true as const } }),
})
const withCatalogB = defineQueryModule({
  name: 'test:catalog-b',
  states: _core => ({ api: { catalogB: 'b' as const } }),
})
const withCatalogC = defineQueryModule({
  name: 'test:catalog-c',
  states: _core => ({ api: { catalogC: 3 as const } }),
})
const withCatalogD = defineQueryModule({
  name: 'test:catalog-d',
  states: _core => ({ api: { catalogD: ['d'] as const } }),
})
const withCatalogE = defineQueryModule({
  name: 'test:catalog-e',
  states: _core => ({ api: { catalogE: { nested: true as const } } }),
  state: (_core, _key) => ({ api: { catalogE: { nested: true as const } } }),
})
const withMismatch = defineQueryModule({
  name: 'test:mismatch',
  states: () => ({ api: { count: 'not a number' } }),
  state: () => ({ api: { count: 'not a number' } }),
})
const withUnion = defineQueryModule({
  name: 'test:union',
  states: <TSchema extends QueryStateSchema, const TOptions extends { mode: 'a' | 'b' }>(
    _core: QueryCore<TSchema>,
    options: TOptions,
  ): { api: { mode: TOptions['mode'] } } => ({ api: { mode: options.mode } }),
})

describe('registry catalog size', () => {
  it('keeps a binding with no installed module exact', () => {
    const q = useQueryStates(schema)

    expectTypeOf(q.values.q).toEqualTypeOf<string | undefined>()
    expectTypeOf(q.values.category).toEqualTypeOf<'cpu' | 'gpu' | undefined>()
    expectTypeOf(q).not.toHaveProperty('catalogA')
  })

  it('keeps the selected APIs exact with five installed modules', () => {
    const q = useQueryStates(schema)
      .use(withCatalogA({ tag: 'x' }))
      .use(withCatalogB())
      .use(withCatalogC())
      .use(withCatalogD())
      .use(withCatalogE())

    expectTypeOf(q.catalogA).toEqualTypeOf<true>()
    expectTypeOf(q.catalogB).toEqualTypeOf<'b'>()
    expectTypeOf(q.catalogC).toEqualTypeOf<3>()
    expectTypeOf(q.catalogD).toEqualTypeOf<readonly ['d']>()
    expectTypeOf(q.catalogE).toEqualTypeOf<{ nested: true }>()
    expectTypeOf(q.values.category).toEqualTypeOf<'cpu' | 'gpu' | undefined>()
  })

  it('keeps single-param APIs exact next to unrelated modules', () => {
    const q = useQueryState('category', codecs.literal(['cpu', 'gpu'] as const))
      .use(withCatalogA())
      .use(withCatalogE())

    expectTypeOf(q.catalogA).toEqualTypeOf<true>()
    expectTypeOf(q.catalogE).toEqualTypeOf<{ nested: true }>()
  })

  it('rejects unknown option keys and single-only usage', () => {
    // @ts-expect-error a grouped-only module on useQueryState
    useQueryState('q').use(withCatalogB())
  })
})

describe('producer verification', () => {
  it('rejects a producer that differs from its registry specialization at the first and chained grouped use', () => {
    // @ts-expect-error the actual producer returns a different API than the registry declares
    useQueryStates(schema).use(withMismatch())
    // @ts-expect-error a mismatching producer after a valid module
    useQueryStates(schema).use(withCatalogB()).use(withMismatch())
  })

  it('rejects a mismatching single producer at the first and chained use', () => {
    // @ts-expect-error the actual producer returns a different API than the registry declares
    useQueryState('q').use(withMismatch())
    // @ts-expect-error a mismatching producer after a valid module
    useQueryState('q').use(withCatalogA()).use(withMismatch())
  })
})

describe('option unions', () => {
  it('accepts each declared alternative', () => {
    const a = useQueryStates(schema).use(withUnion({ mode: 'a', a: 1 }))
    const b = useQueryStates(schema).use(withUnion({ mode: 'b', b: 'x' }))

    expectTypeOf(a.mode).toEqualTypeOf<'a'>()
    expectTypeOf(b.mode).toEqualTypeOf<'b'>()
  })

  it('rejects an option object that mixes alternatives', () => {
    // @ts-expect-error `b` belongs to the other alternative
    withUnion({ mode: 'a', b: 'x' })
  })

  it('rejects a union value as a whole when one alternative is invalid', () => {
    const mixed = { mode: 'a', a: 1 } as { mode: 'a', a: number } | { mode: 'b', b: number }

    // @ts-expect-error the second alternative is incompatible
    withUnion(mixed)
  })
})

describe('contextual definitions', () => {
  it('contextualizes inline callbacks without annotations', () => {
    const module = defineQueryModule({
      name: 'test:catalog-a',
      states: (core, options) => {
        expectTypeOf(core).not.toBeAny()
        expectTypeOf(options?.tag).toEqualTypeOf<string | undefined>()

        return { api: { tagged: options?.tag } }
      },
      state: (core, key) => {
        expectTypeOf(core).not.toBeAny()
        const text: string = key

        expectTypeOf(text).toBeString()

        return { api: { key } }
      },
    })

    expectTypeOf(module.definition.states).toBeFunction()
    expectTypeOf(module.definition.state).toBeFunction()
  })

  it('rejects malformed results at the definition', () => {
    // @ts-expect-error a result without `api`
    defineQueryModule({ name: 'test:catalog-b', states: () => ({ nope: 1 }) })
    // @ts-expect-error `api` must be an object
    defineQueryModule({ name: 'test:catalog-b', states: () => ({ api: 1 }) })
    // @ts-expect-error pipeline entries must be descriptors
    defineQueryModule({ name: 'test:catalog-b', states: () => ({ api: {}, pipeline: [1] }) })
    // @ts-expect-error defaults entries must be sources
    defineQueryModule({ name: 'test:catalog-b', states: () => ({ api: {}, defaults: [1] }) })
  })

  it('accepts a result with only an API', () => {
    defineQueryModule({ name: 'test:catalog-b', states: () => ({ api: {} }) })
  })
})

describe('readonly core configuration', () => {
  it('rejects assigning schema entries and baseline options', () => {
    const core = null as unknown as QueryCore<typeof schema>

    expectTypeOf(core.schema).toEqualTypeOf<Readonly<typeof schema>>()
    expectTypeOf(core.options).not.toBeAny()
    // @ts-expect-error schema entries are configuration
    core.schema.q = queryParam('q', codecs.string)
    // @ts-expect-error baseline options are configuration
    core.options.history = 'push'
    // @ts-expect-error baseline options are configuration
    core.options.clearOnDefault = false
  })

  it('exposes committed query and projected candidates as reads', () => {
    const core = null as unknown as QueryCore<typeof schema>

    expectTypeOf(core.query.current).returns.not.toBeAny()
    const candidates = core.defaults.candidates

    // @ts-expect-error candidates are a computed read
    core.defaults.candidates = candidates
  })
})
