import type { Ref } from 'vue'
import type { ParsedQuery, QueryStateNavigate } from '../../src/core/types'
import { vi } from 'vitest'
import { createApp, effectScope } from 'vue'
import { createTestingAdapter } from '../../src/adapters/testing'
import { installQueryAdapter } from '../../src/core/adapter'

export interface TestQuery {
  query: Ref<ParsedQuery>
  navigate: ReturnType<typeof vi.fn<QueryStateNavigate>>
  run: <T>(create: () => T) => T
  build: <T>(create: () => T) => T
}

/**
 * Wires a testing adapter into a Vue app's injection context, the shape every
 * composable test needs: a spyable `navigate`, and both a plain `run` (for a
 * single composable call) and a scope-owning `build` (for module composition,
 * where disposers must attach to a real effect scope).
 *
 * @param initial - The starting query, in the same shape `createTestingAdapter`
 * accepts (query string, `URLSearchParams`, or a parsed query object).
 */
export function withTestQuery(initial: ParsedQuery = {}): TestQuery {
  const adapter = createTestingAdapter({ searchParams: initial, hasMemory: true })
  const navigate = vi.fn(adapter.navigate)
  const app = createApp({})
  installQueryAdapter(app, { query: adapter.query, navigate })

  const run = <T>(create: () => T): T => app.runWithContext(create)
  const build = <T>(create: () => T): T => app.runWithContext(() => effectScope().run(create)) as T

  return { query: adapter.query, navigate, run, build }
}
