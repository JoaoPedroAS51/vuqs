import type { App, InjectionKey } from 'vue'
import type { QueryAdapter } from '../runtime/adapter'
import { hasInjectionContext, inject, provide } from 'vue'
import { emitDebug, globalDebugChannel } from '../diagnostics/bus'

const QUERY_ADAPTER_KEY: InjectionKey<QueryAdapter> = Symbol('vuqs-query-adapter')

/**
 * Provides a query adapter to descendant components.
 *
 * @param adapter - The query source, navigate adapter, and optional defaults.
 */
export function provideQueryAdapter(adapter: QueryAdapter): void {
  provide(QUERY_ADAPTER_KEY, adapter)
}

/**
 * Installs a query adapter at the application level.
 *
 * @param app - The Vue application to provide the adapter on.
 * @param adapter - The query source, navigate adapter, and optional defaults.
 */
export function installQueryAdapter(app: App, adapter: QueryAdapter): void {
  app.provide(QUERY_ADAPTER_KEY, adapter)
}

/**
 * Reads the query adapter provided by an ancestor.
 *
 * @returns The provided {@link QueryAdapter}, or `undefined` when none is in scope.
 */
export function useQueryAdapter(): QueryAdapter | undefined {
  if (!hasInjectionContext()) {
    emitDebug(globalDebugChannel, 'adapter:missing')
    return undefined
  }

  const adapter = inject(QUERY_ADAPTER_KEY, undefined)

  if (adapter === undefined) {
    emitDebug(globalDebugChannel, 'adapter:missing')
  }

  return adapter
}
