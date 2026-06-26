import { defineBuildConfig } from 'unbuild'

export default defineBuildConfig({
  entries: ['src/index', 'src/adapters/vue-router', 'src/adapters/testing', 'src/modules/index', 'src/shared/index', 'src/testing'],
  declaration: true,
  externals: ['vue', 'vue-router'],
  rollup: {
    emitCJS: false,
  },
})
