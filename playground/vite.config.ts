import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

const src = (path: string) => new URL(path, import.meta.url).pathname

// Resolve the workspace packages to their TypeScript source (antfu/unjs playground
// convention): editing the library reflects instantly via HMR, no rebuild needed.
// The `dist` stubs (`unbuild --stub`) are jiti-backed and run in Node only, so a
// browser playground aliases to `src` instead. The more specific subpath alias
// must come before the bare `vuqs` alias so it matches first.
export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: [
      { find: 'vuqs/adapters/vue-router', replacement: src('../packages/vuqs/src/adapters/vue-router.ts') },
      { find: 'vuqs', replacement: src('../packages/vuqs/src/index.ts') },
      { find: '@vuqs/store', replacement: src('../packages/store/src/index.ts') },
    ],
    dedupe: ['vue', 'vue-router'],
  },
  server: {
    port: 5173,
  },
})
