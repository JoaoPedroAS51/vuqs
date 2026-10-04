import type { QueryStateValues, QueryStateWriteValues } from '../../../../src/core/schema/schema'
import { describe, expectTypeOf, it } from 'vitest'
import { toQueryRef } from '../../../../src/core/bindings/to-query-ref'
import { toQueryRefs } from '../../../../src/core/bindings/to-query-refs'
import { useQueryState } from '../../../../src/core/bindings/use-query-state'
import { useQueryStates } from '../../../../src/core/bindings/use-query-states'
import { codecs } from '../../../../src/core/codecs/catalog'
import { queryParam } from '../../../../src/core/schema/params/query-param'
import { createSerializer } from '../../../../src/core/schema/serializer'

describe('write value inference', () => {
  const schema = {
    q: queryParam('q', codecs.string),
    page: queryParam('page', codecs.integer.withDefault(1)),
    payload: queryParam('payload', codecs.json<{ id: number } | null>()),
  }

  it('accepts explicit undefined and keeps null within the codec type', () => {
    const patch: QueryStateWriteValues<typeof schema> = { page: undefined, payload: null }
    const replacement: QueryStateValues<typeof schema> = { page: undefined, payload: null }
    const query = useQueryStates(schema)
    const serialize = createSerializer(schema)

    query.patch(patch)
    query.replace(replacement)
    query.binding.transact({ mode: 'patch', values: patch })
    query.binding.transact({ mode: 'replace', values: replacement })
    serialize(patch)
    toQueryRef(query).value = replacement
  })

  it('rejects null for a non-nullable codec in every write entry point', () => {
    const query = useQueryStates(schema)
    const serialize = createSerializer(schema)
    const ref = toQueryRef(query)

    expectTypeOf(serialize).toBeFunction()
    expectTypeOf(ref.value).toBeObject()
    expectTypeOf<{ q: null }>().not.toExtend<Parameters<typeof query.patch>[0]>()
    expectTypeOf<{ q: null }>().not.toExtend<Parameters<typeof query.replace>[0]>()
    expectTypeOf<{ mode: 'patch', values: { q: null } }>().not.toExtend<Parameters<typeof query.binding.transact>[0]>()
    expectTypeOf<{ q: null }>().not.toExtend<Parameters<typeof serialize>[1]>()
    expectTypeOf<{ q: null }>().not.toExtend<typeof ref.value>()
  })

  it('preserves nullable codec types in reactive lenses', () => {
    const query = useQueryStates(schema)
    const refs = toQueryRefs(query)
    const single = useQueryState('payload', codecs.json<{ id: number } | null>())

    expectTypeOf(query.values.payload).toEqualTypeOf<{ id: number } | null | undefined>()
    expectTypeOf(refs.payload.value).toEqualTypeOf<{ id: number } | null | undefined>()
    expectTypeOf(single.value).toEqualTypeOf<{ id: number } | null | undefined>()

    query.values.payload = null
    refs.payload.set(null)
    single.set(null)

    expectTypeOf<null>().not.toExtend<typeof query.values.q>()
    expectTypeOf<null>().not.toExtend<Parameters<typeof refs.q.set>[0]>()
  })
})
