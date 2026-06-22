import { defineBuildConfig } from 'unbuild'

export default defineBuildConfig({
  entries: ['src/index'],
  declaration: true,
  externals: ['vue', 'vuqs'],
  rollup: {
    emitCJS: false,
  },
})
