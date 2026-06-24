import type { QueryAdapterDefaultOptions } from 'vuqs'
import { addImports, addPlugin, createResolver, defineNuxtModule } from '@nuxt/kit'
import { defu } from 'defu'

/**
 * Fine-grained toggles for which vuqs APIs are registered as Nuxt auto-imports.
 */
export interface AutoImportsOptions {
  /**
   * The composables and schema builder: `useQueryState`, `useQueryStates`,
   * `useQueryAdapter`, `provideQueryAdapter`, `defineQueryState`,
   * `createSerializer`.
   *
   * @default true
   */
  composables?: boolean
  /**
   * The `codecs` namespace and `createCodec`. `codecs` is a single namespace
   * object (`codecs.string`, `codecs.integer`, and so on), so this adds one
   * global name rather than one per codec.
   *
   * @default true
   */
  codecs?: boolean
  /**
   * The composable modules from `vuqs/modules`. Each module adds one global
   * name, so the set grows as new modules ship.
   *
   * @default true
   */
  modules?: boolean
}

/**
 * Options for the registered `vue-router` adapter.
 */
export interface AdapterOptions {
  /**
   * Default navigation and write options carried by the adapter, for example
   * `{ history: 'replace' }`. A per-call or per-composable option overrides them.
   */
  defaultOptions?: QueryAdapterDefaultOptions
}

/**
 * Configuration for the vuqs Nuxt module, set under the `vuqs` key in
 * `nuxt.config`.
 */
export interface ModuleOptions {
  /**
   * Register vuqs APIs as auto-imports. `true` enables every group; pass an
   * object for fine control, or `false` to register none.
   *
   * @default true
   */
  autoImports?: boolean | AutoImportsOptions
  /**
   * Provide the `vue-router` query adapter app-wide so the composables work
   * without a manual provider. `false` disables it; pass an object to set the
   * adapter's default options.
   *
   * @default true
   */
  adapter?: boolean | AdapterOptions
}

declare module '@nuxt/schema' {
  interface PublicRuntimeConfig {
    vuqs?: {
      adapter?: AdapterOptions
    }
  }
}

const COMPOSABLE_IMPORTS = [
  'useQueryState',
  'useQueryStates',
  'useQueryAdapter',
  'provideQueryAdapter',
  'defineQueryState',
  'createSerializer',
] as const

const CODEC_IMPORTS = ['codecs', 'createCodec'] as const

const MODULE_IMPORTS = ['withEffective', 'withContext'] as const

function resolveAutoImports(option: ModuleOptions['autoImports']): Required<AutoImportsOptions> {
  if (option === false) {
    return { composables: false, codecs: false, modules: false }
  }

  if (option === true || option === undefined) {
    return { composables: true, codecs: true, modules: true }
  }

  return { composables: true, codecs: true, modules: true, ...option }
}

export default defineNuxtModule<ModuleOptions>({
  meta: {
    name: '@vuqs/nuxt',
    configKey: 'vuqs',
    compatibility: { nuxt: '>=3.0.0' },
  },
  defaults: {
    autoImports: true,
    adapter: true,
  },
  setup(options, nuxt) {
    const { resolve } = createResolver(import.meta.url)

    const autoImports = resolveAutoImports(options.autoImports)
    const imports: { name: string, from: string }[] = []

    if (autoImports.composables) {
      imports.push(...COMPOSABLE_IMPORTS.map(name => ({ name, from: 'vuqs' })))
    }

    if (autoImports.codecs) {
      imports.push(...CODEC_IMPORTS.map(name => ({ name, from: 'vuqs' })))
    }

    if (autoImports.modules) {
      imports.push(...MODULE_IMPORTS.map(name => ({ name, from: 'vuqs/modules' })))
    }

    if (imports.length > 0) {
      addImports(imports)
    }

    if (options.adapter !== false) {
      const adapter = options.adapter === true || options.adapter === undefined ? {} : options.adapter

      nuxt.options.runtimeConfig.public.vuqs = defu(nuxt.options.runtimeConfig.public.vuqs, {
        adapter: { defaultOptions: adapter.defaultOptions },
      })

      addPlugin(resolve('./runtime/plugin'))
    }
  },
})
