import type { QueryAdapter } from './adapter'

const managedAdapters = new WeakSet<QueryAdapter>()

/** Runs the synchronous adapter invocation under queue ownership. @internal */
export function runManagedNavigation<T>(adapter: QueryAdapter, invoke: () => T): T {
  managedAdapters.add(adapter)
  try {
    return invoke()
  }
  finally {
    managedAdapters.delete(adapter)
  }
}

/** Reports whether the current synchronous adapter call is queue-owned. @internal */
export function isManagedNavigation(adapter: QueryAdapter): boolean {
  return managedAdapters.has(adapter)
}
