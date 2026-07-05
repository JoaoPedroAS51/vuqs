import { enableDebug } from '@vuqs/core/debug'
import { defineNuxtPlugin } from '#imports'

// Registered for `debug: 'force'`: logging stays on in production for diagnosing a
// deployed app, so this runs unconditionally with no `import.meta.dev` guard.
export default defineNuxtPlugin(() => {
  enableDebug()
})
