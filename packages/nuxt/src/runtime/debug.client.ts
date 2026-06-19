import { addConsoleDebugReporter, readStoredConsoleDebugConfig } from '@vuqs/core/debug/console'
import { defineNuxtPlugin } from '#imports'

export default defineNuxtPlugin({
  name: 'vuqs:debug-client',
  setup(nuxtApp) {
    const stored = readStoredConsoleDebugConfig()
    if (stored.status === 'invalid') {
      console.warn(stored.message)
      return
    }
    if (stored.status === 'disabled') {
      return
    }

    const stop = once(stored.status === 'enabled'
      ? addConsoleDebugReporter(stored.options)
      : addConsoleDebugReporter())
    nuxtApp.vueApp.onUnmount(stop)
    const hot = (import.meta as ImportMeta & { hot?: { dispose: (callback: () => void) => void } }).hot
    if (hot) {
      hot.dispose(stop)
    }
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
