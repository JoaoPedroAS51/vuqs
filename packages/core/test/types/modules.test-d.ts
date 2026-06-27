import type { QueryCore } from '../../src/core/query-core'
import type { QueryStateSchema } from '../../src/core/schema'
import { describe, expectTypeOf, it } from 'vitest'
import { ref } from 'vue'
import { codecs } from '../../src/core/codec'
import { defineQueryModule } from '../../src/core/module'
import { queryParam } from '../../src/core/query-param'
import { useQueryState } from '../../src/core/use-query-state'
import { useQueryStates } from '../../src/core/use-query-states'
import { withContext } from '../../src/modules/context'
import { withRuntimeDefaults } from '../../src/modules/runtime-defaults'

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
})

describe('single-state module composition', () => {
  const dualMode = defineQueryModule<typeof schema, { grouped: true }, { single: true, key: string }>({
    queryStates: () => ({ grouped: true }),
    queryState: (_core, key) => ({ single: true, key }),
  })

  const functionOnly = <TSchema extends QueryStateSchema>(_core: QueryCore<TSchema>): { grouped: true } => ({ grouped: true })

  it('accumulates single module API on useQueryState', () => {
    const q = useQueryState('q').use(dualMode)

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
    defineQueryModule({
      queryStates: () => ({ grouped: true }),
      // @ts-expect-error queryState must accept the single-param core passed by useQueryState
      queryState: (_core: QueryCore<typeof schema>, key: keyof typeof schema & string) => ({ key }),
    })
  })

  it('uses the grouped projection on useQueryStates', () => {
    const q = useQueryStates(schema).use(dualMode)

    expectTypeOf(q.grouped).toEqualTypeOf<true>()
    // @ts-expect-error the single projection is not added to useQueryStates
    expectTypeOf(q.single).toBeNever()
  })

  it('keeps function-only modules valid for useQueryStates', () => {
    const q = useQueryStates(schema).use(functionOnly)

    expectTypeOf(q.grouped).toEqualTypeOf<true>()
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
})
