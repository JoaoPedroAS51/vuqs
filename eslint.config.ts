import antfu from '@antfu/eslint-config'

export default antfu({
  markdown: {
    overrides: {
      'perfectionist/sort-imports': 'off',
      'perfectionist/sort-named-exports': 'off',
      'perfectionist/sort-named-imports': 'off',
      'style/member-delimiter-style': 'off',
      'style/no-multi-spaces': 'off',
      'style/operator-linebreak': 'off',
      'vue/singleline-html-element-content-newline': 'off',
    },
  },
  type: 'lib',
  pnpm: true,
  stylistic: {
    indent: 2,
    quotes: 'single',
  },
  typescript: true,
  vue: true,
}, {
  files: ['docs/**/*.md'],
  rules: {
    'markdown/no-missing-link-fragments': 'off',
  },
}, {
  // Code fences in Markdown are illustrative (partial snippets, type sketches,
  // `…` placeholders), so lint the prose but not the embedded code.
  ignores: ['**/*.md/**'],
})
