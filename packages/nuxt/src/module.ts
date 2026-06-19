import type { QueryAdapterDefaultOptions } from '@vuqs/core'
import { addImports, addPlugin, createResolver, defineNuxtModule, extendViteConfig } from '@nuxt/kit'
import { defu } from 'defu'

/**
 * Toggles for the vuqs API groups registered as Nuxt auto-imports.
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

export type DebugTargetOption = boolean | 'force'

/** Explicit build targets for console diagnostics. Omitted targets stay disabled. */
export interface DebugOptions {
  /** Browser console; `true` is development-only, `'force'` includes production. */
  client?: DebugTargetOption
  /** Request-scoped server console; opt-in separately because payloads may be sensitive. */
  server?: DebugTargetOption
}

/**
 * Configuration for the vuqs Nuxt module, set under the `vuqs` key in
 * `nuxt.config`.
 */
export interface ModuleOptions {
  /**
   * Register vuqs APIs as auto-imports. `true` enables every group; pass an
   * object to configure individual groups, or `false` to register none.
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
   * Enable console diagnostics through a target-specific plugin. The default
   * summary reports writes, commits, module decisions, and warnings; programmatic
   * consumers can opt into the complete trace separately.
   *
   * @remarks
   * `true` enables the browser console in development. `'force'` includes it in
   * production. Configure `server` separately for request-scoped server logging.
   *
   * Console diagnostics add bundle weight. Use `'force'` only when production
   * logging is required.
   *
   * @default false
   */
  debug?: DebugTargetOption | DebugOptions
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

const MODULE_IMPORTS = ['withRuntimeDefaults', 'withContext', 'withActiveParams', 'withStorage'] as const

function resolveAutoImports(option: ModuleOptions['autoImports']): Required<AutoImportsOptions> {
  if (option === false) {
    return { composables: false, codecs: false, modules: false }
  }

  if (option === true || option === undefined) {
    return { composables: true, codecs: true, modules: true }
  }

  return { composables: true, codecs: true, modules: true, ...option }
}

function resolveDebugTargets(option: ModuleOptions['debug']): Required<DebugOptions> {
  if (option === true || option === 'force') {
    return { client: option, server: false }
  }
  if (!option) {
    return { client: false, server: false }
  }
  return { client: option.client ?? false, server: option.server ?? false }
}

function targetEnabled(option: DebugTargetOption, dev: boolean): boolean {
  return option === 'force' || (option === true && dev)
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

    // Resolve entirely at build time so console prose never enters an unselected target.
    const debug = resolveDebugTargets(options.debug)
    if (targetEnabled(debug.client, nuxt.options.dev)) {
      addPlugin({ src: resolve('./runtime/debug.client'), mode: 'client' })
    }
    if (targetEnabled(debug.server, nuxt.options.dev)) {
      addPlugin({ src: resolve('./runtime/debug.server'), mode: 'server' })
    }
  },
})
