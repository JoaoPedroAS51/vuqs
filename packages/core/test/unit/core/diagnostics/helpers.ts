import type { EngineSnapshot } from '../../../../src/core/diagnostics/snapshot'
import { onTestFinished } from 'vitest'

export function track<T extends () => void>(dispose: T): T {
  onTestFinished(dispose)
  return dispose
}

export function engineSnapshot(id: string, keys: string[] = [], values: Record<string, unknown> = {}): EngineSnapshot {
  return {
    id,
    keys,
    managedPaths: keys,
    committedSelected: values,
    optimisticSelected: values,
    values,
    defaults: {},
  }
}
