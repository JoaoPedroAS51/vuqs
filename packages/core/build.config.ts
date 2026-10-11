import { defineBuildConfig } from 'unbuild'

export default defineBuildConfig({
  entries: ['src/index', 'src/debug', 'src/debug/console', 'src/debug-protocol', 'src/adapters/vue-router', 'src/adapters/testing', 'src/adapters/browser-history', 'src/modules/index', 'src/shared/index', 'src/testing'],
  declaration: true,
  externals: ['vue', 'vue-router'],
  rollup: {
    emitCJS: false,
  },
  hooks: {
    // Fail the build on declaration warnings
    'rollup:dts:options': function (ctx, options) {
      const onwarn = options.onwarn

      options.onwarn = (warning, defaultHandler) => {
        if (warning.plugin === 'dts') {
          ctx.warnings.add(warning.message)
          return
        }

        if (onwarn)
          onwarn(warning, defaultHandler)
        else
          defaultHandler(warning)
      }
    },
  },
})
