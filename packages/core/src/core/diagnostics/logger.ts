import { emitDebug, emitWarn, globalDebugChannel, isDebugArmed } from './bus'

/**
 * A namespaced logger that writes into the vuqs debug stream.
 */
export interface DebugLogger {
  /** Emits a `module:log` event on the debug bus. Observed by any attached reporter. */
  debug: (message: string, ...args: unknown[]) => void
  /** Emits a `module:warn` event on the debug bus. Observed by any attached reporter. */
  warn: (message: string, ...args: unknown[]) => void
}

/**
 * Creates a namespaced {@link DebugLogger} for a third-party module or integration to
 * write into the vuqs debug stream.
 *
 * @param namespace - The tag identifying this logger's source, for example `my-module`.
 * @returns A logger whose `debug`/`warn` methods emit namespaced events.
 * @example
 * ```ts
 * import { createDebugLogger } from '@vuqs/core'
 *
 * const log = createDebugLogger('my-module')
 * log.debug('resolved %O', value) // [vuqs my-module] resolved { ... }
 * log.warn('ignoring invalid input %s', raw)
 * ```
 */
export function createDebugLogger(namespace: string): DebugLogger {
  return {
    debug: (message, ...args) => {
      if (isDebugArmed(globalDebugChannel)) {
        emitDebug(globalDebugChannel, 'module:log', { namespace, message, values: args })
      }
    },
    warn: (message, ...args) => {
      if (isDebugArmed(globalDebugChannel)) {
        emitWarn(globalDebugChannel, 'module:warn', { namespace, message, values: args })
      }
    },
  }
}
