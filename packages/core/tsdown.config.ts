import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: {
    'index': 'src/index.ts',
    'debug': 'src/debug.ts',
    'debug/console': 'src/debug/console.ts',
    'debug-protocol': 'src/debug-protocol.ts',
    'adapters/vue-router': 'src/adapters/vue-router.ts',
    'adapters/testing': 'src/adapters/testing.ts',
    'adapters/browser-history': 'src/adapters/browser-history.ts',
    'modules/index': 'src/modules/index.ts',
    'shared/index': 'src/shared/index.ts',
    'testing': 'src/testing.ts',
  },
  format: ['esm'],
  platform: 'neutral',
  sourcemap: true,
  dts: {
    generator: 'tsgo',
    sourcemap: true,
  },
  fixedExtension: true,
  inputOptions: {
    onLog(level, log, defaultHandler) {
      if (level === 'warn' && log.plugin?.startsWith('rolldown-plugin-dts:')) {
        defaultHandler('error', log)
        return
      }

      defaultHandler(level, log)
    },
  },
  suppressWarnings: [
    /^TypeScript 7\.0 does not yet have a stable API and is experimental\. Some options will be unavailable\.$/,
  ],
})
