import { beforeEach, describe, expect, it, vi } from 'vitest'

const kit = vi.hoisted(() => ({
  addImports: vi.fn(),
  addPlugin: vi.fn(),
  extendViteConfig: vi.fn((cb: (config: Record<string, any>) => void) => cb({})),
}))

vi.mock('@nuxt/kit', async importActual => ({
  ...await importActual<typeof import('@nuxt/kit')>(),
  addImports: kit.addImports,
  addPlugin: kit.addPlugin,
  extendViteConfig: kit.extendViteConfig,
}))

const { default: module } = await import('../../src/module')

interface NuxtStub {
  _version: string
  options: {
    dev: boolean
    rootDir: string
    runtimeConfig: { public: Record<string, unknown> }
  }
  hook: ReturnType<typeof vi.fn>
  callHook: ReturnType<typeof vi.fn>
}

function createNuxt(dev = true): NuxtStub {
  return {
    _version: '4.0.0',
    options: {
      dev,
      rootDir: process.cwd(),
      runtimeConfig: { public: {} },
    },
    hook: vi.fn(),
    callHook: vi.fn(() => Promise.resolve()),
  }
}

async function run(options: Record<string, unknown>, dev = true): Promise<NuxtStub> {
  const nuxt = createNuxt(dev)
  // The object returned by defineNuxtModule is the invokable module.
  await (module as unknown as (opts: unknown, nuxt: NuxtStub) => Promise<void>)(options, nuxt)
  return nuxt
}

function debugPlugins(): Array<{ src: string, mode?: string }> {
  return kit.addPlugin.mock.calls
    .map(([arg]) => typeof arg === 'string' ? { src: arg } : arg as { src: string, mode?: string })
    .filter(plugin => /runtime\/debug\.(?:client|server)$/.test(plugin.src))
}

function importedNames(): string[] {
  return kit.addImports.mock.calls.flatMap(([arg]) => (arg as { name: string }[]).map(i => i.name))
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('@vuqs/nuxt module', () => {
  it('registers composables and codecs by default', async () => {
    await run({})

    const names = importedNames()
    expect(names).toContain('useQueryState')
    expect(names).toContain('useQueryStates')
    expect(names).toContain('queryParam')
    expect(names).toContain('defineQueryModule')
    expect(names).toContain('createSerializer')
    expect(names).toContain('codecs')
    expect(names).toContain('createCodec')
  })

  it('registers the composable modules from vuqs/modules by default', async () => {
    await run({})

    const names = importedNames()
    expect(names).toContain('withRuntimeDefaults')
    expect(names).toContain('withContext')
    expect(names).toContain('withActiveParams')
    expect(names).toContain('withStorage')
  })

  it('omits the modules when that group is disabled', async () => {
    await run({ autoImports: { modules: false } })

    const names = importedNames()
    expect(names).toContain('useQueryState')
    expect(names).not.toContain('withRuntimeDefaults')
    expect(names).not.toContain('withContext')
    expect(names).not.toContain('withActiveParams')
    expect(names).not.toContain('withStorage')
  })

  it('omits codecs when that group is disabled', async () => {
    await run({ autoImports: { codecs: false } })

    const names = importedNames()
    expect(names).toContain('useQueryState')
    expect(names).not.toContain('codecs')
    expect(names).not.toContain('createCodec')
  })

  it('registers nothing when autoImports is false', async () => {
    await run({ autoImports: false })

    expect(kit.addImports).not.toHaveBeenCalled()
  })

  it('adds the adapter plugin and seeds runtimeConfig by default', async () => {
    const nuxt = await run({ adapter: { defaultOptions: { history: 'replace' } } })

    expect(kit.addPlugin).toHaveBeenCalledOnce()
    expect(nuxt.options.runtimeConfig.public.vuqs).toEqual({
      adapter: { defaultOptions: { history: 'replace' } },
    })
  })

  it('skips the adapter plugin when disabled', async () => {
    const nuxt = await run({ adapter: false })

    expect(kit.addPlugin).not.toHaveBeenCalled()
    expect(nuxt.options.runtimeConfig.public.vuqs).toBeUndefined()
  })

  it('registers no debug plugin by default', async () => {
    await run({})

    expect(debugPlugins()).toEqual([])
  })

  it('registers the dev-guarded debug plugin when debug is true in dev', async () => {
    await run({ debug: true }, true)

    expect(debugPlugins()).toEqual([
      expect.objectContaining({ src: expect.stringMatching(/runtime\/debug\.client$/), mode: 'client' }),
    ])
  })

  it('registers no debug plugin when debug is true outside dev', async () => {
    await run({ debug: true }, false)

    expect(debugPlugins()).toEqual([])
  })

  it('registers only the production client plugin for the shorthand force option', async () => {
    await run({ debug: 'force' }, false)

    expect(debugPlugins()).toEqual([
      expect.objectContaining({ src: expect.stringMatching(/runtime\/debug\.client$/), mode: 'client' }),
    ])
  })

  it('registers server diagnostics only when that target is explicit', async () => {
    await run({ debug: { server: true } }, true)

    expect(debugPlugins()).toEqual([
      expect.objectContaining({ src: expect.stringMatching(/runtime\/debug\.server$/), mode: 'server' }),
    ])
  })

  it('resolves production force independently per target', async () => {
    await run({ debug: { client: 'force', server: false } }, false)
    expect(debugPlugins()).toHaveLength(1)
    expect(debugPlugins()[0]).toMatchObject({ mode: 'client' })

    vi.clearAllMocks()
    await run({ debug: { server: 'force' } }, false)
    expect(debugPlugins()).toHaveLength(1)
    expect(debugPlugins()[0]).toMatchObject({ mode: 'server' })
  })

  it('does not add the debug config to runtimeConfig', async () => {
    const nuxt = await run({ debug: 'force' }, false)

    expect(nuxt.options.runtimeConfig.public.vuqs).not.toHaveProperty('debug')
  })
})
