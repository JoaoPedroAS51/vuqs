import type { DebugEventCode, DebugEventMap } from '../../../src/core/diagnostics/events'
import type { ConsoleReporterOptions } from '../../../src/debug/console-reporter'
import { onTestFinished } from 'vitest'
import { createDebugChannel } from '../../../src/core/diagnostics/bus'
import { createConsoleReporter } from '../../../src/debug/console-reporter'

export function track<T extends () => void>(dispose: T): T {
  onTestFinished(dispose)
  return dispose
}

export function withReporter(options: ConsoleReporterOptions = {}): ReturnType<typeof createDebugChannel> {
  const channel = createDebugChannel('rt-console')
  track(channel.addReporter(createConsoleReporter(options)))
  return channel
}

export const TRACE_PAYLOADS = {
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
  'tx:start': { id: 1, mode: 'patch', paths: ['color'], origin: 'test' },
  'adapter:navigate': { adapter: 'vue-router', mode: 'replace', query: { color: 'green' } },
  'adapter:commit': { query: { color: 'green' }, paths: ['color'], pendingPathCount: 0, source: 'write' },
  'adapter:error': { adapter: 'vue-router', error: new Error('nav'), rolledBack: ['color'] },
  'adapter:missing': undefined,
  'hooks:subscribe': { event: 'context:change' },
  'hooks:emit': { event: 'context:change', args: ['reviews'] },
  'pipeline:tap': { stages: ['read'], enforce: 'pre' },
  'rd:set': { defaults: {} },
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
  'storage:error': { key: 'filters', operation: 'save', error: new Error('disk') },
  'serializer:clear-on-default': { key: 'page' },
  'serializer:build': { query: { color: 'green', page: 2 } },
  'module:log': { namespace: 'module', message: 'hello', values: [] },
  'module:warn': { namespace: 'module', message: 'careful', values: [] },
} satisfies { [Code in DebugEventCode]: DebugEventMap[Code] }

export function emitCommittedWrite(
  channel: ReturnType<typeof createDebugChannel>,
  batchId: number,
  paths: string[],
  query: DebugEventMap['gtq:flush']['query'],
  options: DebugEventMap['gtq:flush']['options'] = {},
): void {
  const context = { batchId }
  channel.debug('gtq:flush', { paths, query, options }, context)
  channel.debug('adapter:commit', { query, paths, pendingPathCount: paths.length, source: 'write' }, context)
}
