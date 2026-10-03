import type { App, InjectionKey } from 'vue'
import type { QueryAdapter } from '../runtime/adapter'
import { hasInjectionContext, inject, provide } from 'vue'
import { emitDebug, globalDebugChannel } from '../diagnostics/bus'

const QUERY_ADAPTER_KEY: InjectionKey<QueryAdapter> = Symbol('vuqs-query-adapter')

/**
 * Provides a query adapter to descendant components.
 *
 * @remarks
 * Call from a component `setup`. Descendant calls to {@link useQueryStates} and
 * {@link useQueryState} then resolve `query` and `navigate` from this adapter
 * unless they are passed explicitly.
 *
 * @param adapter - The query source, navigate adapter, and optional defaults.
 */
export function provideQueryAdapter(adapter: QueryAdapter): void {
  provide(QUERY_ADAPTER_KEY, adapter)
}

/**
 * Installs a query adapter at the application level.
 *
 * @remarks
 * The app-level counterpart to {@link provideQueryAdapter}: it provides the
 * adapter on the Vue `App` rather than the current component instance, so it can
 * be called where there is no active instance, such as application setup or a
 * plugin (`installQueryAdapter(app, adapter)`). Every descendant then resolves it
 * through {@link useQueryAdapter}.
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
 * @remarks
 * Safe to call outside a component: returns `undefined` when there is no active
 * injection context or no adapter was provided.
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
