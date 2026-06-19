import type { DebugEvent, Reporter } from '../core/debug/bus'
import type { NormalizeLimits } from '../core/debug/normalize'
import type { DebugRedactor } from './payload'
import { createDebugPreview, resolvePreviewLimits } from './payload'

export interface PerformanceReporterOptions {
  /** Most marks retained before the reporter clears its own names. @default 500 */
  limit?: number
  /** Additional application redaction applied to bounded mark detail. */
  redact?: DebugRedactor
  /** Overrides the bounded detail limits. */
  previewLimits?: Partial<NormalizeLimits>
}

export interface PerformanceDebugReporter extends Reporter {
  /** Clears User Timing marks created by this reporter. */
  clear: () => void
}

const REPORTER_SEQUENCE_KEY = Symbol.for('@vuqs/core:performance-reporter-sequence')
const performanceHost = globalThis as typeof globalThis & { [REPORTER_SEQUENCE_KEY]?: number }

function nextReporterId(): string {
  const sequence = performanceHost[REPORTER_SEQUENCE_KEY] ?? 0
  performanceHost[REPORTER_SEQUENCE_KEY] = sequence + 1
  return sequence.toString(36)
}

/** Creates an opt-in, bounded User Timing projection of debug events. */
export function createPerformanceReporter(options: PerformanceReporterOptions = {}): PerformanceDebugReporter {
  const limit = finiteLimit(options.limit ?? 500)
  const limits = resolvePreviewLimits(options.previewLimits)
  const prefix = `vuqs:r${nextReporterId()}`
  const names = new Set<string>()
  let count = 0

  const clear = (): void => {
    if (!canMark() || typeof performance.clearMarks !== 'function') {
      names.clear()
      count = 0
      return
    }

    for (const name of names) {
      performance.clearMarks(name)
    }
    names.clear()
    count = 0
  }

  const reporter = ((event: DebugEvent): void => {
    if (!canMark() || limit === 0) {
      return
    }

    if (count >= limit) {
      clear()
    }

    const name = `${prefix}:${event.code}`
    try {
      performance.mark(name, {
        detail: {
          seq: event.seq,
          level: event.level,
          scope: event.scope,
          context: event.context,
          data: createDebugPreview(event, limits, options.redact),
        },
      })
      names.add(name)
      count++
    }
    catch {
      // User Timing support and structured-clone policies vary by host. Diagnostics
      // must never interfere with the application or another reporter.
    }
  }) as PerformanceDebugReporter

  reporter.clear = clear
  return reporter
}

function finiteLimit(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 500
}

function canMark(): boolean {
  return typeof performance !== 'undefined' && typeof performance.mark === 'function'
}
