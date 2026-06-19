import { describe, expect, it, vi } from 'vitest'
import { computed, ref as vueRef } from 'vue'
import { codecs } from '../../src/core/codec'
import { queryParam } from '../../src/core/query-param'
import { toQueryRef } from '../../src/core/to-query-ref'
import { useQueryStates } from '../../src/core/use-query-states'
import { withTestQuery as setup } from '../helpers/adapter'

const flush = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0))

const schema = {
  q: queryParam('q', codecs.string),
  page: queryParam('page', codecs.integer.withDefault(1)),
}

describe('toQueryRef', () => {
  it('reads a plain snapshot: omits absent params, keeps defaults', () => {
    const { build } = setup({ q: 'sale' })
    const ref = build(() => toQueryRef(useQueryStates(schema)))

    expect(ref.value).toEqual({ q: 'sale', page: 1 })

    const empty = setup().build(() => toQueryRef(useQueryStates(schema)))
    expect(empty.value).toEqual({ page: 1 }) // q omitted
  })

  it('replaces the whole state on assignment: sets given, clears absent', async () => {
    const { build } = setup({ q: 'sale' })
    const query = build(() => useQueryStates(schema))
    const ref = toQueryRef(query)

    ref.value = { page: 3 }
    await flush()

    expect(query.values.q).toBeUndefined()
    expect(query.values.page).toBe(3)
  })

  it('treats an explicitly undefined property as a clear during replacement', async () => {
    const { query: rawQuery, build } = setup({ q: 'sale', page: '3' })
    const ref = build(() => toQueryRef(useQueryStates(schema)))

    ref.value = { q: undefined }
    await flush()

    expect(rawQuery.value).toEqual({})
  })

  it('set() takes per-call options and preserves unmanaged params', async () => {
    const { query, navigate, build } = setup({ keep: 'me', q: 'sale' })
    const ref = build(() => toQueryRef(useQueryStates(schema)))

    ref.set({ q: 'phone' }, { history: 'push' })
    await flush()

    expect(query.value).toEqual({ keep: 'me', q: 'phone' })
    expect(navigate.mock.calls.at(-1)?.[1]).toMatchObject({ history: 'push' })
  })

  it('clear() removes every managed param, keeping unmanaged ones', async () => {
    const { query, build } = setup({ keep: 'me', q: 'sale', page: '3' })
    const ref = build(() => toQueryRef(useQueryStates(schema)))

    ref.clear()
    await flush()

    expect(query.value).toEqual({ keep: 'me' })
  })

  it('keeps a stable reference while the snapshot content is unchanged', async () => {
    const { build } = setup({ q: 'sale' })
    const query = build(() => useQueryStates(schema))
    const ref = toQueryRef(query)

    const first = ref.value
    query.values.page = 1 // page's default, cleared on write: content unchanged
    await flush()

    expect(ref.value).toBe(first)
  })

  it('reuses its cache when a source recomputes an equal fresh object', () => {
    const revision = vueRef(0)
    const source = {
      binding: {
        keys: ['q'],
        read: computed(() => {
          void revision.value
          return { q: 'same' }
        }),
        transact: vi.fn(),
      },
    }
    const ref = toQueryRef(source as never)
    const first = ref.value

    revision.value++

    expect(ref.value).toBe(first)
  })
})
