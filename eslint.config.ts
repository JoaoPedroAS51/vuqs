import antfu from '@antfu/eslint-config'

export default antfu({
  type: 'lib',
  pnpm: true,
  stylistic: {
    indent: 2,
    quotes: 'single',
  },
  typescript: true,
})
