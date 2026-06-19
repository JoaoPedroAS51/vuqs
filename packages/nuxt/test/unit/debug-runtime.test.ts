import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  addConsole: vi.fn(),
  readStored: vi.fn(),
  getChannel: vi.fn(),
  useAdapter: vi.fn(),
}))

vi.mock('@vuqs/core/debug/console', () => ({
  addConsoleDebugReporter: mocks.addConsole,
  readStoredConsoleDebugConfig: mocks.readStored,
}))

vi.mock('@vuqs/core', () => ({
  getDebugChannel: mocks.getChannel,
  useQueryAdapter: mocks.useAdapter,
}))

const { default: clientPlugin } = await import('../../src/runtime/debug.client')
const { default: serverPlugin } = await import('../../src/runtime/debug.server')

interface Plugin {
  enforce?: string
  setup: (app: any) => void
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.addConsole.mockReturnValue(vi.fn())
  mocks.readStored.mockReturnValue({ status: 'absent' })
})

describe('nuxt debug runtime ownership', () => {
  it('owns the client reporter through app unmount', () => {
    const release = vi.fn()
    mocks.addConsole.mockReturnValue(release)
    const onUnmount = vi.fn()

    ;(clientPlugin as Plugin).setup({ vueApp: { onUnmount } })

    expect(mocks.addConsole).toHaveBeenCalledWith()
    const stop = onUnmount.mock.calls[0]?.[0] as () => void
    stop()
    stop()
    expect(release).toHaveBeenCalledOnce()
  })

  it('uses safe stored console preferences on the client', () => {
    const onUnmount = vi.fn()
    mocks.readStored.mockReturnValue({
      status: 'enabled',
      options: {
        preset: 'trace',
        payload: 'hidden',
        filter: { include: { scopes: ['gtq'] } },
      },
    })

    ;(clientPlugin as Plugin).setup({ vueApp: { onUnmount } })

    expect(mocks.addConsole).toHaveBeenCalledWith({
      preset: 'trace',
      payload: 'hidden',
      filter: { include: { scopes: ['gtq'] } },
    })
    expect(onUnmount).toHaveBeenCalledOnce()
  })

  it('stored configuration disables the client reporter', () => {
    mocks.readStored.mockReturnValue({ status: 'disabled' })

    ;(clientPlugin as Plugin).setup({ vueApp: { onUnmount: vi.fn() } })

    expect(mocks.addConsole).not.toHaveBeenCalled()
  })

  it('warns and fails closed for invalid stored client configuration', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    mocks.readStored.mockReturnValue({ status: 'invalid', message: 'invalid debug config' })

    ;(clientPlugin as Plugin).setup({ vueApp: { onUnmount: vi.fn() } })

    expect(warn).toHaveBeenCalledWith('invalid debug config')
    expect(mocks.addConsole).not.toHaveBeenCalled()
  })

  it('scopes a server reporter to the request adapter and releases every terminal path idempotently', () => {
    const adapter = {}
    const channel = {}
    const release = vi.fn()
    mocks.useAdapter.mockReturnValue(adapter)
    mocks.getChannel.mockReturnValue(channel)
    mocks.addConsole.mockReturnValue(release)
    const hooks = new Map<string, () => void>()

    expect((serverPlugin as Plugin).enforce).toBe('post')
    ;(serverPlugin as Plugin).setup({
      vueApp: { runWithContext: (run: () => unknown) => run() },
      hook: (name: string, callback: () => void) => hooks.set(name, callback),
    })

    expect(mocks.addConsole).toHaveBeenCalledWith({ channel })
    expect([...hooks.keys()]).toEqual(['app:rendered', 'app:error', 'app:redirected'])
    hooks.get('app:error')?.()
    hooks.get('app:rendered')?.()
    hooks.get('app:redirected')?.()
    expect(release).toHaveBeenCalledOnce()
  })

  it('never falls back to the global hub when a server request has no adapter', () => {
    mocks.useAdapter.mockReturnValue(undefined)
    vi.spyOn(console, 'warn').mockImplementation(() => {})

    ;(serverPlugin as Plugin).setup({
      vueApp: { runWithContext: (run: () => unknown) => run() },
      hook: vi.fn(),
    })

    expect(mocks.addConsole).not.toHaveBeenCalled()
  })
})
