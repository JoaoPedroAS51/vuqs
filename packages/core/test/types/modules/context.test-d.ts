import { describe, expectTypeOf, it } from 'vitest'
import { ref } from 'vue'
import { useQueryState } from '../../../src/core/bindings/use-query-state'
import { useQueryStates } from '../../../src/core/bindings/use-query-states'
import { codecs } from '../../../src/core/codecs/catalog'
import { queryParam } from '../../../src/core/schema/params/query-param'
import { withContext } from '../../../src/modules/context'

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
