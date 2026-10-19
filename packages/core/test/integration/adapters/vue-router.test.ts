import type { LocationQuery, RouteLocationNormalizedLoaded, Router, RouterOptions, RouterScrollBehavior } from 'vue-router'
import type { UseQueryStatesReturn } from '../../../src/core/bindings/use-query-states'
import type { ParsedQuery, ParsedQueryValue } from '../../../src/core/query/types'
import { describe, expect, it, vi } from 'vitest'
import { createApp, createSSRApp, defineComponent, effectScope, h, toValue } from 'vue'
import { createMemoryHistory, createRouter, START_LOCATION, stringifyQuery } from 'vue-router'
import { renderToString } from 'vue/server-renderer'
import { createVueRouterAdapter, provideVueRouterAdapter } from '../../../src/adapters/vue-router'
import { installQueryAdapter } from '../../../src/core/bindings/adapter-provider'
import { useQueryState } from '../../../src/core/bindings/use-query-state'
import { useQueryStates } from '../../../src/core/bindings/use-query-states'
import { codecs } from '../../../src/core/codecs/catalog'
import { createCodec } from '../../../src/core/codecs/codec'
import { addDebugReporter } from '../../../src/core/diagnostics/bus'
import { resetQueryRuntime } from '../../../src/core/runtime/adapter-runtime'
import { queryParam } from '../../../src/core/schema/params/query-param'
import { structuralEq } from '../../../src/shared/utils/object'

const flush = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0))

function makeRouter(options: Pick<RouterOptions, 'parseQuery' | 'stringifyQuery' | 'scrollBehavior'> = {}) {
  return createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { render: () => null } }],
    ...options,
  })
}

const routerScroll = (): ReturnType<typeof vi.fn<RouterScrollBehavior>> => vi.fn<RouterScrollBehavior>(() => ({ top: 0 }))

async function setupScroll(scrollBehavior?: RouterScrollBehavior) {
  const router = makeRouter({ scrollBehavior })
  await router.push('/')
  const adapter = createVueRouterAdapter({ router })
  return { router, adapter }
}

function scrollFor(router: Router, to: RouteLocationNormalizedLoaded = router.currentRoute.value) {
  return router.options.scrollBehavior?.(to, START_LOCATION, null)
}

describe('createVueRouterAdapter', () => {
  describe('query', () => {
    it('reads the current route query', async () => {
      const router = makeRouter()
      await router.push({ path: '/', query: { q: 'phone' } })

      const adapter = createVueRouterAdapter({ router })

      expect(toValue(adapter.query)).toEqual({ q: 'phone' })
    })
  })

  describe('history', () => {
    it('replaces by default', async () => {
      const router = makeRouter()
      await router.push('/')
      const replaceSpy = vi.spyOn(router, 'replace')

      const adapter = createVueRouterAdapter({ router })
      await adapter.navigate({ q: 'sale' }, {})

      expect(replaceSpy).toHaveBeenCalled()
      expect(router.currentRoute.value.query).toEqual({ q: 'sale' })
    })

    it('pushes when history is push', async () => {
      const router = makeRouter()
      await router.push('/')
      const pushSpy = vi.spyOn(router, 'push')

      const adapter = createVueRouterAdapter({ router })
      await adapter.navigate({ q: 'x' }, { history: 'push' })

      expect(pushSpy).toHaveBeenCalled()
      expect(router.currentRoute.value.query).toEqual({ q: 'x' })
    })

    it('preserves the current hash', async () => {
      const router = makeRouter()
      await router.push({ path: '/', hash: '#section' })

      const adapter = createVueRouterAdapter({ router })
      await adapter.navigate({ q: 'sale' }, {})

      expect(router.currentRoute.value.hash).toBe('#section')
      expect(router.currentRoute.value.query).toEqual({ q: 'sale' })
    })
  })

  describe('scroll', () => {
    it('scrolls to the top-left for true', async () => {
      const behavior = routerScroll()
      const { router, adapter } = await setupScroll(behavior)

      await adapter.navigate({ q: 'a' }, { scroll: true })

      expect(scrollFor(router)).toEqual({ left: 0, top: 0 })
      expect(behavior).not.toHaveBeenCalled()
    })

    it('scrolls to the top-left for true without a router behavior', async () => {
      const { router, adapter } = await setupScroll()

      await adapter.navigate({ q: 'a' }, { scroll: true })

      expect(scrollFor(router)).toEqual({ left: 0, top: 0 })
    })

    it('scrolls to a ScrollToOptions object', async () => {
      const { router, adapter } = await setupScroll(routerScroll())
      const scroll: ScrollToOptions = { top: 400, behavior: 'smooth' }

      await adapter.navigate({ q: 'a' }, { scroll })

      expect(scrollFor(router)).toBe(scroll)
    })

    it.each([
      { name: 'false', options: { scroll: false } },
      { name: 'no value', options: {} },
    ])('does not scroll for $name even when the router scrolls', async ({ options }) => {
      const behavior = routerScroll()
      const { router, adapter } = await setupScroll(behavior)

      await adapter.navigate({ q: 'a' }, options)

      expect(scrollFor(router)).toBe(false)
      expect(behavior).not.toHaveBeenCalled()
    })

    it('delegates an application navigation after a write to the router behavior', async () => {
      const behavior = routerScroll()
      const { router, adapter } = await setupScroll(behavior)

      await adapter.navigate({ q: 'a' }, { scroll: false })
      await router.push({ query: { q: 'app' } })
      const to = router.currentRoute.value

      expect(scrollFor(router)).toEqual({ top: 0 })
      expect(behavior).toHaveBeenCalledExactlyOnceWith(to, START_LOCATION, null)
    })

    it('delegates an application navigation to no scroll without a router behavior', async () => {
      const { router, adapter } = await setupScroll()

      await adapter.navigate({ q: 'a' }, { scroll: true })
      await router.push({ query: { q: 'app' } })

      expect(scrollFor(router)).toBeUndefined()
    })

    it('carries no value from a write a guard aborts', async () => {
      const behavior = routerScroll()
      const { router, adapter } = await setupScroll(behavior)
      const removeGuard = router.beforeEach(() => false)

      await expect(adapter.navigate({ q: 'a' }, { scroll: true })).rejects.toThrow()
      removeGuard()
      await router.push({ query: { q: 'a' } })

      expect(scrollFor(router)).toEqual({ top: 0 })
    })

    it('carries no value into a navigation a guard redirects', async () => {
      const behavior = routerScroll()
      const { router, adapter } = await setupScroll(behavior)
      router.beforeEach(to => to.query.q === 'a' ? { query: { q: 'redirected' } } : undefined)

      await adapter.navigate({ q: 'a' }, { scroll: true })

      expect(router.currentRoute.value.query).toEqual({ q: 'redirected' })
      expect(scrollFor(router)).toEqual({ top: 0 })
    })

    it('delegates a superseded write to the router behavior', async () => {
      const behavior = routerScroll()
      const { router, adapter } = await setupScroll(behavior)

      await adapter.navigate({ q: 'a' }, { scroll: true })
      const superseded = router.currentRoute.value
      await router.push({ query: { q: 'b' } })

      expect(scrollFor(router, superseded)).toEqual({ top: 0 })
      expect(behavior).toHaveBeenCalledExactlyOnceWith(superseded, START_LOCATION, null)
    })

    it('shares one wrapper and one afterEach guard between adapters on a router', async () => {
      const router = makeRouter({ scrollBehavior: routerScroll() })
      await router.push('/')
      const afterEach = vi.spyOn(router, 'afterEach')
      const first = createVueRouterAdapter({ router })
      const second = createVueRouterAdapter({ router })

      await first.navigate({ q: 'a' }, { scroll: false })
      const wrapper = router.options.scrollBehavior
      expect(scrollFor(router)).toBe(false)

      await second.navigate({ q: 'b' }, { scroll: true })

      expect(router.options.scrollBehavior).toBe(wrapper)
      expect(scrollFor(router)).toEqual({ left: 0, top: 0 })
      expect(afterEach).toHaveBeenCalledOnce()
    })

    it('wraps a scroll behavior reassigned after a write on the next write', async () => {
      const { router, adapter } = await setupScroll(routerScroll())
      await adapter.navigate({ q: 'a' }, { scroll: false })
      const replacement = vi.fn<RouterScrollBehavior>(() => ({ top: 50 }))

      router.options.scrollBehavior = replacement
      await router.push({ query: { q: 'app' } })
      expect(scrollFor(router)).toEqual({ top: 50 })

      await adapter.navigate({ q: 'b' }, { scroll: false })
      expect(router.options.scrollBehavior).not.toBe(replacement)
      expect(scrollFor(router)).toBe(false)

      await router.push({ query: { q: 'app-again' } })
      expect(scrollFor(router)).toEqual({ top: 50 })
    })

    it('leaves the router behavior untouched without writes', async () => {
      const behavior = routerScroll()
      const router = makeRouter({ scrollBehavior: behavior })
      await router.push('/')

      createVueRouterAdapter({ router })

      expect(router.options.scrollBehavior).toBe(behavior)
    })
  })

  describe('failures', () => {
    it('rejects when the navigation fails', async () => {
      const router = makeRouter()
      await router.push('/')
      vi.spyOn(router, 'replace').mockRejectedValueOnce(new Error('navigation cancelled'))

      const adapter = createVueRouterAdapter({ router })

      await expect(adapter.navigate({ q: 'sale' }, {})).rejects.toThrow('navigation cancelled')
    })
  })

  describe('diagnostics', () => {
    it('emits adapter:navigate for a direct navigation', async () => {
      const router = makeRouter()
      const adapter = createVueRouterAdapter({ router })
      const codes: string[] = []
      const stop = addDebugReporter(event => codes.push(event.code))

      await adapter.navigate({ q: 'x' }, { history: 'push' })
      stop()

      expect(codes).toContain('adapter:navigate')
    })
  })

  describe('defaultOptions', () => {
    it('exposes the configured defaultOptions', () => {
      const router = makeRouter()

      const adapter = createVueRouterAdapter({ router, defaultOptions: { history: 'push' } })

      expect(adapter.defaultOptions).toEqual({ history: 'push' })
    })
  })
})

describe('vue router query runtime', () => {
  it('rolls back a write when a router guard aborts navigation', async () => {
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

  it('navigates coalesced false and true scroll writes with true', async () => {
    const { router, adapter } = await setupScroll(routerScroll())
    const app = createApp({})
    installQueryAdapter(app, adapter)
    const scope = effectScope()

    try {
      const q = scope.run(() => app.runWithContext(() => useQueryState('q', codecs.string)))!
      q.set('a', { scroll: false })
      q.set('b', { scroll: true })
      await vi.waitFor(() => expect(router.currentRoute.value.query).toEqual({ q: 'b' }))

      expect(scrollFor(router)).toEqual({ left: 0, top: 0 })
    }
    finally {
      resetQueryRuntime(adapter)
      scope.stop()
    }
  })

  it('confirms duplicate navigation while preserving the parsed query', async () => {
    const queries: Record<string, ParsedQuery> = { 'value=3': { value: 3 }, 'value=4': { value: 4 } }
    const router = makeRouter({
      parseQuery: search => queries[search] as LocationQuery,
      stringifyQuery: query => stringifyQuery(query),
    })
    await router.push('/?value=3')
    const initial = router.currentRoute.value.query
    const adapter = createVueRouterAdapter({ router })
    const app = createApp({})
    installQueryAdapter(app, adapter)
    const scope = effectScope()

    try {
      const value = scope.run(() => app.runWithContext(() => useQueryState('value', codecs.integer)))!
      value.set(3)
      await flush()

      expect(router.currentRoute.value.query).toBe(initial)
      await router.push('/?value=4')
      expect(value.value).toBe(4)
    }
    finally {
      resetQueryRuntime(adapter)
      scope.stop()
    }
  })

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
