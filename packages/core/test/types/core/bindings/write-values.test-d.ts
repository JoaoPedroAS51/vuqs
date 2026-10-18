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

describe('explicit partial composed writes', () => {
  const record = queryParam.object('record', {
    a: queryParam('a', codecs.integer.withDefault(0)),
    b: queryParam('b', codecs.integer.withDefault(100)),
  })
  const schema = { record }

  it('accepts partial composed input in every explicit write entry point', () => {
    const query = useQueryStates(schema)
    const single = useQueryState(record)
    const refs = toQueryRefs(query)
    const serialize = createSerializer(schema)

    query.patch({ record: { b: 10 } })
    query.replace({ record: { b: 10 } })
    query.binding.transact({ mode: 'patch', values: { record: { b: 10 } } })
    single.set({ b: 10 })
    single.value = { b: 10 }
    refs.record.set({ b: 10 })
    refs.record.value = { b: 10 }
    toQueryRef(query).value = { record: { b: 10 } }
    serialize({ record: { b: 10 } })
  })

  it('rejects invalid leaf values in the partial input', () => {
    const query = useQueryStates(schema)
    const single = useQueryState(record)

    // @ts-expect-error - numeric child
    query.patch({ record: { b: 'x' } })
    // @ts-expect-error - numeric child
    single.set({ a: 'x' })
    // @ts-expect-error - whole-object null is not accepted
    single.set(null)
  })

  it('keeps resolved reads complete while writes are partial', () => {
    const query = useQueryStates(schema)
    const single = useQueryState(record)

    expectTypeOf(query.values.record).toEqualTypeOf<{ a: number, b: number }>()
    expectTypeOf(query.values.record.a).toEqualTypeOf<number>()
    expectTypeOf(single.value).toEqualTypeOf<{ a: number, b: number }>()
    expectTypeOf(toQueryRefs(query).record.value).toEqualTypeOf<{ a: number, b: number }>()
    expectTypeOf(toQueryRef(query).value.record).toEqualTypeOf<{ a: number, b: number } | undefined>()
  })

  it('requires the resolved shape for direct map assignment', () => {
    const query = useQueryStates(schema)

    query.values.record = { a: 0, b: 10 }
    // @ts-expect-error - direct assignment keeps the projected read type
    query.values.record = { b: 10 }
  })

  it('keeps atomic write requirements', () => {
    const atomic = queryParam.object({ payload: codecs.json<{ a: number, b: number }>() })
    const query = useQueryStates({ atomic })

    // @ts-expect-error - a JSON child is atomic: `b` is required
    query.patch({ atomic: { payload: { a: 1 } } })
    query.patch({ atomic: { payload: { a: 1, b: 2 } } })
    query.patch({ atomic: {} })
  })
})
