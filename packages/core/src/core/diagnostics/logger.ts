import { emitDebug, emitWarn, globalDebugChannel, isDebugArmed } from './bus'

/**
 * A namespaced logger that writes into the vuqs debug stream.
 *
 * @remarks
 * Returned by {@link createDebugLogger}. Both methods take a message with
 * `printf`-style placeholders (`%s`, `%d`, `%f`, `%O`) followed by their arguments,
 * the same format the browser console interpolates.
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
 * @remarks
 * Messages publish as `module:log`/`module:warn` events on the global debug bus, so any
 * attached reporter or history lease observes them directly. Importing `@vuqs/core/debug`
 * is required only to render them to the console (where the message is prefixed with
 * `[vuqs <namespace>]` and its `%s`/`%O` placeholders interpolate natively). With nothing
 * observing, the bus performs only its armed check, though the call still evaluates
 * and collects its own arguments.
 *
 * @param namespace - The tag identifying this logger's source, for example `my-module`.
 * @returns A logger whose `debug`/`warn` methods emit namespaced events.
 *
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
