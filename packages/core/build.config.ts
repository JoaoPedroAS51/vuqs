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

// A label string that lives only in the structured console reporter
// (`src/debug/console-reporter.ts`), which is imported solely by the opt-in
// `@vuqs/core/debug` entry. Finding it outside `debug.mjs` means a base module pulled
// the reporter's human-readable labels into another bundle.
const CONSOLE_SENTINEL = 'Observed an unknown debug event.'
const CATALOG_SENTINEL = 'Combined another write with the pending URL update.'

function collectMjs(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name)

    if (entry.isDirectory())
      return collectMjs(full)

    return entry.name.endsWith('.mjs') ? [full] : []
  })
}

export default defineBuildConfig({
  entries: ['src/index', 'src/debug', 'src/debug/console', 'src/debug-protocol', 'src/adapters/vue-router', 'src/adapters/testing', 'src/modules/index', 'src/shared/index', 'src/testing'],
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
        throw new Error('[build] expected to retarget the QueryModuleRegistry augmentation to @vuqs/core, but found none. Did rollup-dts change its chunk naming?')

      // The console reporter's human-readable labels must ship only through the opt-in
      // `@vuqs/core/debug` entry. A stray import from any base module would pull them
      // into another bundle; catch that here rather than by eye.
      const consoleSource = join(ctx.options.outDir, '..', 'src', 'debug', 'console-reporter.ts')

      if (!readFileSync(consoleSource, 'utf8').includes(CONSOLE_SENTINEL))
        throw new Error(`[build] the console-isolation sentinel ${JSON.stringify(CONSOLE_SENTINEL)} is no longer in debug/console-reporter.ts. Update CONSOLE_SENTINEL in build.config.ts`)

      const catalogSource = join(ctx.options.outDir, '..', 'src', 'debug', 'event-catalog.ts')

      if (!readFileSync(catalogSource, 'utf8').includes(CATALOG_SENTINEL))
        throw new Error(`[build] the catalog-isolation sentinel ${JSON.stringify(CATALOG_SENTINEL)} is no longer in debug/event-catalog.ts. Update CATALOG_SENTINEL in build.config.ts`)

      const debugEntries = new Set([
        join(ctx.options.outDir, 'debug.mjs'),
        join(ctx.options.outDir, 'debug', 'console.mjs'),
      ])

      for (const file of collectMjs(ctx.options.outDir)) {
        if (debugEntries.has(file))
          continue

        const code = readFileSync(file, 'utf8')
        if (code.includes(CONSOLE_SENTINEL))
          throw new Error(`[build] the console reporter labels leaked into ${file}. A base module imported debug/console-reporter outside the opt-in entry`)
        if (code.includes(CATALOG_SENTINEL))
          throw new Error(`[build] the debug event catalog leaked into ${file}. A base module imported debug/event-catalog outside the opt-in entry`)
      }

      // The strict debug protocol entry must be type-only, so it never ships runtime
      // bytes. If it ever emits a value export, fail rather than silently grow a bundle.
      try {
        const protocol = readFileSync(join(ctx.options.outDir, 'debug-protocol.mjs'), 'utf8')
          .replace(/\/\*[\s\S]*?\*\//g, '')
          .replace(/\/\/.*$/gm, '')
          .replace(/export\s*\{\s*\}\s*;?/g, '')
          .trim()

        if (protocol !== '')
          throw new Error(`[build] @vuqs/core/debug-protocol must be type-only but emitted runtime code:\n${protocol}`)
      }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
          throw error
      }
    },
  },
})
