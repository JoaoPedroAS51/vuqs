import { readFileSync } from 'node:fs'
import { defineConfig } from 'vitepress'

const repo = 'https://github.com/JoaoPedroAS51/vuqs'
const { version } = JSON.parse(
  readFileSync(new URL('../../packages/core/package.json', import.meta.url), 'utf8'),
) as { version: string }

export default defineConfig({
  title: 'vuqs',
  description: 'Type-safe query state for Vue.',
  lang: 'en-US',

  base: '/',

  lastUpdated: true,
  cleanUrls: true,

  head: [
    ['meta', { name: 'theme-color', content: '#42b883' }],
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:title', content: 'vuqs' }],
    ['meta', { property: 'og:description', content: 'Type-safe query state for Vue.' }],
  ],

  themeConfig: {
    nav: [
      { text: 'Guide', link: '/guide/getting-started/installation', activeMatch: '^/guide/' },
      { text: 'Modules', link: '/modules/', activeMatch: '^/modules/' },
      { text: 'Nuxt', link: '/nuxt/getting-started', activeMatch: '^/nuxt/' },
      { text: 'API', link: '/api/', activeMatch: '^/api/' },
      {
        text: `v${version}`,
        items: [
          { text: 'Changelog', link: `${repo}/releases` },
        ],
      },
    ],

    sidebar: {
      '/guide/': [
        {
          text: 'Getting started',
          items: [
            { text: 'Installation', link: '/guide/getting-started/installation' },
            { text: 'Adapters', link: '/guide/getting-started/adapters' },
            { text: 'Quick start', link: '/guide/getting-started/quick-start' },
          ],
        },
        {
          text: 'Query state',
          items: [
            { text: 'Concepts', link: '/guide/query-state/concepts' },
            { text: 'useQueryState', link: '/guide/query-state/use-query-state' },
            { text: 'useQueryStates', link: '/guide/query-state/use-query-states' },
            { text: 'Defining params', link: '/guide/query-state/defining-params' },
            { text: 'Navigation & options', link: '/guide/query-state/navigation-options' },
            { text: 'Building URLs', link: '/guide/query-state/building-urls' },
          ],
        },
        {
          text: 'Codecs',
          items: [
            { text: 'Built-in codecs', link: '/guide/codecs/built-in' },
            { text: 'Custom codecs', link: '/guide/codecs/custom' },
          ],
        },
        {
          text: 'Debugging',
          items: [
            { text: 'Enabling debugging', link: '/guide/debugging/enabling' },
            { text: 'Console output', link: '/guide/debugging/console-output' },
            { text: 'Write lifecycle', link: '/guide/debugging/write-lifecycle' },
            { text: 'Payloads and redaction', link: '/guide/debugging/payloads' },
            { text: 'Programmatic diagnostics', link: '/guide/debugging/programmatic-diagnostics' },
          ],
        },
        {
          text: 'Testing',
          items: [
            { text: 'Testing with vuqs', link: '/guide/testing' },
          ],
        },
      ],

      '/modules/': [
        {
          text: 'Modules',
          items: [
            { text: 'Overview', link: '/modules/' },
            { text: 'Composition', link: '/modules/composition' },
            { text: 'Signals', link: '/modules/signals' },
            { text: 'Writing a module', link: '/modules/authoring' },
          ],
        },
        {
          text: 'Available modules',
          items: [
            { text: 'Runtime defaults', link: '/modules/runtime-defaults' },
            { text: 'Context changes', link: '/modules/context' },
            { text: 'Active params', link: '/modules/active-params' },
            { text: 'Storage', link: '/modules/storage' },
          ],
        },
      ],

      '/nuxt/': [
        {
          text: 'Nuxt',
          items: [
            { text: 'Getting started', link: '/nuxt/getting-started' },
            { text: 'Configuration', link: '/nuxt/configuration' },
            { text: 'Routing and adapters', link: '/nuxt/adapter' },
          ],
        },
      ],

      '/api/': [
        {
          text: 'Composables',
          collapsed: false,
          items: [
            { text: 'useQueryState', link: '/api/composables/use-query-state' },
            { text: 'useQueryStates', link: '/api/composables/use-query-states' },
            { text: 'toQueryRefs', link: '/api/composables/to-query-refs' },
            { text: 'toQueryRef', link: '/api/composables/to-query-ref' },
          ],
        },
        {
          text: 'Params and schemas',
          collapsed: true,
          items: [
            { text: 'queryParam', link: '/api/params/query-param' },
            { text: 'queryParam.object', link: '/api/params/query-param-object' },
            { text: 'defineQuerySchema', link: '/api/params/define-query-schema' },
            { text: 'normalizeQueryStateSchema', link: '/api/params/normalize-query-state-schema' },
          ],
        },
        {
          text: 'Codecs',
          collapsed: true,
          items: [
            { text: 'codecs', link: '/api/codecs' },
            { text: 'createCodec', link: '/api/codecs/create-codec' },
            { text: 'codecs.arrayOf', link: '/api/codecs/array-of' },
            { text: 'codecs.literal', link: '/api/codecs/literal' },
            { text: 'codecs.numberLiteral', link: '/api/codecs/number-literal' },
            { text: 'codecs.enum', link: '/api/codecs/enum' },
            { text: 'codecs.json', link: '/api/codecs/json' },
          ],
        },
        {
          text: 'Adapters',
          collapsed: true,
          items: [
            { text: 'QueryAdapter', link: '/api/adapters/query-adapter' },
            { text: 'createVueRouterAdapter', link: '/api/adapters/create-vue-router-adapter' },
            { text: 'provideVueRouterAdapter', link: '/api/adapters/provide-vue-router-adapter' },
            { text: 'createBrowserHistoryAdapter', link: '/api/adapters/create-browser-history-adapter' },
            { text: 'provideBrowserHistoryAdapter', link: '/api/adapters/provide-browser-history-adapter' },
            { text: 'installQueryAdapter', link: '/api/adapters/install-query-adapter' },
            { text: 'provideQueryAdapter', link: '/api/adapters/provide-query-adapter' },
            { text: 'useQueryAdapter', link: '/api/adapters/use-query-adapter' },
          ],
        },
        {
          text: 'Modules',
          collapsed: false,
          items: [
            { text: 'withRuntimeDefaults', link: '/api/modules/with-runtime-defaults' },
            { text: 'withContext', link: '/api/modules/with-context' },
            { text: 'withActiveParams', link: '/api/modules/with-active-params' },
            { text: 'withStorage', link: '/api/modules/with-storage' },
            { text: 'createWebStorage', link: '/api/modules/create-web-storage' },
          ],
        },
        {
          text: 'Module authoring',
          collapsed: true,
          items: [
            { text: 'defineQueryModule', link: '/api/authoring/define-query-module' },
            { text: 'QueryCore', link: '/api/authoring/query-core' },
            { text: 'QueryModuleRegistry', link: '/api/authoring/query-module-registry' },
            { text: 'QueryHookBus', link: '/api/authoring/query-hook-bus' },
            { text: 'QueryPipelineBus', link: '/api/authoring/query-pipeline-bus' },
          ],
        },
        {
          text: 'Serialization',
          collapsed: true,
          items: [
            { text: 'createSerializer', link: '/api/serialization/create-serializer' },
            { text: 'parseQueryStates', link: '/api/serialization/parse-query-states' },
            { text: 'serializeQueryStates', link: '/api/serialization/serialize-query-states' },
            { text: 'buildQuery', link: '/api/serialization/build-query' },
            { text: 'dropDefaults', link: '/api/serialization/drop-defaults' },
            { text: 'getManagedKeys', link: '/api/serialization/get-managed-keys' },
            { text: 'omitManagedKeys', link: '/api/serialization/omit-managed-keys' },
            { text: 'assertUniquePaths', link: '/api/serialization/assert-unique-paths' },
          ],
        },
        {
          text: 'Utilities',
          collapsed: true,
          items: [
            { text: 'getPath', link: '/api/utils/get-path' },
            { text: 'setPath', link: '/api/utils/set-path' },
            { text: 'deletePath', link: '/api/utils/delete-path' },
            { text: 'getQueryString', link: '/api/utils/get-query-string' },
            { text: 'getQueryStringArray', link: '/api/utils/get-query-string-array' },
            { text: 'structuralEq', link: '/api/utils/structural-eq' },
            { text: 'pickBy', link: '/api/utils/pick-by' },
            { text: 'omitBy', link: '/api/utils/omit-by' },
            { text: 'definedOnly', link: '/api/utils/defined-only' },
            { text: 'toReadonlyState', link: '/api/utils/to-readonly-state' },
          ],
        },
        {
          text: 'Testing',
          collapsed: true,
          items: [
            { text: 'createTestingAdapter', link: '/api/testing/create-testing-adapter' },
            { text: 'withVuqsTestingAdapter', link: '/api/testing/with-vuqs-testing-adapter' },
            { text: 'isCodecBijective', link: '/api/testing/is-codec-bijective' },
            { text: 'testSerializeThenParse', link: '/api/testing/test-serialize-then-parse' },
            { text: 'testParseThenSerialize', link: '/api/testing/test-parse-then-serialize' },
          ],
        },
        {
          text: 'Debugging',
          collapsed: true,
          items: [
            { text: 'enableDebug', link: '/api/debugging/enable-debug' },
            { text: 'disableDebug', link: '/api/debugging/disable-debug' },
            { text: 'addDebugReporter', link: '/api/debugging/add-debug-reporter' },
            { text: 'retainDebugHistory', link: '/api/debugging/retain-debug-history' },
            { text: 'getDebugChannel', link: '/api/debugging/get-debug-channel' },
            { text: 'getDebugSnapshot', link: '/api/debugging/get-debug-snapshot' },
            { text: 'isDebugArmed', link: '/api/debugging/is-debug-armed' },
            { text: 'createDebugLogger', link: '/api/debugging/create-debug-logger' },
            { text: 'createConsoleReporter', link: '/api/debugging/create-console-reporter' },
            { text: 'addConsoleDebugReporter', link: '/api/debugging/add-console-debug-reporter' },
            { text: 'createPerformanceReporter', link: '/api/debugging/create-performance-reporter' },
            { text: 'readStoredConsoleDebugConfig', link: '/api/debugging/read-stored-console-debug-config' },
          ],
        },
        {
          text: 'Advanced',
          collapsed: true,
          items: [
            { text: 'createQueryStateEngine', link: '/api/advanced/create-query-state-engine' },
          ],
        },
        {
          text: 'Types and events',
          items: [
            { text: 'Shared query types', link: '/api/types' },
            { text: 'Debug events', link: '/api/debug-events' },
          ],
        },
      ],
    },

    socialLinks: [
      { icon: 'github', link: repo },
    ],

    editLink: {
      pattern: `${repo}/edit/main/docs/:path`,
      text: 'Edit this page on GitHub',
    },

    search: {
      provider: 'local',
    },

    footer: {
      message: 'Released under the MIT License. Inspired by <a href="https://nuqs.dev">nuqs</a>.',
      copyright: 'Copyright © 2026-present',
    },
  },
})
