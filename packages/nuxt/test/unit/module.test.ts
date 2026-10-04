import type { NuxtConfig, NuxtHooks } from '@nuxt/schema'
import type { ModuleOptions } from '../../src/module'
import { fileURLToPath } from 'node:url'
import { loadNuxt } from '@nuxt/kit'
import { describe, expect, it } from 'vitest'

type NuxtImport = Parameters<NuxtHooks['imports:extend']>[0][number]

const composables = ['useQueryState', 'useQueryStates', 'useQueryAdapter', 'provideQueryAdapter', 'queryParam', 'defineQueryModule', 'createSerializer']
const codecs = ['codecs', 'createCodec']
const modules = ['withRuntimeDefaults', 'withContext', 'withActiveParams', 'withStorage']

const expectedImports = [
  ...[...composables, ...codecs].map(name => ({ name, from: '@vuqs/core' })),
  ...modules.map(name => ({ name, from: '@vuqs/core/modules' })),
]

const rootDir = fileURLToPath(new URL('../fixtures/basic', import.meta.url))

interface Registered {
  imports: Array<Pick<NuxtImport, 'name' | 'from'>>
  runtimePlugins: Array<{ name: string, mode?: string }>
  runtimeConfig: unknown
}

async function registerWith(options: ModuleOptions, dev = true, runtimeConfig?: NuxtConfig['runtimeConfig']): Promise<Registered> {
  const nuxt = await loadNuxt({ cwd: rootDir, dev, overrides: { vuqs: options, runtimeConfig } })
  try {
    const imports: NuxtImport[] = []
    await nuxt.callHook('imports:extend', imports)

    const runtimePlugins = nuxt.options.plugins
      .map(plugin => typeof plugin === 'string' ? { src: plugin } : plugin)
      .filter(plugin => plugin.src.includes('/packages/nuxt/src/runtime/'))
      .map(plugin => ({ name: plugin.src.split('/runtime/')[1]!.replace(/\.ts$/, ''), mode: plugin.mode }))

    return {
      imports: imports
        .filter(entry => entry.from.startsWith('@vuqs/'))
        .map(({ name, from }) => ({ name, from })),
      runtimePlugins,
      runtimeConfig: nuxt.options.runtimeConfig.public.vuqs,
    }
  }
  finally {
    await nuxt.close()
  }
}

describe('@vuqs/nuxt module', () => {
  it('registers every API from its public entry point by default', async () => {
    const { imports } = await registerWith({})

    expect(imports).toEqual(expectedImports)
  })

  it.each([
    { name: 'explicit true', autoImports: true },
    { name: 'empty group options', autoImports: {} },
  ])('enables every import group for $name', async ({ autoImports }) => {
    expect((await registerWith({ autoImports })).imports).toEqual(expectedImports)
  })

  it.each([
    { group: 'composables', omitted: composables },
    { group: 'codecs', omitted: codecs },
    { group: 'modules', omitted: modules },
  ] as const)('disables only the $group import group', async ({ group, omitted }) => {
    const { imports } = await registerWith({ autoImports: { [group]: false } })

    expect(imports).toEqual(expectedImports.filter(entry => !omitted.includes(entry.name)))
  })

  it.each([
    { name: 'false', autoImports: false },
    { name: 'all groups disabled', autoImports: { composables: false, codecs: false, modules: false } },
  ])('registers no vuqs imports with $name', async ({ autoImports }) => {
    expect((await registerWith({ autoImports })).imports).toEqual([])
  })

  it('installs the adapter with no default options when configuration is omitted', async () => {
    const { runtimePlugins, runtimeConfig } = await registerWith({})

    expect(runtimePlugins).toEqual([{ name: 'plugin', mode: 'all' }])
    expect(runtimeConfig).toEqual({ adapter: {} })
  })

  it('forwards module adapter defaults into runtimeConfig', async () => {
    const { runtimePlugins, runtimeConfig } = await registerWith({ adapter: { defaultOptions: { history: 'replace' } } })

    expect(runtimePlugins).toContainEqual({ name: 'plugin', mode: 'all' })
    expect(runtimeConfig).toEqual({ adapter: { defaultOptions: { history: 'replace' } } })
  })

  it('preserves runtime config overrides while filling missing adapter defaults', async () => {
    const { runtimeConfig } = await registerWith({
      adapter: { defaultOptions: { history: 'push', scroll: true, throttleMs: 50 } },
    }, true, {
      public: { vuqs: { adapter: { defaultOptions: { history: 'replace', scroll: false } } } },
    })

    expect(runtimeConfig).toEqual({
      adapter: { defaultOptions: { history: 'replace', scroll: false, throttleMs: 50 } },
    })
  })

  it('skips the adapter plugin when disabled', async () => {
    const { runtimePlugins, runtimeConfig } = await registerWith({ adapter: false })

    expect(runtimePlugins.map(plugin => plugin.name)).not.toContain('plugin')
    expect(runtimeConfig).toBeUndefined()
  })

  describe('debug plugins', () => {
    const debugPlugins = (registered: Registered): Registered['runtimePlugins'] =>
      registered.runtimePlugins.filter(plugin => plugin.name.startsWith('debug.'))

    it('registers none by default', async () => {
      expect(debugPlugins(await registerWith({}))).toEqual([])
    })

    it('registers the client plugin when debug is true in dev', async () => {
      expect(debugPlugins(await registerWith({ debug: true }, true))).toEqual([{ name: 'debug.client', mode: 'client' }])
    })

    it('registers none when debug is true outside dev', async () => {
      expect(debugPlugins(await registerWith({ debug: true }, false))).toEqual([])
    })

    it('registers only the production client plugin for the shorthand force option', async () => {
      expect(debugPlugins(await registerWith({ debug: 'force' }, false))).toEqual([{ name: 'debug.client', mode: 'client' }])
    })

    it('registers the server plugin only when that target is explicit', async () => {
      expect(debugPlugins(await registerWith({ debug: { server: true } }, true))).toEqual([{ name: 'debug.server', mode: 'server' }])
    })

    it.each([
      [{ client: 'force', server: false }, [{ name: 'debug.client', mode: 'client' }]],
      [{ server: 'force' }, [{ name: 'debug.server', mode: 'server' }]],
    ] satisfies Array<[ModuleOptions['debug'], Registered['runtimePlugins']]>)('resolves production force per target for %j', async (debug, expected) => {
      expect(debugPlugins(await registerWith({ debug }, false))).toEqual(expected)
    })

    it.each([
      { name: 'explicit false', debug: false, dev: true, expected: [] },
      { name: 'empty targets', debug: {}, dev: true, expected: [] },
      { name: 'disabled targets', debug: { client: false, server: false }, dev: true, expected: [] },
      { name: 'development-only targets in production', debug: { client: true, server: true }, dev: false, expected: [] },
      { name: 'both development targets', debug: { client: true, server: true }, dev: true, expected: [{ name: 'debug.client', mode: 'client' }, { name: 'debug.server', mode: 'server' }] },
      { name: 'both forced production targets', debug: { client: 'force', server: 'force' }, dev: false, expected: [{ name: 'debug.client', mode: 'client' }, { name: 'debug.server', mode: 'server' }] },
    ] satisfies Array<{ name: string, debug: ModuleOptions['debug'], dev: boolean, expected: Registered['runtimePlugins'] }>)('resolves $name', async ({ debug, dev, expected }) => {
      const plugins = debugPlugins(await registerWith({ debug }, dev))

      expect(plugins).toHaveLength(expected.length)
      expect(plugins).toEqual(expect.arrayContaining(expected))
    })

    it('keeps an explicit server reporter when the built-in adapter is disabled', async () => {
      const { runtimePlugins, runtimeConfig } = await registerWith({ adapter: false, debug: { server: true } })

      expect(runtimePlugins).toEqual([{ name: 'debug.server', mode: 'server' }])
      expect(runtimeConfig).toBeUndefined()
    })

    it('does not add the debug config to runtimeConfig', async () => {
      const { runtimeConfig } = await registerWith({ debug: 'force' }, false)

      expect(runtimeConfig).not.toHaveProperty('debug')
    })
  })
})
