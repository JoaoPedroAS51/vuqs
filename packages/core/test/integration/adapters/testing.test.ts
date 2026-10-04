import { describe, expect, it, vi } from 'vitest'
import { createApp } from 'vue'
import { createTestingAdapter, withVuqsTestingAdapter } from '../../../src/adapters/testing'
import { installQueryAdapter } from '../../../src/core/bindings/adapter-provider'
import { useQueryState } from '../../../src/core/bindings/use-query-state'
import { useQueryStates } from '../../../src/core/bindings/use-query-states'
import { codecs } from '../../../src/core/codecs/catalog'
import { queryParam } from '../../../src/core/schema/params/query-param'

const flush = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0))

describe('createTestingAdapter', () => {
  describe('composable integration', () => {
    it('reads the initial query into the composable', () => {
      const adapter = createTestingAdapter({ searchParams: '?q=hello&count=5' })
      const app = createApp({})
      installQueryAdapter(app, adapter)
      const run = app.runWithContext.bind(app)

      const q = run(() => useQueryState('q', codecs.string))
      const count = run(() => useQueryState('count', codecs.integer.withDefault(0)))

      expect(q.value).toBe('hello')
      expect(count.value).toBe(5)
    })

    it('coalesces writes from multiple params into one navigate call', async () => {
      const onUrlUpdate = vi.fn()
      const adapter = createTestingAdapter({ onUrlUpdate })
      const app = createApp({})
      installQueryAdapter(app, adapter)
      const run = app.runWithContext.bind(app)

      const schema = {
        q: queryParam('q', codecs.string),
        page: queryParam('page', codecs.integer),
      }
      const { values } = run(() => useQueryStates(schema))

      values.q = 'hello'
      values.page = 2
      await flush()

      expect(onUrlUpdate).toHaveBeenCalledOnce()
    })
  })
})

describe('withVuqsTestingAdapter', () => {
  it('returns a function usable as a Vue plugin', () => {
    const plugin = withVuqsTestingAdapter()

    expect(typeof plugin).toBe('function')
  })

  it('installs a testing adapter on the app when called', () => {
    const plugin = withVuqsTestingAdapter({ searchParams: '?count=42' })
    const app = createApp({})
    plugin(app)
    const run = app.runWithContext.bind(app)

    const count = run(() => useQueryState('count', codecs.integer.withDefault(0)))

    expect(count.value).toBe(42)
  })

  it('fires onUrlUpdate when the composable writes', async () => {
    const onUrlUpdate = vi.fn()
    const plugin = withVuqsTestingAdapter({ onUrlUpdate })
    const app = createApp({})
    plugin(app)
    const run = app.runWithContext.bind(app)

    const count = run(() => useQueryState('count', codecs.integer.withDefault(0)))
    count.value = 1
    await flush()

    expect(onUrlUpdate).toHaveBeenCalledOnce()
  })

  it('each plugin call creates an independent adapter', async () => {
    const onUrlUpdate1 = vi.fn()
    const onUrlUpdate2 = vi.fn()

    const plugin1 = withVuqsTestingAdapter({ onUrlUpdate: onUrlUpdate1 })
    const plugin2 = withVuqsTestingAdapter({ onUrlUpdate: onUrlUpdate2 })

    const app1 = createApp({})
    plugin1(app1)
    const run1 = app1.runWithContext.bind(app1)

    const app2 = createApp({})
    plugin2(app2)
    const run2 = app2.runWithContext.bind(app2)

    const count1 = run1(() => useQueryState('count', codecs.integer.withDefault(0)))
    const count2 = run2(() => useQueryState('count', codecs.integer.withDefault(0)))

    count1.value = 1
    await flush()

    expect(onUrlUpdate1).toHaveBeenCalledOnce()
    expect(onUrlUpdate2).not.toHaveBeenCalled()

    count2.value = 2
    await flush()

    expect(onUrlUpdate2).toHaveBeenCalledOnce()
  })
})
