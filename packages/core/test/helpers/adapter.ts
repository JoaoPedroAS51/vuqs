import type { Ref } from 'vue'
import type { ParsedQuery } from '../../src/core/query/types'
import type { QueryStateNavigate } from '../../src/core/runtime/adapter'
import { onTestFinished, vi } from 'vitest'
import { createApp, effectScope } from 'vue'
import { createTestingAdapter } from '../../src/adapters/testing'
import { installQueryAdapter } from '../../src/core/bindings/adapter-provider'
import { resetQueryRuntime } from '../../src/core/runtime/adapter-runtime'

export interface TestQuery {
  query: Ref<ParsedQuery>
  navigate: ReturnType<typeof vi.fn<QueryStateNavigate>>
  run: <T>(create: () => T) => T
  build: <T>(create: () => T) => T
  dispose: () => void
}

/**
 * Installs a testing adapter in a Vue app's injection context.
 *
 * `run` and `build` share a fixture-owned effect scope. The fixture is disposed
 * automatically when the test finishes, or explicitly with `dispose`.
 *
 * @param initial - The starting parsed query object.
 */
export function withTestQuery(initial: ParsedQuery = {}): TestQuery {
  const adapter = createTestingAdapter({ searchParams: initial, hasMemory: true })
  const navigate = vi.fn(adapter.navigate)
  const app = createApp({})
  const installedAdapter = { query: adapter.query, navigate }
  installQueryAdapter(app, installedAdapter)
  const scope = effectScope(true)
  let disposed = false

  function dispose(): void {
    if (disposed) {
      return
    }
    disposed = true

    try {
      scope.stop()
    }
    finally {
      resetQueryRuntime(installedAdapter)
    }
  }

  function run<T>(create: () => T): T {
    if (disposed) {
      throw new Error('The test query fixture has been disposed')
    }
    return app.runWithContext(() => scope.run(create)) as T
  }

  onTestFinished(dispose)

  return { query: adapter.query, navigate, run, build: run, dispose }
}
