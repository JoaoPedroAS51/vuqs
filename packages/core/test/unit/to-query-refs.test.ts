import type { NavigateOptions, ParsedQuery, ParsedQueryRaw } from '../../src/core/types'
import { describe, expect, it, vi } from 'vitest'
import { createApp, effectScope, ref } from 'vue'
import { installQueryAdapter } from '../../src/core/adapter'
import { codecs } from '../../src/core/codec'
import { queryParam } from '../../src/core/query-param'
import { toQueryRefs } from '../../src/core/to-query-refs'
import { useQueryStates } from '../../src/core/use-query-states'
import { withRuntimeDefaults } from '../../src/modules/runtime-defaults'

const flush = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0))

function setup(initial: ParsedQuery = {}) {
  const query = ref<ParsedQuery>(initial)
  const navigate = vi.fn((next: ParsedQueryRaw, _options?: NavigateOptions) => {
    query.value = next
  })
  const app = createApp({})
  installQueryAdapter(app, { query, navigate })
  const build = <T>(factory: () => T): T => app.runWithContext(() => effectScope().run(factory)) as T

  return { query, navigate, build }
}

const schema = {
  q: queryParam('q', codecs.string),
  page: queryParam('page', codecs.integer.withDefault(1)),
}

describe('toQueryRefs over the writable values map', () => {
  it('reads and writes each field through its ref', async () => {
    const { build } = setup({ q: 'sale' })
    const { values } = build(() => useQueryStates(schema))
    const { q, page } = toQueryRefs(values)

    expect(q.value).toBe('sale')
    expect(page.value).toBe(1)

    q.value = 'lease'
    await flush()

    expect(values.q).toBe('lease')
  })

  it('restores per-field set with per-call options', async () => {
    const { build, navigate } = setup()
    const { values } = build(() => useQueryStates(schema))
    const { q } = toQueryRefs(values)

    q.set('newest', { history: 'push' })
    await flush()

    expect(values.q).toBe('newest')
    expect(navigate.mock.calls.at(-1)?.[1]).toMatchObject({ history: 'push' })
  })

  it('clears a field with clear() and with .value = undefined', async () => {
    const { build } = setup({ q: 'sale' })
    const { values } = build(() => useQueryStates(schema))
    const { q } = toQueryRefs(values)

    q.clear()
    await flush()
    expect(values.q).toBeUndefined()

    q.value = 'again'
    await flush()
    q.value = undefined
    await flush()
    expect(values.q).toBeUndefined()
  })

  it('does not expose the writer brand as a field', () => {
    const { build } = setup()
    const { values } = build(() => useQueryStates(schema))

    expect(Object.getOwnPropertySymbols(toQueryRefs(values))).toHaveLength(0)
    expect(Object.keys(toQueryRefs(values))).toEqual(['q', 'page'])
  })
})

describe('toQueryRefs over a read-only map', () => {
  it('reads each field and tracks updates without a writer', async () => {
    const { build } = setup({ q: 'sale' })
    const q = build(() => useQueryStates(schema).use(withRuntimeDefaults()))
    const { q: qRef } = toQueryRefs(q.selected)

    expect(qRef.value).toBe('sale')
    expect('set' in qRef).toBe(false)
    expect('clear' in qRef).toBe(false)

    q.values.q = 'lease'
    await flush()
    expect(qRef.value).toBe('lease')
  })
})

describe('toQueryRefs coherence with withRuntimeDefaults', () => {
  it('clears against the effective default when writing through a ref', async () => {
    const { build } = setup()
    const q = build(() => useQueryStates(schema).use(withRuntimeDefaults()))
    q.setDefaults({ page: 5 })

    const { page } = toQueryRefs(q.values)

    page.value = 1 // codec default, not the effective default (5)
    await flush()
    expect(q.selected).toEqual({ page: 1 })

    page.value = 5 // the effective default
    await flush()
    expect(q.selected).toEqual({})
    expect(q.values).toEqual({ page: 5 })
  })
})
