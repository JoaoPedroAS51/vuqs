import { emit } from './sink'

/**
 * A namespaced logger that writes into the vuqs debug stream.
 *
 * @remarks
 * Returned by {@link createDebugLogger}. Both methods take a message with
 * `printf`-style placeholders (`%s`, `%d`, `%f`, `%O`) followed by their arguments,
 * the same format the browser console interpolates.
 */
export interface DebugLogger {
  /** Emits a log-level message. Rendered only while debug logging is enabled. */
  debug: (message: string, ...args: unknown[]) => void
  /** Emits a warning. Rendered whenever the debug entry is installed. */
  warn: (message: string, ...args: unknown[]) => void
}

/**
 * Creates a namespaced {@link DebugLogger} for a third-party module or integration to
 * write into the vuqs debug stream.
 *
 * @remarks
 * Messages route through the same sink as the core's own logs, so they honor the
 * `enableDebug()` toggle, render through the installed console renderer, and emit
 * `performance.mark` timing entries. Each message is prefixed with `[vuqs <namespace>]`
 * to match the core's tag scheme, so pass your module's name as the namespace. Calls
 * are no-ops until the `@vuqs/core/debug` entry is imported and logging is enabled.
 *
 * @param namespace - The tag identifying this logger's source, for example `my-module`.
 * @returns A logger whose `debug`/`warn` methods emit namespaced messages.
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
  const prefix = `[vuqs ${namespace}]`

  return {
    debug: (message, ...args) => emit(`${prefix} ${message}`, args),
    warn: (message, ...args) => emit(`${prefix} ${message}`, args, true),
  }
}
