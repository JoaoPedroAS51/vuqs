import type { LocationQuery, RouterOptions } from 'vue-router'
import type { ParsedQuery, ParsedQueryValue } from '../../src/core/types'
import type { UseQueryStatesReturn } from '../../src/core/use-query-states'
import { describe, expect, it, vi } from 'vitest'
import { createApp, createSSRApp, defineComponent, effectScope, h, toValue } from 'vue'
import { createMemoryHistory, createRouter, stringifyQuery } from 'vue-router'
import { renderToString } from 'vue/server-renderer'
import { createVueRouterAdapter, provideVueRouterAdapter } from '../../src/adapters/vue-router'
import { installQueryAdapter } from '../../src/core/adapter'
import { codecs, createCodec } from '../../src/core/codec'
import { addDebugReporter } from '../../src/core/debug/bus'
import { structuralEq } from '../../src/core/equality'
import { queryParam } from '../../src/core/query-param'
import { resetQueryRuntime } from '../../src/core/query-runtime'
import { useQueryState } from '../../src/core/use-query-state'
import { useQueryStates } from '../../src/core/use-query-states'

const flush = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0))

function makeRouter(options: Pick<RouterOptions, 'parseQuery' | 'stringifyQuery'> = {}) {
  return createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { render: () => null } }],
    ...options,
  })
}

describe('createVueRouterAdapter', () => {
  it('reads the current route query', async () => {
    const router = makeRouter()
    await router.push({ path: '/', query: { q: 'phone' } })

    const adapter = createVueRouterAdapter({ router })

    expect(toValue(adapter.query)).toEqual({ q: 'phone' })
  })

  it('emits adapter:navigate on the bus when debug is armed', async () => {
    const router = makeRouter()
    const adapter = createVueRouterAdapter({ router })
    const codes: string[] = []
    const stop = addDebugReporter(event => codes.push(event.code))

    await adapter.navigate({ q: 'x' }, { history: 'push' })
    stop()

    expect(codes).toContain('adapter:navigate')
  })

  it('writes via router.replace by default', async () => {
    const router = makeRouter()
    await router.push('/')
    const replaceSpy = vi.spyOn(router, 'replace')

    const adapter = createVueRouterAdapter({ router })
    await adapter.navigate({ q: 'sale' }, {})

    expect(replaceSpy).toHaveBeenCalled()
    expect(router.currentRoute.value.query).toEqual({ q: 'sale' })
  })

  it('uses push when history is "push"', async () => {
    const router = makeRouter()
    await router.push('/')
    const pushSpy = vi.spyOn(router, 'push')

    const adapter = createVueRouterAdapter({ router })
    await adapter.navigate({ q: 'x' }, { history: 'push' })

    expect(pushSpy).toHaveBeenCalled()
    expect(router.currentRoute.value.query).toEqual({ q: 'x' })
  })

  it('preserves the current hash on navigation', async () => {
    const router = makeRouter()
    await router.push({ path: '/', hash: '#section' })

    const adapter = createVueRouterAdapter({ router })
    await adapter.navigate({ q: 'sale' }, {})

    expect(router.currentRoute.value.hash).toBe('#section')
    expect(router.currentRoute.value.query).toEqual({ q: 'sale' })
  })

  it('rejects when navigation fails', async () => {
    const router = makeRouter()
    await router.push('/')
    vi.spyOn(router, 'replace').mockRejectedValueOnce(new Error('navigation cancelled'))

    const adapter = createVueRouterAdapter({ router })

    await expect(adapter.navigate({ q: 'sale' }, {})).rejects.toThrow('navigation cancelled')
  })

  it('rolls back an engine write when a router guard aborts navigation', async () => {
    const router = makeRouter()
    await router.push('/')
    router.beforeEach(() => false)
    const adapter = createVueRouterAdapter({ router })
    const app = createApp({})
    installQueryAdapter(app, adapter)
    const q = app.runWithContext(() => useQueryState('q', codecs.string))

    q.set('sale')
    await flush()

    expect(q.value).toBeUndefined()
    expect(router.currentRoute.value.query).toEqual({})
  })

  it('carries defaultOptions', () => {
    const router = makeRouter()

    const adapter = createVueRouterAdapter({ router, defaultOptions: { history: 'push' } })

    expect(adapter.defaultOptions).toEqual({ history: 'push' })
  })
})

describe('provideVueRouterAdapter', () => {
  it('drives useQueryStates end to end', async () => {
    const router = makeRouter()
    await router.push({ path: '/', query: { q: 'phone' } })
    await router.isReady()

    const schema = { q: queryParam('q', codecs.string) }
    let states: UseQueryStatesReturn<typeof schema> | undefined

    const Child = defineComponent({
      setup() {
        states = useQueryStates(schema)
        return () => h('div')
      },
    })
    const Parent = defineComponent({
      setup() {
        provideVueRouterAdapter()
        return () => h(Child)
      },
    })

    const app = createSSRApp(Parent)
    app.use(router)
    await renderToString(app)

    expect(states!.values.q).toBe('phone')
  })

  it('writes through the engine to the router', async () => {
    const router = makeRouter()
    await router.push('/')
    await router.isReady()

    const schema = { q: queryParam('q', codecs.string) }
    let states: UseQueryStatesReturn<typeof schema> | undefined

    const Child = defineComponent({
      setup() {
        states = useQueryStates(schema)
        return () => h('div')
      },
    })
    const Parent = defineComponent({
      setup() {
        provideVueRouterAdapter()
        return () => h(Child)
      },
    })

    const app = createSSRApp(Parent)
    app.use(router)
    await renderToString(app)

    states!.values.q = 'sale'
    await flush()

    expect(router.currentRoute.value.query).toEqual({ q: 'sale' })
  })
})

describe('createVueRouterAdapter: query commits', () => {
  it.each([
    { name: 'number', written: '3', committed: 3, external: 4, search: 'value=3', nextSearch: 'value=4' },
    { name: 'boolean', written: 'true', committed: true, external: false, search: 'value=true', nextSearch: 'value=false' },
    { name: 'array', written: ['1', '2'], committed: [1, 2], external: [3, 4], search: 'value=1&value=2', nextSearch: 'value=3&value=4' },
  ])('adopts later URL changes after a guard reparses $name input', async ({ written, committed, external, search, nextSearch }) => {
    const queries: Record<string, ParsedQuery> = { '': {}, [search]: { value: committed }, [nextSearch]: { value: external } }
    const router = makeRouter({
      parseQuery: search => queries[search] as LocationQuery,
      stringifyQuery: query => stringifyQuery(query),
    })
    await router.push('/')
    router.beforeEach((to) => {
      const value = to.query.value
      const serialized = typeof value === 'string' || (Array.isArray(value) && typeof value[0] === 'string')
      return serialized ? to.fullPath : undefined
    })
    const adapter = createVueRouterAdapter({ router, defaultOptions: { throttleMs: 0 } })
    const app = createApp({})
    installQueryAdapter(app, adapter)
    const scope = effectScope()
    const codec = createCodec<ParsedQueryValue>({
      parse: raw => structuralEq(raw, written) ? committed : raw,
      serialize: value => structuralEq(value, committed) ? written : value,
    })

    try {
      const value = scope.run(() => app.runWithContext(() => useQueryState('value', codec)))!
      value.set(committed)
      await vi.waitFor(() => expect(router.currentRoute.value.query.value).toEqual(committed))
      await flush()
      expect(value.value).toEqual(committed)

      await router.push(`/?${nextSearch}`)

      expect(router.currentRoute.value.query.value).toEqual(external)
      expect(value.value).toEqual(external)
    }
    finally {
      resetQueryRuntime(adapter)
      scope.stop()
    }
  })
})
