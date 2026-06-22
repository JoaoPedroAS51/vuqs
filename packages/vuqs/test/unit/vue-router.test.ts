import type { UseQueryStatesReturn } from '../../src/core/use-query-states'
import { describe, expect, it, vi } from 'vitest'
import { createSSRApp, defineComponent, h, toValue } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { renderToString } from 'vue/server-renderer'
import { createVueRouterAdapter, provideVueRouterAdapter } from '../../src/adapters/vue-router'
import { codecs } from '../../src/core/codec'
import { defineQueryState } from '../../src/core/define-query-state'
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
    await router.push({ path: '/', query: { q: 'lease' } })

    const adapter = createVueRouterAdapter({ router })

    expect(toValue(adapter.query)).toEqual({ q: 'lease' })
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

  it('carries defaultOptions', () => {
    const router = makeRouter()

    const adapter = createVueRouterAdapter({ router, defaultOptions: { history: 'push' } })

    expect(adapter.defaultOptions).toEqual({ history: 'push' })
  })
})

describe('provideVueRouterAdapter', () => {
  it('drives useQueryStates end to end', async () => {
    const router = makeRouter()
    await router.push({ path: '/', query: { q: 'lease' } })
    await router.isReady()

    const schema = { q: defineQueryState('q', codecs.string) }
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

    expect(states!.q.value).toBe('lease')
  })

  it('writes through the engine to the router', async () => {
    const router = makeRouter()
    await router.push('/')
    await router.isReady()

    const schema = { q: defineQueryState('q', codecs.string) }
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

    states!.q.value = 'sale'
    await flush()

    expect(router.currentRoute.value.query).toEqual({ q: 'sale' })
  })
})
