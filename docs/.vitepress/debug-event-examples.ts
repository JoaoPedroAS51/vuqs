import type { DebugEventCode, DebugEventMap } from '../../packages/core/src/core/debug/events'

/**
 * Documentation-only sample payloads. The exhaustive map keeps every rendered
 * example aligned with the structured protocol while the catalog remains the
 * single source of truth for its human-readable trace prose.
 */
export const DEBUG_EVENT_EXAMPLES = {
  'binding:created': { id: 'b', keys: ['color'], managedPaths: ['color'] },
  'binding:disposed': { id: 'b', keys: ['color'], managedPaths: ['color'] },
  'binding:set': { id: 'b', keys: ['color'], managedPaths: ['color'], touched: ['color'], touchedPaths: ['color'], values: { color: 'green' }, options: {} },
  'engine:clear-on-default': { id: 'b', keys: ['page'], key: 'page', paths: ['page'], defaultValue: 1 },
  'engine:parse-miss': { path: 'page', raw: 'bad' },
  'gtq:enqueue': { deltas: { color: 'green' }, pendingPathCount: 2 },
  'gtq:coalesce': { previous: {}, incoming: { history: 'push' }, resolved: { history: 'push' }, writeCount: 2 },
  'gtq:schedule': { delayMs: 0, mechanism: 'microtask' },
  'gtq:flush': { paths: ['color', 'page'], query: { color: 'green', page: 2 }, options: {} },
  'gtq:flush-skip': { reason: 'no paths' },
  'gtq:settle': { dropped: ['color', 'page'] },
  'gtq:reset': undefined,
  'tx:start': { id: 1, mode: 'patch', paths: ['color'], origin: 'docs' },
  'adapter:navigate': { adapter: 'vue-router', mode: 'replace', query: { color: 'green' } },
  'adapter:commit': { query: { color: 'green' }, paths: ['color'], pendingPathCount: 0, source: 'write' },
  'adapter:error': { adapter: 'vue-router', error: new Error('navigation failed'), rolledBack: ['color'] },
  'adapter:missing': undefined,
  'hooks:subscribe': { event: 'context:change' },
  'hooks:emit': { event: 'context:change', args: ['reviews'] },
  'pipeline:tap': { stages: ['read'], enforce: 'pre' },
  'rd:set': { defaults: { color: 'green', page: 2 } },
  'rd:clear': undefined,
  'rd:reset': { context: 'reviews' },
  'rd:register': { state: 'registered' },
  'ctx:build': { kept: ['search'], dropped: ['category'] },
  'ctx:switch': { to: 'reviews' },
  'ctx:change': { context: 'reviews', valid: ['search'], invalid: ['category'] },
  'storage:restore-start': { key: 'filters', policy: 'if-empty' },
  'storage:restore': { key: 'filters', outcome: 'restored' },
  'storage:write': { key: 'filters', revision: 3, operation: 'save', query: { q: 'x' } },
  'storage:coalesce': { key: 'filters', from: 2, to: 3 },
  'storage:error': { key: 'filters', operation: 'save', error: new Error('storage failed') },
  'serializer:clear-on-default': { key: 'page' },
  'serializer:build': { query: { color: 'green', page: 2 } },
  'module:log': { namespace: 'module', message: 'Resolved value.', values: [] },
  'module:warn': { namespace: 'module', message: 'Could not resolve value.', values: [] },
} satisfies { [Code in DebugEventCode]: DebugEventMap[Code] }
