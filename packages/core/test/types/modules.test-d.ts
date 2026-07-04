import type { ComputedRef } from 'vue'
import type { QueryCore } from '../../src/core/query-core'
import type { QueryStateSchema, QueryStateValueAt } from '../../src/core/schema'
import { describe, expectTypeOf, it } from 'vitest'
import { computed, ref } from 'vue'
import { codecs } from '../../src/core/codec'
import { defineQueryModule } from '../../src/core/module'
import { queryParam } from '../../src/core/query-param'
import { useQueryState } from '../../src/core/use-query-state'
import { useQueryStates } from '../../src/core/use-query-states'
import { withContext } from '../../src/modules/context'
import { withRuntimeDefaults } from '../../src/modules/runtime-defaults'

interface SelectionApi<TValue> {
  selection: ComputedRef<TValue | undefined>
  resetTo: (value: TValue) => void
}

declare module '../../src/core/module' {
  // eslint-disable-next-line unused-imports/no-unused-vars -- TParam must match the base registry signature
  interface QueryModuleRegistry<TSchema extends QueryStateSchema, TParam extends string> {
    'test:selection': {
      state: { api: SelectionApi<QueryStateValueAt<TSchema, 'value'>> }
    }
  }
}

const schema = {
  q: queryParam('q', codecs.string),
  category: queryParam('category', codecs.literal(['cpu', 'gpu'] as const)),
}

describe('module composition', () => {
  it('accumulates each module API on the composable', () => {
    const tab = ref<'products' | 'orders'>('products')

    const q = useQueryStates(schema)
      .use(withRuntimeDefaults())
      .use(withContext({ active: tab, preserve: ['q'], only: { category: ['products'] } }))

    expectTypeOf(q.values.q).toEqualTypeOf<string | undefined>()
    expectTypeOf(q.selected.q).toEqualTypeOf<string | undefined>()
    expectTypeOf(q.activeContext.value).toEqualTypeOf<'products' | 'orders'>()
    expectTypeOf(q.setDefaults).toBeFunction()
  })

  it('adds single runtime-default APIs to useQueryState', () => {
    const q = useQueryState('q').use(withRuntimeDefaults())

    expectTypeOf(q.value).toEqualTypeOf<string | undefined>()
    expectTypeOf(q.selectedValue.value).toEqualTypeOf<string | undefined>()
    expectTypeOf(q.defaultValue.value).toEqualTypeOf<string | undefined>()
    q.setDefault('preset')
    q.clearDefault()
    // @ts-expect-error setDefault follows the single param value type
    q.setDefault(1)
    // @ts-expect-error the grouped projection is not added to useQueryState
    expectTypeOf(q.setDefaults).toBeNever()
  })

  it('types single runtime defaults for defaulted and composite params', () => {
    const page = useQueryState('page', codecs.integer.withDefault(1)).use(withRuntimeDefaults())

    expectTypeOf(page.value).toEqualTypeOf<number>()
    expectTypeOf(page.defaultValue.value).toEqualTypeOf<number | undefined>()
    page.setDefault(2)
    // @ts-expect-error setDefault follows the integer value type
    page.setDefault('2')

    const rangeParam = queryParam.object({
      from: queryParam('from', codecs.string),
      to: queryParam('to', codecs.string),
    }).transform({
      read(value): { from: string, to: string } | undefined {
        return value.from && value.to ? { from: value.from, to: value.to } : undefined
      },
      write: value => value,
    })
    const range = useQueryState(rangeParam).use(withRuntimeDefaults())

    expectTypeOf(range.value).toEqualTypeOf<{ from: string, to: string } | undefined>()
    expectTypeOf(range.selectedValue.value).toEqualTypeOf<{ from: string, to: string } | undefined>()
    range.setDefault({ from: '2026-01-01', to: '2026-01-31' })
    // @ts-expect-error setDefault follows the composite value shape
    range.setDefault({ from: '2026-01-01' })
  })

  it('adds single context APIs to useQueryState', () => {
    const tab = ref<'products' | 'orders'>('products')
    const category = useQueryState('category').use(
      withContext({ active: tab, preserve: true, only: ['products'] }),
    )

    expectTypeOf(category.value).toEqualTypeOf<string | undefined>()
    expectTypeOf(category.activeContext.value).toEqualTypeOf<'products' | 'orders'>()
    category.switchTo('orders')
    category.buildContextQuery({}, 'products')
    // @ts-expect-error context target follows the active context union
    category.switchTo('customers')
  })

  it('adds active-only context APIs to both facades', () => {
    const tab = ref<'products' | 'orders'>('products')

    useQueryStates(schema).use(withContext({ active: tab }))
    useQueryState('q').use(withContext({ active: tab }))
  })
})

describe('single-state module composition', () => {
  const dualMode = defineQueryModule({
    queryStates: () => ({ grouped: true as const }),
    queryState: (_core, key) => ({ single: true as const, key }),
  })

  const functionOnly = <TSchema extends QueryStateSchema>(_core: QueryCore<TSchema>): { grouped: true } => ({ grouped: true })

  it('accumulates single module API on useQueryState', () => {
    const q = useQueryState('q').use(dualMode())

    expectTypeOf(q.value).toEqualTypeOf<string | undefined>()
    expectTypeOf(q.single).toEqualTypeOf<true>()
    expectTypeOf(q.key).toEqualTypeOf<string>()
    // @ts-expect-error the grouped projection is not added to useQueryState
    expectTypeOf(q.grouped).toBeNever()
  })

  it('rejects grouped-only modules on useQueryState', () => {
    // @ts-expect-error grouped-only modules do not provide a single-state projection
    useQueryState('q').use(functionOnly)
  })

  it('rejects queryState projections bound to the grouped schema', () => {
    const boundToGroupedSchema = {
      queryStates: () => ({ grouped: true }),
      queryState: (_core: QueryCore<typeof schema>, key: keyof typeof schema & string) => ({ key }),
    }

    // @ts-expect-error queryState must accept the single-param core passed by useQueryState
    defineQueryModule(boundToGroupedSchema)
  })

  it('uses the grouped projection on useQueryStates', () => {
    const q = useQueryStates(schema).use(dualMode())

    expectTypeOf(q.grouped).toEqualTypeOf<true>()
    // @ts-expect-error the single projection is not added to useQueryStates
    expectTypeOf(q.single).toBeNever()
  })

  it('keeps function-only modules valid for useQueryStates', () => {
    const q = useQueryStates(schema).use(functionOnly)

    expectTypeOf(q.grouped).toEqualTypeOf<true>()
  })

  it('supports single-only modules and rejects them on useQueryStates', () => {
    const singleOnly = defineQueryModule({
      queryState: (_core, key) => ({ single: true, key }),
    })

    const q = useQueryState('q').use(singleOnly())

    expectTypeOf(q.single).toEqualTypeOf<boolean>()
    expectTypeOf(q.key).toEqualTypeOf<string>()
    // @ts-expect-error single-only modules are not callable grouped modules
    useQueryStates(schema).use(singleOnly())
  })
})

describe('registry-based single-state authoring', () => {
  const withSelection = defineQueryModule({
    name: 'test:selection',
    queryState: (core, key) => ({
      selection: computed(() => core.state.selected.value[key]),
      resetTo: value => core.query.set(key, value),
    }),
  })

  it('resolves the contributed API against the bound param value type', () => {
    const page = useQueryState('page', codecs.integer.withDefault(1)).use(withSelection())

    expectTypeOf(page.value).toEqualTypeOf<number>()
    expectTypeOf(page.selection.value).toEqualTypeOf<number | undefined>()
    page.resetTo(2)
    // @ts-expect-error resetTo follows the param value type
    page.resetTo('2')
  })

  it('resolves the value type for the implicit string param', () => {
    const q = useQueryState('q').use(withSelection())

    expectTypeOf(q.selection.value).toEqualTypeOf<string | undefined>()
    q.resetTo('next')
    // @ts-expect-error resetTo follows the string value type
    q.resetTo(1)
  })

  it('enforces the value type against the param the single form binds', () => {
    const category = useQueryState('category', codecs.literal(['cpu', 'gpu'] as const)).use(withSelection())

    expectTypeOf(category.selection.value).toEqualTypeOf<'cpu' | 'gpu' | undefined>()
    category.resetTo('cpu')
    // @ts-expect-error resetTo follows the literal value type
    category.resetTo('nope')
  })

  it('rejects the single-only registry module on useQueryStates', () => {
    // @ts-expect-error a single-only registry module is not a callable grouped module
    useQueryStates(schema).use(withSelection())
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
