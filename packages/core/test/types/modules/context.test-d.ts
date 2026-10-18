import type { QueryRegisteredMarkers } from '../../../src/core/module-system/factory-types'
import type { QueryModuleStateResult, QueryModuleStatesResult } from '../../../src/core/module-system/registry'
import type { AnyDefinedQueryParam } from '../../../src/core/schema/params/definition'
import type { QueryStateSchema } from '../../../src/core/schema/schema'
import type { ContextNavigate, ContextPipeline } from '../../../src/modules/context/module'
import { describe, expectTypeOf, it } from 'vitest'
import { computed, ref } from 'vue'
import { useQueryState } from '../../../src/core/bindings/use-query-state'
import { useQueryStates } from '../../../src/core/bindings/use-query-states'
import { codecs } from '../../../src/core/codecs/catalog'
import { queryParam } from '../../../src/core/schema/params/query-param'
import { withActiveParams } from '../../../src/modules/active-params/module'
import { withContext } from '../../../src/modules/context/module'

const schema = {
  q: queryParam('q', codecs.string),
  category: queryParam('category', codecs.literal(['cpu', 'gpu'] as const)),
}

describe('withContext inference', () => {
  it('adds single context APIs to useQueryState', () => {
    const tab = ref<'products' | 'orders'>('products')
    const category = useQueryState('category').use(
      withContext({ active: tab, preserve: true, only: ['products'] }),
    )

    expectTypeOf(category.value).toEqualTypeOf<string | undefined>()
    expectTypeOf(category.activeContext.value).toEqualTypeOf<'products' | 'orders'>()
    expectTypeOf(category.switchTo).parameter(0).toEqualTypeOf<'products' | 'orders'>()
    expectTypeOf(category.buildContextQuery).parameter(1).toEqualTypeOf<'products' | 'orders'>()
  })

  it('keeps literal context types when a typed navigate callback is configured', () => {
    const tab = ref<'products' | 'orders'>('products')
    const navigate: ContextNavigate<'products' | 'orders'> = () => {}
    const stored = useQueryStates(schema).use(withContext({ active: tab, navigate }))
    const annotated = useQueryStates(schema).use(withContext({
      active: tab,
      navigate: (target: 'products' | 'orders') => {
        expectTypeOf(target).toEqualTypeOf<'products' | 'orders'>()
      },
    }))

    expectTypeOf(stored.activeContext.value).toEqualTypeOf<'products' | 'orders'>()
    expectTypeOf(stored.switchTo).parameter(0).toEqualTypeOf<'products' | 'orders'>()
    expectTypeOf(annotated.activeContext.value).toEqualTypeOf<'products' | 'orders'>()
    // @ts-expect-error a navigate callback for a different context union
    useQueryStates(schema).use(withContext({ active: tab, navigate: (_target: 'other') => {} }))
  })

  it('adds active-only context APIs to both facades', () => {
    const tab = ref<'products' | 'orders'>('products')

    useQueryStates(schema).use(withContext({ active: tab }))
    useQueryState('q').use(withContext({ active: tab }))
  })
})

describe('withContext key-safety (schema form)', () => {
  const tab = ref<'products' | 'orders'>('products')

  it('accepts valid field keys in preserve and only', () => {
    withContext(schema, { active: tab, preserve: ['q', 'category'], only: { category: ['products'] } })
  })

  it('rejects unknown keys', () => {
    // @ts-expect-error 'nope' is not a field of the schema
    withContext(schema, { active: tab, preserve: ['nope'] })
    // @ts-expect-error 'nope' is not a field of the schema
    withContext(schema, { active: tab, only: { nope: ['products'] } })
  })
})

describe('withContext key-safety (checked by use)', () => {
  const tab = ref<'products' | 'orders'>('products')

  it('accepts valid field keys inferred from the composable schema', () => {
    useQueryStates(schema).use(
      withContext({ active: tab, preserve: ['q', 'category'], only: { category: ['products'] } }),
    )
  })

  it('rejects unknown keys inferred from the composable schema', () => {
    // @ts-expect-error 'nope' is not a field of the schema
    useQueryStates(schema).use(withContext({ active: tab, preserve: ['nope'] }))
    // @ts-expect-error 'nope' is not a field of the schema
    useQueryStates(schema).use(withContext({ active: tab, only: { nope: ['products'] } }))
  })

  it('rejects single context options on useQueryStates', () => {
    // @ts-expect-error single preserve is not a grouped module
    useQueryStates(schema).use(withContext({ active: tab, preserve: true }))
    // @ts-expect-error single only is not a grouped module
    useQueryStates(schema).use(withContext({ active: tab, only: ['products'] }))
  })
})

describe('withContext key-safety (useQueryState)', () => {
  const tab = ref<'products' | 'orders'>('products')

  it('rejects grouped context options on useQueryState', () => {
    // @ts-expect-error grouped preserve is not a single-param module
    useQueryState('q').use(withContext({ active: tab, preserve: ['q'] }))
    // @ts-expect-error grouped only is not a single-param module
    useQueryState('q').use(withContext({ active: tab, only: { q: ['products'] } }))
  })
})

describe('withContext standalone forms', () => {
  const tab = ref<'products' | 'orders'>('products')

  it('binds the inline base form to either facade', () => {
    useQueryStates(schema).use(withContext({ active: tab }))
    useQueryState('q').use(withContext({ active: tab }))
  })

  it('builds a grouped module from an explicit schema', () => {
    const grouped = useQueryStates(schema).use(
      withContext(schema, { active: tab, preserve: ['q'], only: { category: ['products'] } }),
    )

    expectTypeOf(grouped.activeContext.value).toEqualTypeOf<'products' | 'orders'>()
    // @ts-expect-error unknown key in the explicit schema form
    withContext(schema, { active: tab, preserve: ['nope'] })
    // @ts-expect-error a grouped module is not usable on useQueryState
    useQueryState('q').use(withContext(schema, { active: tab }))
  })

  it('builds a single module from a param definition', () => {
    const category = queryParam('category', codecs.literal(['cpu', 'gpu'] as const))
    const single = useQueryState(category).use(withContext(category, { active: tab, preserve: true, only: ['products'] }))

    expectTypeOf(single.activeContext.value).toEqualTypeOf<'products' | 'orders'>()
    // @ts-expect-error a single module is not usable on useQueryStates
    useQueryStates(schema).use(withContext(category, { active: tab, preserve: true }))
  })

  it('builds a single module from a param path', () => {
    const single = useQueryState('q').use(withContext('q', { active: tab, preserve: true }))

    expectTypeOf(single.activeContext.value).toEqualTypeOf<'products' | 'orders'>()
  })
})

describe('withContext navigation callback inference', () => {
  type Tab = 'products' | 'orders'
  const tab = ref<Tab>('products')
  const category = queryParam('category', codecs.literal(['cpu', 'gpu'] as const))

  it('types an unannotated callback from a ref source on both facades', () => {
    const grouped = useQueryStates(schema).use(withContext({
      active: tab,
      navigate: (target) => {
        expectTypeOf(target).toEqualTypeOf<Tab>()
      },
    }))
    const single = useQueryState('q').use(withContext({
      active: tab,
      navigate: (target) => {
        expectTypeOf(target).toEqualTypeOf<Tab>()
      },
    }))

    expectTypeOf(grouped.activeContext.value).toEqualTypeOf<Tab>()
    expectTypeOf(grouped.switchTo).parameter(0).toEqualTypeOf<Tab>()
    expectTypeOf(single.activeContext.value).toEqualTypeOf<Tab>()
    expectTypeOf(single.switchTo).parameter(0).toEqualTypeOf<Tab>()
  })

  it('types an unannotated callback from computed and getter sources', () => {
    const fromComputed = useQueryStates(schema).use(withContext({
      active: computed(() => tab.value),
      navigate: (target) => {
        expectTypeOf(target).toEqualTypeOf<Tab>()
      },
    }))
    const fromGetter = useQueryStates(schema).use(withContext({
      active: () => tab.value,
      navigate: (target) => {
        expectTypeOf(target).toEqualTypeOf<Tab>()
      },
    }))

    expectTypeOf(fromComputed.activeContext.value).toEqualTypeOf<Tab>()
    expectTypeOf(fromComputed.switchTo).parameter(0).toEqualTypeOf<Tab>()
    expectTypeOf(fromGetter.activeContext.value).toEqualTypeOf<Tab>()
    expectTypeOf(fromGetter.switchTo).parameter(0).toEqualTypeOf<Tab>()
  })

  it('types an unannotated callback from a literal source', () => {
    const literal = useQueryStates(schema).use(withContext({
      active: 'products',
      navigate: (target) => {
        expectTypeOf(target).toEqualTypeOf<'products'>()
      },
    }))

    expectTypeOf(literal.activeContext.value).toEqualTypeOf<'products'>()
  })

  it('keeps a widened source widened', () => {
    const wide = ref('products')
    const widened = useQueryStates(schema).use(withContext({
      active: wide,
      navigate: (target) => {
        expectTypeOf(target).toEqualTypeOf<string>()
      },
    }))

    expectTypeOf(widened.activeContext.value).toEqualTypeOf<string>()
  })

  it('types the callback through stored, explicit and chained forms', () => {
    const stored = withContext({
      active: tab,
      navigate: (target) => {
        expectTypeOf(target).toEqualTypeOf<Tab>()
      },
    })
    const fromStored = useQueryStates(schema).use(stored)
    const explicitSchema = useQueryStates(schema).use(withContext(schema, {
      active: tab,
      navigate: (target) => {
        expectTypeOf(target).toEqualTypeOf<Tab>()
      },
    }))
    const explicitParam = useQueryState(category).use(withContext(category, {
      active: tab,
      navigate: (target) => {
        expectTypeOf(target).toEqualTypeOf<Tab>()
      },
    }))
    const explicitPath = useQueryState('q').use(withContext('q', {
      active: tab,
      navigate: (target) => {
        expectTypeOf(target).toEqualTypeOf<Tab>()
      },
    }))
    const chained = useQueryStates(schema).use(withActiveParams()).use(withContext({
      active: tab,
      only: { category: ['products'] },
      navigate: (target) => {
        expectTypeOf(target).toEqualTypeOf<Tab>()
      },
    }))

    expectTypeOf(fromStored.switchTo).parameter(0).toEqualTypeOf<Tab>()
    expectTypeOf(explicitSchema.switchTo).parameter(0).toEqualTypeOf<Tab>()
    expectTypeOf(explicitParam.switchTo).parameter(0).toEqualTypeOf<Tab>()
    expectTypeOf(explicitPath.switchTo).parameter(0).toEqualTypeOf<Tab>()
    expectTypeOf(chained.switchTo).parameter(0).toEqualTypeOf<Tab>()
    expectTypeOf(chained.activeCount.value).toEqualTypeOf<number>()
  })

  it('rejects an incompatible callback', () => {
    // @ts-expect-error the callback accepts a different context union
    useQueryStates(schema).use(withContext({ active: tab, navigate: (_target: 'other') => {} }))
    // @ts-expect-error the callback is not a function
    useQueryStates(schema).use(withContext({ active: tab, navigate: 'products' }))
  })
})

describe('withContext declared effects', () => {
  type Tab = 'products' | 'orders'
  const tab = ref<Tab>('products')

  type OptionsOf<TModule> = TModule extends QueryRegisteredMarkers<any, any, infer TOptions, any, any, any> ? TOptions : never
  type InferenceOf<TModule> = TModule extends QueryRegisteredMarkers<any, any, any, infer TInference, any, any> ? TInference : never
  type GroupedResult<TModule> = QueryModuleStatesResult<'vuqs:context', QueryStateSchema, OptionsOf<TModule>, InferenceOf<TModule>>
  type SingleResult<TModule> = QueryModuleStateResult<'vuqs:context', { value: AnyDefinedQueryParam }, OptionsOf<TModule>, InferenceOf<TModule>>

  it('declares the restricted params as optional presence paths', () => {
    const restricted = withContext({ active: tab, only: { page: ['products'], size: ['orders'] } })
    const preserved = withContext({ active: tab, preserve: ['page'] })

    expectTypeOf(restricted).not.toBeAny()
    expectTypeOf(preserved).not.toBeAny()
    expectTypeOf<GroupedResult<typeof restricted>['pipeline']>().toEqualTypeOf<ContextPipeline<'page' | 'size'>>()
    expectTypeOf<GroupedResult<typeof preserved>['pipeline']>().toEqualTypeOf<ContextPipeline<never>>()
  })

  it('declares the bound value only when the single param is restricted', () => {
    const restricted = withContext('page', { active: tab, only: ['products'] })
    const preserved = withContext('page', { active: tab, preserve: true })

    expectTypeOf(restricted).not.toBeAny()
    expectTypeOf(preserved).not.toBeAny()
    expectTypeOf<SingleResult<typeof restricted>['pipeline']>().toEqualTypeOf<ContextPipeline<'value'>>()
    expectTypeOf<SingleResult<typeof preserved>['pipeline']>().toEqualTypeOf<ContextPipeline<never>>()
  })

  it('keeps callback inference and concrete effect paths apart when stored', () => {
    const stored = withContext({
      active: tab,
      only: { page: ['products'] },
      navigate: (target) => {
        expectTypeOf(target).toEqualTypeOf<Tab>()
      },
    })

    expectTypeOf(stored).not.toBeAny()
    expectTypeOf<InferenceOf<typeof stored>>().toEqualTypeOf<typeof tab>()
    expectTypeOf<GroupedResult<typeof stored>['pipeline']>().toEqualTypeOf<ContextPipeline<'page'>>()
    expectTypeOf<GroupedResult<typeof stored>['api']['activeContext']['value']>().toEqualTypeOf<Tab>()
  })
})

describe('withContext captured read types', () => {
  const tab = ref<'products' | 'orders'>('products')

  it('keeps a restricted defaulted param optional despite preserve', () => {
    const grouped = useQueryStates({ page: queryParam('page', codecs.integer.withDefault(1)) })
      .use(withContext({ active: tab, preserve: ['page'], only: { page: ['products'] } }))
    const single = useQueryState('page', codecs.integer.withDefault(1))
      .use(withContext({ active: tab, preserve: true, only: ['products'] }))

    expectTypeOf(grouped.values.page).toEqualTypeOf<number | undefined>()
    expectTypeOf(single.value).toEqualTypeOf<number | undefined>()
  })

  it('keeps an unrestricted defaulted param defined whether it is reset or preserved', () => {
    const grouped = useQueryStates({
      reset: queryParam('reset', codecs.string.withDefault('fallback')),
      kept: queryParam('kept', codecs.string.withDefault('')),
    }).use(withContext({ active: tab, preserve: ['kept'] }))
    const reset = useQueryState('reset', codecs.string.withDefault('fallback')).use(withContext({ active: tab, preserve: false }))
    const kept = useQueryState('kept', codecs.string.withDefault('')).use(withContext({ active: tab, preserve: true }))

    expectTypeOf(grouped.values.reset).toEqualTypeOf<string>()
    expectTypeOf(grouped.values.kept).toEqualTypeOf<string>()
    expectTypeOf(reset.value).toEqualTypeOf<string>()
    expectTypeOf(kept.value).toEqualTypeOf<string>()
  })

  it('does not narrow a non-defaulted param through preserve alone', () => {
    const grouped = useQueryStates({ label: queryParam('label', codecs.string) })
      .use(withContext({ active: tab, preserve: ['label'] }))
    const single = useQueryState('label', codecs.string).use(withContext({ active: tab, preserve: true }))

    expectTypeOf(grouped.values.label).toEqualTypeOf<string | undefined>()
    expectTypeOf(single.value).toEqualTypeOf<string | undefined>()
  })

  it('applies the restriction only to the restricted params', () => {
    const grouped = useQueryStates({
      page: queryParam('page', codecs.integer.withDefault(1)),
      size: queryParam('size', codecs.integer.withDefault(20)),
    }).use(withContext({ active: tab, only: { page: ['products'] } }))

    expectTypeOf(grouped.values.page).toEqualTypeOf<number | undefined>()
    expectTypeOf(grouped.values.size).toEqualTypeOf<number>()
    expectTypeOf(grouped.activeContext.value).toEqualTypeOf<'products' | 'orders'>()
  })
})
