import type { ParsedQuery, ParsedQueryRaw } from 'vuqs'
import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { codecs, defineQueryState } from 'vuqs'
import { createQueryStore } from '../../src/create-query-store'

const flush = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0))

function setup(initial: ParsedQuery = {}) {
  const query = ref<ParsedQuery>(initial)
  const navigate = vi.fn((next: ParsedQueryRaw) => {
    query.value = next
  })

  return { query, navigate }
}

const schema = {
  currency: defineQueryState('currency', codecs.string),
  yearEnding: defineQueryState('yearEnding', codecs.string),
}

describe('createQueryStore (no context)', () => {
  it('reads selected from the query', () => {
    const { query, navigate } = setup({ currency: 'USD' })
    const store = createQueryStore({ schema, query, navigate })

    expect(store.selected.value).toEqual({ currency: 'USD' })
  })

  it('writes selected to the URL', async () => {
    const { query, navigate } = setup()
    const store = createQueryStore({ schema, query, navigate })

    store.setValue('currency', 'EUR')
    await flush()

    expect(query.value).toEqual({ currency: 'EUR' })
    expect(store.selected.value).toEqual({ currency: 'EUR' })
  })

  it('shows defaults in effective but never in the URL', async () => {
    const { query, navigate } = setup()
    const store = createQueryStore({ schema, query, navigate })

    store.setDefaults({ currency: 'USD' })
    await flush()

    expect(store.effective.value).toEqual({ currency: 'USD' })
    expect(store.selected.value).toEqual({})
    expect(query.value).toEqual({})
    expect(navigate).not.toHaveBeenCalled()
  })

  it('layers selected over defaults', async () => {
    const { query, navigate } = setup()
    const store = createQueryStore({ schema, query, navigate })

    store.setDefaults({ currency: 'USD' })
    store.setValue('currency', 'EUR')
    await flush()

    expect(store.effective.value).toEqual({ currency: 'EUR' })
    expect(query.value).toEqual({ currency: 'EUR' })
  })

  it('clears defaults', () => {
    const { query, navigate } = setup()
    const store = createQueryStore({ schema, query, navigate })

    store.setDefaults({ currency: 'USD' })
    store.clearDefaults()

    expect(store.effective.value).toEqual({})
  })

  it('coalesces setValues into one navigation', async () => {
    const { query, navigate } = setup()
    const store = createQueryStore({ schema, query, navigate })

    store.setValues({ currency: 'EUR', yearEnding: '2024' })
    await flush()

    expect(navigate).toHaveBeenCalledTimes(1)
    expect(query.value).toEqual({ currency: 'EUR', yearEnding: '2024' })
  })

  it('clears a field with null and skips an undefined field in setValues', async () => {
    const { query, navigate } = setup({ currency: 'USD', yearEnding: '2024' })
    const store = createQueryStore({ schema, query, navigate })

    store.setValues({ currency: null, yearEnding: undefined })
    await flush()

    expect(query.value).toEqual({ yearEnding: '2024' })
  })

  it('ignores keys not in the schema, without crashing a later reconcile', async () => {
    const { query, navigate } = setup({ keep: 'me' })
    const store = createQueryStore({ schema, query, navigate })

    // @ts-expect-error a runtime caller may pass a foreign key
    store.setValues({ currency: 'EUR', nope: 'y' })
    await flush()

    expect(query.value).toEqual({ keep: 'me', currency: 'EUR' })

    query.value = { keep: 'other', currency: 'EUR' }
    await flush()

    expect(store.selected.value).toEqual({ currency: 'EUR' })
  })

  it('clears all selected values', async () => {
    const { query, navigate } = setup({ currency: 'USD', other: 'keep' })
    const store = createQueryStore({ schema, query, navigate })

    store.clear()
    await flush()

    expect(query.value).toEqual({ other: 'keep' })
    expect(store.selected.value).toEqual({})
  })

  it('builds a query for the current selection without navigating', () => {
    const { query, navigate } = setup({ currency: 'USD', other: 'keep' })
    const store = createQueryStore({ schema, query, navigate })

    expect(store.buildQuery(query.value)).toEqual({ currency: 'USD', other: 'keep' })
    expect(navigate).not.toHaveBeenCalled()
  })
})

describe('createQueryStore (with context)', () => {
  function setupContextStore(initial: ParsedQuery = {}) {
    const { query, navigate } = setup(initial)
    const active = ref<'monthly' | 'annual'>('monthly')
    const store = createQueryStore({
      schema,
      query,
      navigate,
      context: {
        active,
        only: { yearEnding: ['annual'] },
      },
    })

    return { query, navigate, active, store }
  }

  it('drops a field invalid in the active context from selected and effective', () => {
    const { store } = setupContextStore({ yearEnding: '2024' })

    expect(store.selected.value).toEqual({})
    expect(store.effective.value).toEqual({})
  })

  it('includes the field once its context is active', () => {
    const { active, store } = setupContextStore({ yearEnding: '2024' })

    active.value = 'annual'

    expect(store.selected.value).toEqual({ yearEnding: '2024' })
  })

  it('does not write a field invalid in the active context', async () => {
    const { query, store } = setupContextStore({ currency: 'USD' })

    store.setValue('yearEnding', '2025')
    await flush()

    expect(query.value).toEqual({ currency: 'USD' })
    expect(store.selected.value).toEqual({ currency: 'USD' })
  })

  it('does not surface invalid-context fields in selected when clearing', () => {
    const { store } = setupContextStore({ currency: 'USD' })

    store.clear()

    expect(Object.keys(store.selected.value)).not.toContain('yearEnding')
  })

  it('filters invalid-context defaults out of effective', () => {
    const { store } = setupContextStore()

    store.setDefaults({ currency: 'USD', yearEnding: '2024' })

    expect(store.effective.value).toEqual({ currency: 'USD' })
  })

  it('exposes the active context', () => {
    const { active, store } = setupContextStore()

    expect(store.activeContext.value).toBe('monthly')

    active.value = 'annual'

    expect(store.activeContext.value).toBe('annual')
  })
})

describe('createQueryStore (context navigation)', () => {
  function setupNav(initial: ParsedQuery = {}, preserve: Array<'currency' | 'yearEnding'> = ['currency']) {
    const { query, navigate } = setup(initial)
    const active = ref<'monthly' | 'annual'>('annual')
    const store = createQueryStore({
      schema,
      query,
      navigate,
      context: { active, preserve, only: { yearEnding: ['annual'] } },
    })

    return { query, navigate, active, store }
  }

  it('keeps preserved fields, resets the rest, and preserves unmanaged params', () => {
    const { store } = setupNav()

    expect(store.buildContextQuery({ currency: 'USD', yearEnding: '2024', other: 'keep' }, 'monthly')).toEqual({
      currency: 'USD',
      other: 'keep',
    })
  })

  it('drops a preserved field invalid in the next context', () => {
    const { store } = setupNav({}, ['currency', 'yearEnding'])

    expect(store.buildContextQuery({ currency: 'USD', yearEnding: '2024' }, 'monthly')).toEqual({ currency: 'USD' })
    expect(store.buildContextQuery({ currency: 'USD', yearEnding: '2024' }, 'annual')).toEqual({
      currency: 'USD',
      yearEnding: '2024',
    })
  })

  it('clears defaults synchronously when the active context changes', () => {
    const { active, store } = setupNav()

    store.setDefaults({ currency: 'USD' })
    expect(store.defaults.value).toEqual({ currency: 'USD' })

    active.value = 'monthly'

    expect(store.defaults.value).toEqual({})
  })
})
