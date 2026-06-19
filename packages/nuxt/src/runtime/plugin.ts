import { installQueryAdapter } from '@vuqs/core'
import { createVueRouterAdapter } from '@vuqs/core/adapters/vue-router'
import { defineNuxtPlugin, useRouter, useRuntimeConfig } from '#imports'

export default defineNuxtPlugin({
  name: 'vuqs:adapter',
  setup(nuxtApp) {
    const { defaultOptions } = useRuntimeConfig().public.vuqs?.adapter ?? {}
    const adapter = createVueRouterAdapter({ router: useRouter(), defaultOptions })

    installQueryAdapter(nuxtApp.vueApp, adapter)
  },
})
