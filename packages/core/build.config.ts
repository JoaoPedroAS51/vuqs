import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { defineBuildConfig } from 'unbuild'

// Consumers resolve the registry through the public entry, so augmentations
// must target that entry rather than a source path or an aliased shared chunk.
const REGISTRY_AUGMENTATION = /declare module (["'])(?:\.\.?\/)+(?:shared\/core\.[^"']+|core\/module-system\/contract)\1/g

// This label belongs to the opt-in console reporter. Finding it outside `debug.mjs`
// means a base module included it in another bundle.
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
  entries: ['src/index', 'src/debug', 'src/debug/console', 'src/debug-protocol', 'src/adapters/vue-router', 'src/adapters/testing', 'src/adapters/browser-history', 'src/modules/index', 'src/shared/index', 'src/testing'],
  declaration: true,
  externals: ['vue', 'vue-router'],
  rollup: {
    emitCJS: false,
  },
  hooks: {
    'build:done': function (ctx) {
      if (ctx.options.stub)
        return

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

        const next = code.replace(REGISTRY_AUGMENTATION, 'declare module \'@vuqs/core\'')

        if (next !== code) {
          writeFileSync(path, next)
          retargeted++
        }
      }

      if (retargeted !== 2)
        throw new Error('[build] expected to retarget QueryModuleRegistry in both modules declaration artifacts.')

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
