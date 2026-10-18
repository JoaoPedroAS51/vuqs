import type { DebugChannelHandle } from './bus'
import { emitDebug, emitWarn, globalDebugChannel, isDebugArmed } from './bus'

/**
 * A namespaced logger that writes into the vuqs debug stream.
 */
export interface DebugLogger {
  /** Emits a `module:log` event when the target channel's debug stream is enabled. */
  debug: (message: string, ...args: unknown[]) => void
  /** Emits a `module:warn` event when the target channel's debug stream is enabled. */
  warn: (message: string, ...args: unknown[]) => void
}

/**
 * Options for {@link createDebugLogger}.
 */
export interface DebugLoggerOptions {
  /**
   * The destination channel. Events retain the attribution supplied by that channel.
   *
   * @default The global debug channel.
   */
  target?: DebugChannelHandle
}

/**
 * Creates a namespaced {@link DebugLogger} for the vuqs debug stream.
 *
 * @param namespace - The tag identifying this logger's source, for example `my-module`.
 * @param options - Where the logger writes.
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
 *
 * @example
 * ```ts
 * const withTracing = defineQueryModule({
 *   states: (core) => {
 *     const log = createDebugLogger('my-module', { target: core.debug })
 *     log.debug('setup')
 *
 *     return { api: {} }
 *   },
 * })
 * ```
 */
export function createDebugLogger(namespace: string, options: DebugLoggerOptions = {}): DebugLogger {
  const target = options.target ?? globalDebugChannel

  return {
    debug: (message, ...args) => {
      if (isDebugArmed(target)) {
        emitDebug(target, 'module:log', { namespace, message, values: args })
      }
    },
    warn: (message, ...args) => {
      if (isDebugArmed(target)) {
        emitWarn(target, 'module:warn', { namespace, message, values: args })
      }
    },
  }
}
