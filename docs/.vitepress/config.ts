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
      { text: 'Guide', link: '/guide/getting-started/installation', activeMatch: '/guide/' },
      { text: 'Modules', link: '/modules/', activeMatch: '/modules/' },
      { text: 'Nuxt', link: '/nuxt/getting-started', activeMatch: '/nuxt/' },
      { text: 'API', link: '/api/', activeMatch: '/api/' },
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
          text: 'Essentials',
          items: [
            { text: 'Concepts', link: '/guide/essentials/concepts' },
            { text: 'useQueryState', link: '/guide/essentials/use-query-state' },
            { text: 'useQueryStates', link: '/guide/essentials/use-query-states' },
            { text: 'Navigation & options', link: '/guide/essentials/navigation-options' },
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
          text: 'Going further',
          items: [
            { text: 'Defining params', link: '/guide/going-further/defining-params' },
            { text: 'null vs undefined', link: '/guide/going-further/null-vs-undefined' },
            { text: 'Building URLs', link: '/guide/going-further/serializer' },
            { text: 'Testing', link: '/guide/going-further/testing' },
            { text: 'Debugging', link: '/guide/going-further/debugging' },
            { text: 'About', link: '/guide/going-further/about' },
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
            { text: 'withRuntimeDefaults', link: '/modules/runtime-defaults' },
            { text: 'withContext', link: '/modules/context' },
            { text: 'withActiveParams', link: '/modules/active-params' },
            { text: 'withStorage', link: '/modules/storage' },
          ],
        },
      ],

      '/nuxt/': [
        {
          text: 'Nuxt',
          items: [
            { text: 'Getting started', link: '/nuxt/getting-started' },
            { text: 'Auto-imports', link: '/nuxt/auto-imports' },
            { text: 'Adapter', link: '/nuxt/adapter' },
            { text: 'Configuration', link: '/nuxt/configuration' },
          ],
        },
      ],

      '/api/': [
        {
          text: 'API reference',
          items: [
            { text: 'Overview', link: '/api/' },
            { text: 'Codecs', link: '/api/codecs' },
            { text: 'Composables', link: '/api/composables' },
            { text: 'Adapters', link: '/api/adapters' },
            { text: 'Serializer & pure functions', link: '/api/serializer' },
            { text: 'Testing', link: '/api/testing' },
            { text: 'Debug events', link: '/api/debug-events' },
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
