import { beforeEach, describe, expect, it, vi } from 'vitest'

const kit = vi.hoisted(() => ({
  addImports: vi.fn(),
  addPlugin: vi.fn(),
}))

vi.mock('@nuxt/kit', async importActual => ({
  ...await importActual<typeof import('@nuxt/kit')>(),
  addImports: kit.addImports,
  addPlugin: kit.addPlugin,
}))

const { default: module } = await import('../../src/module')

interface NuxtStub {
  _version: string
  options: {
    rootDir: string
    runtimeConfig: { public: Record<string, unknown> }
  }
  hook: ReturnType<typeof vi.fn>
  callHook: ReturnType<typeof vi.fn>
}

function createNuxt(): NuxtStub {
  return {
    _version: '4.0.0',
    options: {
      rootDir: process.cwd(),
      runtimeConfig: { public: {} },
    },
    hook: vi.fn(),
    callHook: vi.fn(() => Promise.resolve()),
  }
}

async function run(options: Record<string, unknown>): Promise<NuxtStub> {
  const nuxt = createNuxt()
  // The object returned by defineNuxtModule is the invokable module.
  await (module as unknown as (opts: unknown, nuxt: NuxtStub) => Promise<void>)(options, nuxt)
  return nuxt
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
    expect(names).toContain('defineQueryParam')
    expect(names).toContain('createSerializer')
    expect(names).toContain('codecs')
    expect(names).toContain('createCodec')
  })

  it('registers the composable modules from vuqs/modules by default', async () => {
    await run({})

    const names = importedNames()
    expect(names).toContain('withEffective')
    expect(names).toContain('withContext')
  })

  it('omits the modules when that group is disabled', async () => {
    await run({ autoImports: { modules: false } })

    const names = importedNames()
    expect(names).toContain('useQueryState')
    expect(names).not.toContain('withEffective')
    expect(names).not.toContain('withContext')
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
})
