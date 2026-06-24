import { describe, expectTypeOf, it } from 'vitest'
import { ref } from 'vue'
import { codecs } from '../../src/core/codec'
import { defineQueryState } from '../../src/core/define-query-state'
import { useQueryStates } from '../../src/core/use-query-states'
import { withContext } from '../../src/modules/context'
import { withEffective } from '../../src/modules/effective'

const schema = {
  q: defineQueryState('q', codecs.string),
  category: defineQueryState('category', codecs.literal(['cpu', 'gpu'] as const)),
}

const options = { query: {}, navigate: () => {} }

describe('module composition', () => {
  it('accumulates each module API on the composable', () => {
    const tab = ref<'products' | 'orders'>('products')

    const q = useQueryStates(schema, options)
      .use(withEffective())
      .use(withContext({ active: tab, preserve: ['q'], only: { category: ['products'] } }))

    expectTypeOf(q.values.q).toEqualTypeOf<string | undefined>()
    expectTypeOf(q.selected.q).toEqualTypeOf<string | undefined>()
    expectTypeOf(q.effective.q).toEqualTypeOf<string | undefined>()
    expectTypeOf(q.activeContext.value).toEqualTypeOf<'products' | 'orders'>()
    expectTypeOf(q.setDefaults).toBeFunction()
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
    useQueryStates(schema, options).use(
      withContext({ active: tab, preserve: ['q', 'category'], only: { category: ['products'] } }),
    )
  })

  it('rejects unknown keys inferred from the composable schema', () => {
    // @ts-expect-error 'nope' is not a field of the schema
    useQueryStates(schema, options).use(withContext({ active: tab, preserve: ['nope'] }))
    // @ts-expect-error 'nope' is not a field of the schema
    useQueryStates(schema, options).use(withContext({ active: tab, only: { nope: ['products'] } }))
  })
})
