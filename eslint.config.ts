import type { Linter } from 'eslint'
import antfu from '@antfu/eslint-config'
import { createNodeResolver, importX } from 'eslint-plugin-import-x'

const src = 'packages/core/src'
const core = `${src}/core`

const publicEntrypoints = {
  group: ['@vuqs/core', '@vuqs/core/**'],
  message: 'Import the internal owner directly instead of the package entrypoint.',
}

const architectureRules: Linter.Config[] = [
  {
    name: 'vuqs/import-boundaries',
    files: [`${src}/**/*.ts`],
    plugins: {
      'import-x': importX,
    },
    settings: {
      'import-x/extensions': ['.ts', '.mts', '.js', '.mjs'],
      'import-x/resolver-next': [
        createNodeResolver({
          extensions: ['.ts', '.mts', '.js', '.mjs', '.json'],
        }),
      ],
    },
    rules: {
      'import-x/no-self-import': 'error',
      'import-x/no-cycle': ['error', {
        ignoreExternal: true,
      }],
      'no-restricted-imports': ['error', {
        patterns: [publicEntrypoints],
      }],
      'import-x/no-restricted-paths': ['error', {
        basePath: import.meta.dirname,
        zones: [
          {
            target: `${src}/shared`,
            from: [
              core,
              `${src}/modules`,
              `${src}/adapters`,
              `${src}/debug`,
            ],
            message: 'Shared helpers must not depend on library subsystems.',
          },
          {
            target: [`${core}/query`, `${core}/codecs`],
            from: [
              `${core}/schema`,
              `${core}/runtime`,
              `${core}/bindings`,
              `${core}/module-system`,
              `${src}/modules`,
              `${src}/adapters`,
              `${src}/debug`,
            ],
            message: 'Query primitives and codecs must not depend on higher-level subsystems.',
          },
          {
            target: `${core}/schema`,
            from: [
              `${core}/runtime`,
              `${core}/bindings`,
              `${core}/module-system`,
              `${src}/modules`,
              `${src}/adapters`,
              `${src}/debug`,
            ],
            message: 'Schemas must remain independent of bindings and runtime execution.',
          },
          {
            target: [`${core}/runtime`, `${core}/diagnostics`],
            from: [
              `${core}/bindings`,
              `${src}/modules`,
              `${src}/adapters`,
              `${src}/debug`,
            ],
            message: 'Runtime and diagnostics must not depend on consumers or reporters.',
          },
          {
            target: [
              core,
              `${src}/modules`,
              `${src}/adapters`,
              `${src}/debug`,
              `${src}/shared`,
            ],
            from: [
              `${src}/index.ts`,
              `${src}/modules/index.ts`,
              `${src}/shared/index.ts`,
              `${src}/debug.ts`,
              `${src}/debug-protocol.ts`,
              `${src}/debug/console.ts`,
              `${src}/testing.ts`,
            ],
            message: 'Internal files must import their owner directly, not a public entrypoint.',
          },
        ],
      }],
    },
  },
  {
    name: 'vuqs/runtime-module-contracts',
    files: [`${core}/runtime/**/*.ts`],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          publicEntrypoints,
          {
            group: ['**/module-system/**'],
            allowTypeImports: true,
            message: 'Runtime may import module contracts, but not their implementation.',
          },
        ],
      }],
    },
  },
  {
    name: 'vuqs/runtime-consumers',
    files: [
      `${core}/diagnostics/**/*.ts`,
      `${src}/modules/**/*.ts`,
    ],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          publicEntrypoints,
          {
            group: ['**/runtime/**'],
            allowTypeImports: true,
            message: 'Import runtime types only; use the supplied core facets for operations.',
          },
        ],
      }],
    },
  },
]

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
}, ...architectureRules)
