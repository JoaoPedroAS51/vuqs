import type { UseQueryStatesReturn } from '../../src/core/use-query-states'
import { describe, expect, it, vi } from 'vitest'
import { createApp, createSSRApp, defineComponent, h, toValue } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { renderToString } from 'vue/server-renderer'
import { createVueRouterAdapter, provideVueRouterAdapter } from '../../src/adapters/vue-router'
import { installQueryAdapter } from '../../src/core/adapter'
import { codecs } from '../../src/core/codec'
import { addDebugReporter } from '../../src/core/debug/bus'
import { queryParam } from '../../src/core/query-param'
import { useQueryState } from '../../src/core/use-query-state'
import { useQueryStates } from '../../src/core/use-query-states'

const flush = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0))

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { render: () => null } }],
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

  it('swallows a navigation error instead of leaking an unhandled rejection', async () => {
    const router = makeRouter()
    await router.push('/')
    vi.spyOn(router, 'replace').mockRejectedValueOnce(new Error('navigation cancelled'))

    const adapter = createVueRouterAdapter({ router })

    await expect(adapter.navigate({ q: 'sale' }, {})).resolves.toBeUndefined()
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
