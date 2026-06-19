export function defineNuxtPlugin<T>(plugin: T): T {
  return plugin
}

export function useRouter(): never {
  throw new Error('useRouter is not available in this unit-test stub')
}

export function useRuntimeConfig(): never {
  throw new Error('useRuntimeConfig is not available in this unit-test stub')
}
