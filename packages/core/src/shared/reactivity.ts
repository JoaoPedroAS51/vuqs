import type { ComputedRef } from 'vue'
import { reactive, readonly } from 'vue'

/**
 * Exposes a computed record as a readonly reactive object, so consumers read
 * `state.page` instead of `state.value.page`. Keys mirror the underlying
 * computed live. Reimplements VueUse's `toReactive` (a Proxy over the ref) since
 * the lib has no VueUse dependency.
 *
 * @typeParam T - The shape of the computed record.
 * @param source - The computed record to expose.
 * @returns A readonly reactive object reflecting `source.value`.
 */
export function toReadonlyState<T extends object>(source: ComputedRef<T>): Readonly<T> {
  const proxy = new Proxy({} as T, {
    get: (_, key) => Reflect.get(source.value, key),
    has: (_, key) => Reflect.has(source.value, key),
    ownKeys: () => Reflect.ownKeys(source.value),
    getOwnPropertyDescriptor: () => ({ enumerable: true, configurable: true }),
  })

  return readonly(reactive(proxy)) as Readonly<T>
}
