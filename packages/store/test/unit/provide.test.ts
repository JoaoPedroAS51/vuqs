import type { QueryStore } from '../../src/create-query-store'
import { describe, expect, it } from 'vitest'
import { createSSRApp, defineComponent, h } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { codecs, defineQueryState } from 'vuqs'
import { createQueryStoreKey, provideQueryStore, useQueryStore } from '../../src/provide'

const schema = {
  currency: defineQueryState('currency', codecs.string),
}

describe('createQueryStoreKey', () => {
  it('creates a unique symbol', () => {
    expect(typeof createQueryStoreKey()).toBe('symbol')
    expect(createQueryStoreKey()).not.toBe(createQueryStoreKey())
  })
})

describe('provideQueryStore / useQueryStore', () => {
  it('provides a store to descendants', async () => {
    const key = createQueryStoreKey<typeof schema>()
    let injected: QueryStore<typeof schema> | undefined

    const Child = defineComponent({
      setup() {
        injected = useQueryStore(key)
        return () => h('div')
      },
    })

    const Parent = defineComponent({
      setup() {
        provideQueryStore(key, { schema, query: () => ({ currency: 'USD' }), navigate: () => {} })
        return () => h(Child)
      },
    })

    await renderToString(createSSRApp(Parent))

    expect(injected).toBeDefined()
    expect(injected!.selected.value).toEqual({ currency: 'USD' })
  })

  it('throws when used without a provider', async () => {
    const key = createQueryStoreKey<typeof schema>()

    const Orphan = defineComponent({
      setup() {
        useQueryStore(key)
        return () => h('div')
      },
    })

    await expect(renderToString(createSSRApp(Orphan))).rejects.toThrow(/provideQueryStore/)
  })
})
