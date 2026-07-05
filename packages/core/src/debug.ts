import type { DebugCode } from './core/debug/messages'
import type { DebugSink } from './core/debug/sink'
import { debugMessages, sprintf } from './core/debug/messages'
import { isDebugFlagSet, setDebugSink } from './core/debug/sink'

// Side-effect-only entry point (`@vuqs/core/debug`): importing it opts console debug
// logging into the bundle. The format-string catalog and rendering live here rather
// than in the core, so they ship only when a consumer imports this module. Logging
// then stays gated behind the `debug` flag (`localStorage.debug` on the client,
// `DEBUG` on the server), each matched as a substring for `vuqs`.

const canMark
  = typeof performance !== 'undefined' && typeof performance.mark === 'function'

const consoleSink: DebugSink = (codeOrMessage, args, isWarn) => {
  // Core call sites pass a catalog code; module loggers pass a literal message that
  // is not in the catalog, so fall back to rendering it verbatim.
  const message = debugMessages[codeOrMessage as DebugCode] ?? codeOrMessage

  if (isWarn) {
    console.warn(message, ...args)
    return
  }

  // Record a User Timing mark so the fully-formatted message shows up on the
  // browser Performance timeline for perf analysis.
  if (canMark) {
    performance.mark(sprintf(message, ...args))
  }

  // Pass the raw format string so the console does native `%O` object expansion,
  // keeping logged values inspectable.
  // eslint-disable-next-line no-console -- this module is the debug logger
  console.log(message, ...args)
}

/**
 * Turns console debug logging on by installing the rendering sink. Idempotent:
 * calling it again while already enabled has no effect.
 *
 * @remarks
 * Importing `@vuqs/core/debug` calls this automatically when the `debug` flag is set
 * (`localStorage.debug`/`DEBUG` containing `vuqs`). Call it directly to enable logging
 * without the flag, for example from a framework integration or the devtools console:
 * `import('@vuqs/core/debug').then(m => m.enableDebug())`.
 *
 * @example
 * ```ts
 * import '@vuqs/core/debug' // once, anywhere in your app
 * localStorage.debug = 'vuqs' // on the client
 * process.env.DEBUG = 'vuqs' // on the server
 * ```
 */
export function enableDebug(): void {
  setDebugSink(consoleSink)
}

/**
 * Turns console debug logging off by removing the rendering sink. After this,
 * `debug`/`warn` call sites are no-ops until {@link enableDebug} runs again.
 */
export function disableDebug(): void {
  setDebugSink(null)
}

// Respect the flag as soon as this entry loads, so `import '@vuqs/core/debug'` is all
// that is needed to turn logging on.
if (isDebugFlagSet()) {
  enableDebug()
}
