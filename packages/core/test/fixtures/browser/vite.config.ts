import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

export default defineConfig({
  root: import.meta.dirname,
  envDir: false,
  plugins: [vue()],
  optimizeDeps: { exclude: ['@vuqs/core'] },
  server: {
    host: '127.0.0.1',
    port: 4173,
    strictPort: true,
  },
})
