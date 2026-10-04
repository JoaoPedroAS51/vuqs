import { vi } from 'vitest'
import { codecs } from '../../../../src/core/codecs/catalog'
import { queryParam } from '../../../../src/core/schema/params/query-param'

interface Deferred<T> {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (cause: unknown) => void
}

export function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  let reject!: (cause: unknown) => void
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve
    reject = onReject
  })

  return { promise, resolve, reject }
}

export const schema = {
  q: queryParam('q', codecs.string),
  page: queryParam('page', codecs.integer),
}

export async function flushMicrotasks(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
}

export function stubBrowserEnvironment(): void {
  vi.stubGlobal('window', {})
  vi.spyOn(Date, 'now').mockReturnValue(100)
}
