import { describe, expect, it } from 'vitest'
import { toQueryRefs } from '../../../../src/core/bindings/to-query-refs'
import { useQueryStates } from '../../../../src/core/bindings/use-query-states'
import { codecs } from '../../../../src/core/codecs/catalog'
import { queryParam } from '../../../../src/core/schema/params/query-param'
import { withTestQuery as setup } from '../../../helpers/adapter'

const flush = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0))

const schema = {
  q: queryParam('q', codecs.string),
  page: queryParam('page', codecs.integer.withDefault(1)),
}

describe('toQueryRefs over the composable', () => {
  it('reads and writes each field through its ref', async () => {
    const { build } = setup({ q: 'sale' })
    const query = build(() => useQueryStates(schema))
    const { q, page } = toQueryRefs(query)

    expect(q.value).toBe('sale')
    expect(page.value).toBe(1)

    q.value = 'phone'
    await flush()

    expect(query.values.q).toBe('phone')
  })

  it('restores per-field set with per-call options', async () => {
    const { build, navigate } = setup()
    const query = build(() => useQueryStates(schema))
    const { q } = toQueryRefs(query)

    q.set('newest', { history: 'push' })
    await flush()

    expect(query.values.q).toBe('newest')
    expect(navigate.mock.calls.at(-1)?.[1]).toMatchObject({ history: 'push' })
  })

  it('clears a field with clear() and with .value = undefined', async () => {
    const { build } = setup({ q: 'sale' })
    const query = build(() => useQueryStates(schema))
    const { q } = toQueryRefs(query)

    q.clear()
    await flush()
    expect(query.values.q).toBeUndefined()

    q.value = 'again'
    await flush()
    q.value = undefined
    await flush()
    expect(query.values.q).toBeUndefined()
  })

  it('exposes exactly one ref per param', () => {
    const { build } = setup()
    const query = build(() => useQueryStates(schema))

    expect(Object.getOwnPropertySymbols(toQueryRefs(query))).toHaveLength(0)
    expect(Object.keys(toQueryRefs(query))).toEqual(['q', 'page'])
  })
})
