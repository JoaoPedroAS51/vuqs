import type { AddConsoleDebugReporterOptions } from './debug/console'
import { addConsoleDebugReporter, readStoredConsoleDebugConfig } from './debug/console'

export {
  addConsoleDebugReporter,
  createConsoleReporter,
  createPerformanceReporter,
  readStoredConsoleDebugConfig,
  VUQS_DEBUG_CONFIG_VERSION,
  VUQS_DEBUG_STORAGE_KEY,
} from './debug/console'
export type {
  AddConsoleDebugReporterOptions,
  ConsoleDebugPreset,
  ConsoleReporterOptions,
  DebugEventFilter,
  DebugEventSelector,
  DebugPayloadMode,
  PerformanceDebugReporter,
  PerformanceReporterOptions,
  StoredConsoleDebugConfig,
  StoredConsoleDebugResolution,
  StoredConsoleReporterOptions,
  StoredDebugConfigV1,
  StoredDebugEventFilter,
  StoredDebugEventSelector,
  StoredDebugPayloadMode,
} from './debug/console'

export type EnableDebugOptions = AddConsoleDebugReporterOptions

interface ConsoleDebugState {
  generation: number
  stop?: () => void
}

const STATE_KEY = Symbol.for('@vuqs/core:console-debug-state')
const host = globalThis as typeof globalThis & { [STATE_KEY]?: ConsoleDebugState }
const state = host[STATE_KEY] ??= { generation: 0 }

/**
 * Enables or reconfigures the official console projection.
 *
 * Calling it again atomically replaces the previous projection. The returned disposer
 * is generation-safe: an old owner cannot later detach a newer configuration. External
 * reporters are never affected.
 */
export function enableDebug(options: EnableDebugOptions = {}): () => void {
  state.stop?.()
  const generation = ++state.generation
  const stop = addConsoleDebugReporter(options)
  state.stop = stop

  return () => {
    if (state.generation !== generation) {
      return
    }
    stop()
    state.stop = undefined
    state.generation++
  }
}

/** Disables only the official console projection. */
export function disableDebug(): void {
  state.stop?.()
  state.stop = undefined
  state.generation++
}

// Browser-only auto-enable: a process-global reporter is unsafe in concurrent SSR.
// Server/framework integrations must use the pure entry with an adapter-scoped channel.
if (typeof window !== 'undefined') {
  const stored = readStoredConsoleDebugConfig()
  if (stored.status === 'enabled') {
    enableDebug(stored.options)
  }
  else if (stored.status === 'invalid') {
    console.warn(stored.message)
  }
}
