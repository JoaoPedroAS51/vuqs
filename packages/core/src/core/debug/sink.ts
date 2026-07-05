// Type-only import: erased at build time, so the message catalog's *types* constrain
// the call sites here while its *values* stay out of the core bundle (they ship only
// via the opt-in `@vuqs/core/debug` entry).
import type { DebugArgs, DebugCode } from './messages'

/**
 * Renders a debug event. Installed by the opt-in `@vuqs/core/debug` entry.
 *
 * @remarks
 * The first argument is a catalog {@link DebugCode} from the core's own call sites, or
 * a pre-formatted literal message from a module logger ({@link createDebugLogger}). The
 * renderer resolves a known code to its catalog string and passes any other value
 * through unchanged.
 *
 * @internal
 */
export type DebugSink = (
  codeOrMessage: DebugCode | (string & {}),
  args: unknown[],
  isWarn?: boolean,
) => void

let sink: DebugSink | null = null

/**
 * Installs (or removes, with `null`) the function that renders debug events. When no
 * sink is installed, {@link debug}/{@link warn} are no-ops.
 *
 * @internal
 */
export function setDebugSink(newSink: DebugSink | null): void {
  sink = newSink
}

/**
 * Emits a debug log event. A no-op unless a sink is installed (the perf guard is the
 * null sink, not a per-call flag check), so call sites stay cheap in production.
 *
 * @internal
 */
export function debug<Code extends DebugCode>(
  code: Code,
  ...args: DebugArgs<Code>
): void {
  sink?.(code, args)
}

/**
 * The warning counterpart of {@link debug}: the same null-sink no-op, routed to
 * `console.warn` by the installed sink.
 *
 * @internal
 */
export function warn<Code extends DebugCode>(
  code: Code,
  ...args: DebugArgs<Code>
): void {
  sink?.(code, args, true)
}

/**
 * Emits a pre-formatted message through the sink. Backs {@link createDebugLogger} so
 * module loggers share the core's rendering, flag, and timing marks without going
 * through the catalog.
 *
 * @internal
 */
export function emit(message: string, args: unknown[], isWarn?: boolean): void {
  sink?.(message, args, isWarn)
}

/**
 * Reports whether the debug flag is set: `process.env.DEBUG` on the server (never
 * touching `localStorage`), `localStorage.debug` on the client, each matched as a
 * substring so a shared flag like `'app:*,vuqs'` works.
 *
 * @internal
 */
export function isDebugFlagSet(): boolean {
  // Server (Node/SSR): use the DEBUG env var, never touch localStorage. Read it off
  // `globalThis` so this isomorphic module carries no bare `process` reference and
  // needs no `node:process` import in the browser build.
  if (typeof window === 'undefined') {
    // eslint-disable-next-line node/prefer-global/process -- isomorphic: read the global, don't import node:process
    return (globalThis.process?.env?.DEBUG || '').includes('vuqs')
  }

  // localStorage may be unavailable even when defined (e.g. Safari private mode),
  // so probe it before reading the flag and swallow any access error.
  try {
    if (typeof localStorage === 'undefined') {
      return false
    }

    const probe = 'vuqs-localStorage-test'
    localStorage.setItem(probe, probe)
    const available = localStorage.getItem(probe) === probe
    localStorage.removeItem(probe)

    return available && (localStorage.getItem('debug') || '').includes('vuqs')
  }
  catch {
    return false
  }
}
