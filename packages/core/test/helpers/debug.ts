import { onTestFinished, vi } from 'vitest'
import { addDebugReporter } from '../../src/core/diagnostics/bus'
import { disableDebug } from '../../src/debug'

export const flush = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0))

export function trackReporter(dispose: () => void): void {
  onTestFinished(dispose)
}

// Records the sequence of emitted codes through the structured bus, so tests assert
// lifecycle order without coupling to the exact log strings.
export function captureCodes(): string[] {
  const codes: string[] = []
  trackReporter(addDebugReporter(event => codes.push(event.code)))
  return codes
}

// Records each emitted event as a `[code, data]` pair for structured payload assertions.
export function captureEvents(): Array<[string, unknown]> {
  const events: Array<[string, unknown]> = []
  trackReporter(addDebugReporter(event => events.push([event.code, event.data])))
  return events
}

// Returns true when `seq` appears as an in-order subsequence of `codes`.
export function inOrder(codes: string[], seq: string[]): boolean {
  let i = 0
  for (const code of codes) {
    if (code === seq[i]) {
      i++
    }
    if (i === seq.length) {
      return true
    }
  }
  return false
}

// Disarms debug and drops module state that `enableDebug` may have initialized.
export function resetDebugState(): void {
  disableDebug()
  vi.resetModules()
}
