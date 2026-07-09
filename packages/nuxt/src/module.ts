import type { QueryAdapterDefaultOptions } from '@vuqs/core'
import { addImports, addPlugin, createResolver, defineNuxtModule, extendViteConfig } from '@nuxt/kit'
import { defu } from 'defu'

/**
 * Fine-grained toggles for which vuqs APIs are registered as Nuxt auto-imports.
 */
export interface AutoImportsOptions {
  /**
   * The composables and schema builder: `useQueryState`, `useQueryStates`,
   * `useQueryAdapter`, `provideQueryAdapter`, `queryParam`,
   * `defineQueryModule`, `createSerializer`.
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
   * The composable modules from `@vuqs/core/modules`. Each module adds one global
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
  /**
   * Enable vuqs console debug logging by pulling in `@vuqs/core/debug` and calling
   * `enableDebug()` through a plugin. Logs the internals of runtime defaults,
   * context, and the optimistic overlay lifecycle, alongside warnings.
   *
   * @remarks
   * `true` registers the plugin only in development, so neither the plugin nor its
   * `@vuqs/core/debug` import reaches the production bundle. Pass `'force'` to keep it
   * in production for diagnosing a deployed app.
   *
   * Debug logging is noisy and adds bundle weight: leave this off (or on `true`) for
   * production. Set `'force'` deliberately, and turn it back off once done.
   *
   * @default false
   */
  debug?: boolean | 'force'
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
  'queryParam',
  'defineQueryModule',
  'createSerializer',
] as const

const CODEC_IMPORTS = ['codecs', 'createCodec'] as const

const MODULE_IMPORTS = ['withRuntimeDefaults', 'withContext', 'withActiveParams'] as const

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
    debug: false,
  },
  setup(options, nuxt) {
    const { resolve } = createResolver(import.meta.url)

    const autoImports = resolveAutoImports(options.autoImports)
    const imports: { name: string, from: string }[] = []

    if (autoImports.composables) {
      imports.push(...COMPOSABLE_IMPORTS.map(name => ({ name, from: '@vuqs/core' })))
    }

    if (autoImports.codecs) {
      imports.push(...CODEC_IMPORTS.map(name => ({ name, from: '@vuqs/core' })))
    }

    if (autoImports.modules) {
      imports.push(...MODULE_IMPORTS.map(name => ({ name, from: '@vuqs/core/modules' })))
    }

    if (imports.length > 0) {
      addImports(imports)
    }

    extendViteConfig((config) => {
      config.optimizeDeps ||= {}
      config.optimizeDeps.include ||= []
      config.optimizeDeps.include.push('@vuqs/core', '@vuqs/core/modules')
    })

    if (options.adapter !== false) {
      const adapter = options.adapter === true || options.adapter === undefined ? {} : options.adapter

      nuxt.options.runtimeConfig.public.vuqs = defu(nuxt.options.runtimeConfig.public.vuqs, {
        adapter: { defaultOptions: adapter.defaultOptions },
      })

      addPlugin(resolve('./runtime/plugin'))
    }

    // Decide at build time so `@vuqs/core/debug` only enters the graph when asked.
    // `true` registers the dev-guarded plugin (stripped from the production build);
    // `'force'` registers the unguarded variant that also runs in production.
    if (options.debug && (nuxt.options.dev || options.debug === 'force')) {
      addPlugin(resolve(options.debug === 'force' ? './runtime/debug.force' : './runtime/debug'))
    }
  },
})
