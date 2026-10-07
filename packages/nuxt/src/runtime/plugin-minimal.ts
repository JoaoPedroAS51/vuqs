import { installQueryAdapter } from '@vuqs/core'
import { defineNuxtPlugin, useRouter, useRuntimeConfig } from '#imports'
import { createNuxtMinimalRouterAdapter } from './adapters/nuxt-minimal'

export default defineNuxtPlugin({
  name: 'vuqs:adapter',
  setup(nuxtApp) {
    const { defaultOptions } = useRuntimeConfig().public.vuqs?.adapter ?? {}
    const adapter = createNuxtMinimalRouterAdapter({ router: useRouter(), defaultOptions })

    installQueryAdapter(nuxtApp.vueApp, adapter)
  },
})
