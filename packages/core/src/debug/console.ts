import type { DebugChannelHandle } from '../core/debug/bus'
import type { ConsoleReporterOptions } from './console-reporter'
import { addDebugReporter } from '../core/debug/bus'
import { createConsoleReporter } from './console-reporter'

export {
  readStoredConsoleDebugConfig,
  VUQS_DEBUG_CONFIG_VERSION,
  VUQS_DEBUG_STORAGE_KEY,
} from './config'
export type {
  StoredConsoleDebugConfig,
  StoredConsoleDebugResolution,
  StoredConsoleReporterOptions,
  StoredDebugConfigV1,
  StoredDebugEventFilter,
  StoredDebugEventSelector,
  StoredDebugPayloadMode,
} from './config'
export { createConsoleReporter } from './console-reporter'
export type {
  ConsoleDebugPreset,
  ConsoleReporterOptions,
  DebugEventFilter,
  DebugEventSelector,
  DebugPayloadMode,
} from './console-reporter'
export { createPerformanceReporter } from './performance-reporter'
export type { PerformanceDebugReporter, PerformanceReporterOptions } from './performance-reporter'

export interface AddConsoleDebugReporterOptions extends ConsoleReporterOptions {
  /** Restricts this console projection to one adapter runtime. */
  channel?: DebugChannelHandle
}

/** Attaches an independently-owned console reporter and returns its disposer. */
export function addConsoleDebugReporter(options: AddConsoleDebugReporterOptions = {}): () => void {
  const { channel, ...reporterOptions } = options
  return addDebugReporter(createConsoleReporter(reporterOptions), { channel })
}
