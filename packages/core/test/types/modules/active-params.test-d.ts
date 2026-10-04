import { describe, expectTypeOf, it } from 'vitest'
import { useQueryState } from '../../../src/core/bindings/use-query-state'
import { useQueryStates } from '../../../src/core/bindings/use-query-states'
import { codecs } from '../../../src/core/codecs/catalog'
import { queryParam } from '../../../src/core/schema/params/query-param'
import { withActiveParams } from '../../../src/modules/active-params'

const schema = {
  q: queryParam('q', codecs.string),
  category: queryParam('category', codecs.literal(['cpu', 'gpu'] as const)),
}

describe('withActiveParams inference', () => {
  it('adds schema-keyed activity APIs to useQueryStates', () => {
    const q = useQueryStates(schema).use(withActiveParams({ exclude: ['category'] }))

    expectTypeOf(q.activeKeys.value).toEqualTypeOf<readonly ('q' | 'category')[]>()
    expectTypeOf(q.activeCount.value).toEqualTypeOf<number>()
    expectTypeOf(q.hasActive.value).toEqualTypeOf<boolean>()
    expectTypeOf(q.isActive('q')).toEqualTypeOf<boolean>()

    expectTypeOf(q.isActive).parameter(0).toEqualTypeOf<'q' | 'category'>()

    // @ts-expect-error exclude only accepts schema keys
    useQueryStates(schema).use(withActiveParams({ exclude: ['nope'] }))
  })

  it('supports the schema-targeted grouped form', () => {
    useQueryStates(schema).use(withActiveParams(schema, { exclude: ['q'] }))

    // @ts-expect-error exclude only accepts keys from the targeted schema
    withActiveParams(schema, { exclude: ['nope'] })
  })

  it('adds a computed isActive flag to useQueryState', () => {
    const q = useQueryState('q').use(withActiveParams())

    expectTypeOf(q.isActive.value).toEqualTypeOf<boolean>()

    // @ts-expect-error exclude is a grouped-only option
    useQueryState('q').use(withActiveParams({ exclude: ['q'] }))
  })
})
