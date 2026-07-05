import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { defineBuildConfig } from 'unbuild'

// In source, the built-in modules augment `QueryModuleRegistry` at its declaration
// site (`declare module '../core/module'`) so it merges in-source and in this
// package's type tests. rollup-dts rewrites that specifier to the hashed shared
// chunk it bundles the interface into, and TypeScript cannot merge a `declare
// module "../shared/core.<hash>"` augmentation from a consumer. Retarget those
// augmentations to the public entry, which is the specifier a consumer's imports
// resolve through, so the registry entries merge downstream.
const CHUNK_AUGMENTATION = /declare module (["'])(?:\.\.?\/)+shared\/core\.[^"']+\1/g

// A format string that lives only in the debug catalog (`core/debug/messages.ts`).
// The catalog must reach the bundle only through the opt-in `@vuqs/core/debug` entry;
// finding this sentinel in any other bundle means a core module value-imported the
// catalog instead of type-only. The source catalog is checked to still contain it, so
// renaming the message fails the build rather than silently disarming the guard.
const CATALOG_SENTINEL = '[vuqs gtq] Scheduling flush in'

function collectMjs(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name)

    if (entry.isDirectory())
      return collectMjs(full)

    return entry.name.endsWith('.mjs') ? [full] : []
  })
}

export default defineBuildConfig({
  entries: ['src/index', 'src/debug', 'src/adapters/vue-router', 'src/adapters/testing', 'src/modules/index', 'src/shared/index', 'src/testing'],
  declaration: true,
  externals: ['vue', 'vue-router'],
  rollup: {
    emitCJS: false,
  },
  hooks: {
    'build:done': function (ctx) {
      let retargeted = 0

      for (const file of ['modules/index.d.ts', 'modules/index.d.mts']) {
        const path = join(ctx.options.outDir, file)
        let code: string

        try {
          code = readFileSync(path, 'utf8')
        }
        catch {
          continue
        }

        const next = code.replace(CHUNK_AUGMENTATION, 'declare module \'@vuqs/core\'')

        if (next !== code) {
          writeFileSync(path, next)
          retargeted++
        }
      }

      // The type tests resolve to `src`, so nothing guards the built output: if
      // rollup-dts stops emitting the hashed-chunk augmentation this silently
      // ships unmergeable types again. Fail loudly instead.
      if (retargeted === 0)
        throw new Error('[build] expected to retarget the QueryModuleRegistry augmentation to @vuqs/core, but found none — did rollup-dts change its chunk naming?')

      // The debug catalog must ship only through the opt-in `@vuqs/core/debug` entry.
      // A stray value import of `core/debug/messages` from any core module would pull
      // the format strings into another bundle; catch that here rather than by eye.
      const catalogSource = join(ctx.options.outDir, '..', 'src', 'core', 'debug', 'messages.ts')

      if (!readFileSync(catalogSource, 'utf8').includes(CATALOG_SENTINEL))
        throw new Error(`[build] the catalog-isolation sentinel ${JSON.stringify(CATALOG_SENTINEL)} is no longer in core/debug/messages.ts — update CATALOG_SENTINEL in build.config.ts`)

      const debugEntry = join(ctx.options.outDir, 'debug.mjs')

      for (const file of collectMjs(ctx.options.outDir)) {
        if (file === debugEntry)
          continue

        if (readFileSync(file, 'utf8').includes(CATALOG_SENTINEL))
          throw new Error(`[build] the debug message catalog leaked into ${file} — a core module value-imported core/debug/messages instead of type-only`)
      }
    },
  },
})
