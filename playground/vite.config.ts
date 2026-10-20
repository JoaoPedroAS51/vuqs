import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

const src = (path: string) => new URL(path, import.meta.url).pathname

// Source aliases enable browser HMR.
// Match specific subpaths before the bare package alias.
export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: [
      { find: '@vuqs/core/adapters/vue-router', replacement: src('../packages/core/src/adapters/vue-router.ts') },
      { find: '@vuqs/core/modules', replacement: src('../packages/core/src/modules/index.ts') },
      { find: '@vuqs/core', replacement: src('../packages/core/src/index.ts') },
    ],
    dedupe: ['vue', 'vue-router'],
  },
  server: {
    port: 5173,
  },
})
