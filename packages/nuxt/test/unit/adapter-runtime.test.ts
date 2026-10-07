import type { NuxtApp } from 'nuxt/app'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  install: vi.fn(),
  createAdapter: vi.fn(),
  createMinimalAdapter: vi.fn(),
  useRouter: vi.fn(),
  useRuntimeConfig: vi.fn(),
}))

vi.mock('@vuqs/core', () => ({ installQueryAdapter: mocks.install }))
vi.mock('@vuqs/core/adapters/vue-router', () => ({ createVueRouterAdapter: mocks.createAdapter }))
vi.mock('../../src/runtime/adapters/nuxt-minimal', () => ({ createNuxtMinimalRouterAdapter: mocks.createMinimalAdapter }))
vi.mock('#imports', async importOriginal => ({
  ...await importOriginal<typeof import('../stubs/imports')>(),
  useRouter: mocks.useRouter,
  useRuntimeConfig: mocks.useRuntimeConfig,
}))

const { default: adapterPlugin } = await import('../../src/runtime/plugin')
const { default: minimalAdapterPlugin } = await import('../../src/runtime/plugin-minimal')

beforeEach(() => {
  vi.resetAllMocks()
})

describe.each([
  { name: 'vue-router', plugin: adapterPlugin, createAdapter: mocks.createAdapter },
  { name: 'minimal router', plugin: minimalAdapterPlugin, createAdapter: mocks.createMinimalAdapter },
])('nuxt adapter runtime: $name', ({ plugin, createAdapter }) => {
  it.each([
    { name: 'missing vuqs config', config: {} },
    { name: 'missing adapter config', config: { vuqs: {} } },
    { name: 'empty adapter options', config: { vuqs: { adapter: {} } } },
  ])('installs the router adapter with $name', ({ config }) => {
    const router = {}
    const adapter = {}
    const vueApp = {}
    mocks.useRouter.mockReturnValue(router)
    mocks.useRuntimeConfig.mockReturnValue({ public: config })
    createAdapter.mockReturnValue(adapter)

    expect(plugin.name).toBe('vuqs:adapter')
    plugin.setup!({ vueApp } as NuxtApp)

    expect(createAdapter).toHaveBeenCalledExactlyOnceWith({ router, defaultOptions: undefined })
    expect(mocks.install).toHaveBeenCalledExactlyOnceWith(vueApp, adapter)
  })

  it('forwards configured defaults to the request router adapter', () => {
    const router = {}
    const adapter = {}
    const defaultOptions = { history: 'push', scroll: false, throttleMs: 50, clearOnDefault: false }
    const vueApp = {}
    mocks.useRouter.mockReturnValue(router)
    mocks.useRuntimeConfig.mockReturnValue({ public: { vuqs: { adapter: { defaultOptions } } } })
    createAdapter.mockReturnValue(adapter)

    plugin.setup!({ vueApp } as NuxtApp)

    expect(createAdapter).toHaveBeenCalledExactlyOnceWith({ router, defaultOptions })
    expect(mocks.install).toHaveBeenCalledExactlyOnceWith(vueApp, adapter)
  })
})
