import { readFileSync, writeFileSync } from 'node:fs'
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

export default defineBuildConfig({
  entries: ['src/index', 'src/adapters/vue-router', 'src/adapters/testing', 'src/modules/index', 'src/shared/index', 'src/testing'],
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
    },
  },
})
