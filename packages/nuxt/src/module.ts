import type { QueryAdapterDefaultOptions } from 'vuqs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { addImports, addPlugin, createResolver, defineNuxtModule, useLogger } from '@nuxt/kit'
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
   * The `@vuqs/store` APIs (`createQueryStore`, `provideQueryStore`,
   * `useQueryStore`, `createQueryStoreKey`), registered only when the package is
   * installed.
   *
   * @default true
   */
  store?: boolean
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

const STORE_IMPORTS = [
  'createQueryStore',
  'provideQueryStore',
  'useQueryStore',
  'createQueryStoreKey',
] as const

function resolveAutoImports(option: ModuleOptions['autoImports']): Required<AutoImportsOptions> {
  if (option === false) {
    return { composables: false, codecs: false, store: false }
  }

  if (option === true || option === undefined) {
    return { composables: true, codecs: true, store: true }
  }

  return { composables: true, codecs: true, store: true, ...option }
}

function isInstalled(id: string, fromDir: string): boolean {
  try {
    createRequire(join(fromDir, 'package.json')).resolve(id)
    return true
  }
  catch (error) {
    // An ESM-only package (no `require` condition in its `exports`) resolves to
    // `ERR_PACKAGE_PATH_NOT_EXPORTED` rather than the entry path — it is still
    // installed. Only a missing module means it is absent.
    return (error as { code?: string }).code === 'ERR_PACKAGE_PATH_NOT_EXPORTED'
  }
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
    const logger = useLogger('vuqs')
    const { resolve } = createResolver(import.meta.url)

    const autoImports = resolveAutoImports(options.autoImports)
    const imports: { name: string, from: string }[] = []

    if (autoImports.composables) {
      imports.push(...COMPOSABLE_IMPORTS.map(name => ({ name, from: 'vuqs' })))
    }

    if (autoImports.codecs) {
      imports.push(...CODEC_IMPORTS.map(name => ({ name, from: 'vuqs' })))
    }

    if (autoImports.store) {
      if (isInstalled('@vuqs/store', nuxt.options.rootDir)) {
        imports.push(...STORE_IMPORTS.map(name => ({ name, from: '@vuqs/store' })))
      }
      else if (typeof options.autoImports === 'object' && options.autoImports.store === true) {
        logger.warn('`autoImports.store` is enabled but `@vuqs/store` is not installed; skipping its auto-imports.')
      }
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
