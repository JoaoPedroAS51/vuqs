import type { ParsedQuery, ParsedQueryRaw } from '../../src/core/types'
import type { UseQueryStatesReturn } from '../../src/core/use-query-states'
import { describe, expect, it, vi } from 'vitest'
import { createSSRApp, defineComponent, h, ref } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { installQueryAdapter, provideQueryAdapter } from '../../src/core/adapter'
import { codecs } from '../../src/core/codec'
import { queryParam } from '../../src/core/query-param'
import { useQueryState } from '../../src/core/use-query-state'
import { useQueryStates } from '../../src/core/use-query-states'

const flush = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0))

const schema = {
  q: queryParam('q', codecs.string),
}

function mount(parentSetup: () => () => unknown): Promise<string> {
  return renderToString(createSSRApp(defineComponent({ setup: parentSetup })))
}

describe('provideQueryAdapter', () => {
  it('reads and writes via the adapter when options are omitted', async () => {
    const query = ref<ParsedQuery>({ q: 'phone' })
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

    expect(states!.values.q).toBe('phone')

    states!.values.q = 'sale'
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

    states!.values.q = 'a'
    await flush()
    expect(navigate).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ history: 'push' }))

    states!.patch({ q: 'b' }, { history: 'replace' })
    await flush()
    expect(navigate).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ history: 'replace' }))
  })

  it('throws when no adapter is provided', async () => {
    const Orphan = defineComponent({
      setup() {
        useQueryStates(schema)
        return () => h('div')
      },
    })

    await expect(renderToString(createSSRApp(Orphan))).rejects.toThrow(/provideQueryAdapter/)
  })

  it('resolves the adapter for useQueryState too', async () => {
    const query = ref<ParsedQuery>({ q: 'phone' })
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

    expect(value).toBe('phone')
  })

  it('resolves the adapter for useQueryState with a definition', async () => {
    const query = ref<ParsedQuery>({ q: 'phone' })
    let value: string | undefined

    const Child = defineComponent({
      setup() {
        value = useQueryState(queryParam('q', codecs.string)).value
        return () => h('div')
      },
    })

    await mount(() => {
      provideQueryAdapter({ query: () => query.value, navigate: () => {} })
      return () => h(Child)
    })

    expect(value).toBe('phone')
  })

  it('resolves an adapter installed at the app level via installQueryAdapter', async () => {
    const query = ref<ParsedQuery>({ q: 'phone' })
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

    const app = createSSRApp(Child)
    installQueryAdapter(app, { query: () => query.value, navigate })
    await renderToString(app)

    expect(states!.values.q).toBe('phone')

    states!.values.q = 'sale'
    await flush()

    expect(query.value).toEqual({ q: 'sale' })
  })

  it('passes adapter defaultOptions (clearOnDefault) through to the engine', async () => {
    const pageSchema = { page: queryParam('page', codecs.integer.withDefault(1)) }
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

    states!.values.page = 1
    await flush()

    expect(query.value).toEqual({ page: '1' })
  })
})
