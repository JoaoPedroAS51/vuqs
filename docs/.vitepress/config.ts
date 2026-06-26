import { defineConfig } from 'vitepress'

const repo = 'https://github.com/JoaoPedroAS51/vuqs'

export default defineConfig({
  title: 'vuqs',
  description: 'Type-safe query state for Vue 3 — composable codecs, URL sync, and opt-in modules.',
  lang: 'en-US',

  base: '/',

  lastUpdated: true,
  cleanUrls: true,

  head: [
    ['meta', { name: 'theme-color', content: '#42b883' }],
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:title', content: 'vuqs' }],
    ['meta', { property: 'og:description', content: 'Type-safe query state for Vue 3.' }],
  ],

  themeConfig: {
    nav: [
      { text: 'Guide', link: '/guide/introduction', activeMatch: '/guide/' },
      { text: 'Modules', link: '/modules/introduction', activeMatch: '/modules/' },
      { text: 'Nuxt', link: '/nuxt/introduction', activeMatch: '/nuxt/' },
      { text: 'API', link: '/api/', activeMatch: '/api/' },
      {
        text: 'v0',
        items: [
          { text: 'Changelog', link: `${repo}/releases` },
          { text: 'Contributing', link: `${repo}/blob/main/CONTRIBUTING.md` },
        ],
      },
    ],

    sidebar: {
      '/guide/': [
        {
          text: 'Introduction',
          items: [
            { text: 'What is vuqs?', link: '/guide/introduction' },
            { text: 'Getting started', link: '/guide/getting-started' },
            { text: 'Core concepts', link: '/guide/concepts' },
          ],
        },
        {
          text: 'Core',
          items: [
            { text: 'Codecs', link: '/guide/codecs' },
            { text: 'useQueryState', link: '/guide/use-query-state' },
            { text: 'useQueryStates', link: '/guide/use-query-states' },
            { text: 'Defining params', link: '/guide/defining-params' },
            { text: 'Adapters', link: '/guide/adapters' },
            { text: 'Navigation options', link: '/guide/navigation-options' },
          ],
        },
        {
          text: 'Advanced',
          items: [
            { text: 'Custom codecs', link: '/guide/custom-codecs' },
            { text: 'Nested & composite keys', link: '/guide/nested-keys' },
            { text: 'Building URLs (serializer)', link: '/guide/serializer' },
            { text: 'null vs undefined', link: '/guide/null-vs-undefined' },
            { text: 'Testing', link: '/guide/testing' },
          ],
        },
      ],

      '/modules/': [
        {
          text: 'Modules',
          items: [
            { text: 'Overview', link: '/modules/introduction' },
            { text: 'Writing a module', link: '/modules/authoring' },
          ],
        },
        {
          text: 'Available modules',
          items: [
            { text: 'withRuntimeDefaults', link: '/modules/runtime-defaults' },
            { text: 'withContext', link: '/modules/context' },
          ],
        },
      ],

      '/nuxt/': [
        {
          text: '@vuqs/nuxt',
          items: [
            { text: 'Introduction', link: '/nuxt/introduction' },
          ],
        },
      ],

      '/api/': [
        {
          text: 'API reference',
          items: [
            { text: 'Overview', link: '/api/' },
            { text: 'codecs', link: '/api/codecs' },
            { text: 'Composables', link: '/api/composables' },
            { text: 'Adapters', link: '/api/adapters' },
            { text: 'Serializer & pure functions', link: '/api/serializer' },
            { text: 'Testing', link: '/api/testing' },
            { text: 'Types', link: '/api/types' },
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
      message: 'Released under the MIT License.',
      copyright: 'Copyright © 2026-present',
    },
  },
})
