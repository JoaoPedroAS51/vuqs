import type { ParsedQuery, ParsedQueryRaw } from '../../src/core/types'
import type { UseQueryStatesReturn } from '../../src/core/use-query-states'
import { describe, expect, it, vi } from 'vitest'
import { createSSRApp, defineComponent, h, ref } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { provideQueryAdapter } from '../../src/core/adapter'
import { codecs } from '../../src/core/codec'
import { defineQueryState } from '../../src/core/define-query-state'
import { useQueryState } from '../../src/core/use-query-state'
import { useQueryStates } from '../../src/core/use-query-states'

const flush = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0))

const schema = {
  q: defineQueryState('q', codecs.string),
}

function mount(parentSetup: () => () => unknown): Promise<string> {
  return renderToString(createSSRApp(defineComponent({ setup: parentSetup })))
}

describe('provideQueryAdapter', () => {
  it('reads and writes via the adapter when options are omitted', async () => {
    const query = ref<ParsedQuery>({ q: 'lease' })
    const navigate = vi.fn((next: ParsedQueryRaw) => {
      query.value = next
    })
    let states: UseQueryStatesReturn<typeof schema> | undefined

    const Child = defineComponent({
      setup() {
        states = useQueryStates(schema)
        return () => h('div')
      },
    })

    await mount(() => {
      provideQueryAdapter({ query: () => query.value, navigate })
      return () => h(Child)
    })

    expect(states!.q.value).toBe('lease')

    states!.q.value = 'sale'
    await flush()

    expect(query.value).toEqual({ q: 'sale' })
  })

  it('applies adapter defaultOptions, overridable per call', async () => {
    const query = ref<ParsedQuery>({})
    const navigate = vi.fn((next: ParsedQueryRaw) => {
      query.value = next
    })
    let states: UseQueryStatesReturn<typeof schema> | undefined

    const Child = defineComponent({
      setup() {
        states = useQueryStates(schema)
        return () => h('div')
      },
    })

    await mount(() => {
      provideQueryAdapter({ query: () => query.value, navigate, defaultOptions: { history: 'push' } })
      return () => h(Child)
    })

    states!.q.value = 'a'
    await flush()
    expect(navigate).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ history: 'push' }))

    states!.q.set('b', { history: 'replace' })
    await flush()
    expect(navigate).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ history: 'replace' }))
  })

  it('prefers explicit options over the adapter', async () => {
    const adapterNavigate = vi.fn()
    const explicitQuery = ref<ParsedQuery>({ q: 'explicit' })
    const explicitNavigate = vi.fn((next: ParsedQueryRaw) => {
      explicitQuery.value = next
    })
    let states: UseQueryStatesReturn<typeof schema> | undefined

    const Child = defineComponent({
      setup() {
        states = useQueryStates(schema, { query: () => explicitQuery.value, navigate: explicitNavigate })
        return () => h('div')
      },
    })

    await mount(() => {
      provideQueryAdapter({ query: () => ({ q: 'adapter' }), navigate: adapterNavigate })
      return () => h(Child)
    })

    expect(states!.q.value).toBe('explicit')

    states!.q.value = 'x'
    await flush()

    expect(explicitNavigate).toHaveBeenCalled()
    expect(adapterNavigate).not.toHaveBeenCalled()
  })

  it('throws when neither options nor an adapter provide a query source', async () => {
    const Orphan = defineComponent({
      setup() {
        useQueryStates(schema)
        return () => h('div')
      },
    })

    await expect(renderToString(createSSRApp(Orphan))).rejects.toThrow(/provideQueryAdapter/)
  })

  it('resolves the adapter for useQueryState too', async () => {
    const query = ref<ParsedQuery>({ q: 'lease' })
    let value: string | undefined

    const Child = defineComponent({
      setup() {
        value = useQueryState('q', codecs.string).value
        return () => h('div')
      },
    })

    await mount(() => {
      provideQueryAdapter({ query: () => query.value, navigate: () => {} })
      return () => h(Child)
    })

    expect(value).toBe('lease')
  })

  it('resolves the adapter for useQueryState with a definition', async () => {
    const query = ref<ParsedQuery>({ q: 'lease' })
    let value: string | undefined

    const Child = defineComponent({
      setup() {
        value = useQueryState(defineQueryState('q', codecs.string)).value
        return () => h('div')
      },
    })

    await mount(() => {
      provideQueryAdapter({ query: () => query.value, navigate: () => {} })
      return () => h(Child)
    })

    expect(value).toBe('lease')
  })

  it('passes adapter defaultOptions (clearOnDefault) through to the engine', async () => {
    const pageSchema = { page: defineQueryState('page', codecs.integer.withDefault(1)) }
    const query = ref<ParsedQuery>({})
    const navigate = vi.fn((next: ParsedQueryRaw) => {
      query.value = next
    })
    let states: UseQueryStatesReturn<typeof pageSchema> | undefined

    const Child = defineComponent({
      setup() {
        states = useQueryStates(pageSchema)
        return () => h('div')
      },
    })

    await mount(() => {
      provideQueryAdapter({ query: () => query.value, navigate, defaultOptions: { clearOnDefault: false } })
      return () => h(Child)
    })

    states!.page.value = 1
    await flush()

    expect(query.value).toEqual({ page: '1' })
  })
})
