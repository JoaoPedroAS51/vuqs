import { installQueryAdapter } from 'vuqs'
import { createVueRouterAdapter } from 'vuqs/adapters/vue-router'
import { defineNuxtPlugin, useRouter, useRuntimeConfig } from '#imports'

export default defineNuxtPlugin((nuxtApp) => {
  const { defaultOptions } = useRuntimeConfig().public.vuqs?.adapter ?? {}
  const adapter = createVueRouterAdapter({ router: useRouter(), defaultOptions })

  installQueryAdapter(nuxtApp.vueApp, adapter)
})
