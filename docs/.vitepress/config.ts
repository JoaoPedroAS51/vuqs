import { defineConfig } from 'vitepress'

const repo = 'https://github.com/JoaoPedroAS51/vuqs'

export default defineConfig({
  title: 'vuqs',
  description: 'Type-safe query state for Vue 3 — composable codecs, URL sync, and a context-aware store.',
  lang: 'en-US',

  // GitHub Pages serves the project site under /vuqs/. Set to '/' for a root
  // domain or a custom CNAME.
  base: '/vuqs/',

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
      { text: 'Store', link: '/store/introduction', activeMatch: '/store/' },
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
            { text: 'Defining fields', link: '/guide/defining-fields' },
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
          ],
        },
      ],

      '/store/': [
        {
          text: '@vuqs/store',
          items: [
            { text: 'Introduction', link: '/store/introduction' },
            { text: 'The three states', link: '/store/three-states' },
            { text: 'Context switching', link: '/store/context' },
            { text: 'Provide / inject', link: '/store/provide-inject' },
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
            { text: '@vuqs/store', link: '/api/store' },
            { text: '@vuqs/nuxt', link: '/api/nuxt' },
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
