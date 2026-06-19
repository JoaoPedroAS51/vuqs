import { getDebugChannel, useQueryAdapter } from '@vuqs/core'
import { addConsoleDebugReporter } from '@vuqs/core/debug/console'
import { defineNuxtPlugin } from '#imports'

export default defineNuxtPlugin({
  name: 'vuqs:debug-server',
  // Run after both the built-in adapter plugin and ordinary user plugins, so
  // `adapter: false` with a custom app-level adapter remains supported.
  enforce: 'post',
  setup(nuxtApp) {
    const adapter = nuxtApp.vueApp.runWithContext(() => useQueryAdapter())
    if (adapter === undefined) {
      // Never fall back to the process-global hub: concurrent SSR requests must not arm
      // or receive one another's raw diagnostics.
      console.warn('[vuqs] server debug was requested, but no request-scoped query adapter is installed')
      return
    }

    const stop = once(addConsoleDebugReporter({ channel: getDebugChannel(adapter) }))
    nuxtApp.hook('app:rendered', stop)
    nuxtApp.hook('app:error', stop)
    nuxtApp.hook('app:redirected', stop)
  },
})

function once(dispose: () => void): () => void {
  let active = true
  return () => {
    if (!active)
      return
    active = false
    dispose()
  }
}
