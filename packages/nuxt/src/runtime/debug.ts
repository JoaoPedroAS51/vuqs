import { defineNuxtPlugin } from '#imports'

// Registered for `debug: true`, which the module only does in development. The
// `import.meta.dev` guard is belt-and-braces: it lets the dynamic import and
// `enableDebug()` tree-shake out of any production build. `'force'` uses the
// unguarded `debug.force` variant instead.
export default defineNuxtPlugin(async () => {
  if (import.meta.dev) {
    const { enableDebug } = await import('@vuqs/core/debug')
    enableDebug()
  }
})
