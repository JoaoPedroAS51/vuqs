import type { Enforce, QueryPipelineStage } from '../pipeline'
import type { Overlay } from '../queues/throttle'
// The strict debug protocol: the map from each event code to its typed payload.
//
// This file is intentionally type-only: it declares no runtime values, so it cannot
// be value-imported by mistake and never contributes bytes to any bundle. The core's
// own call sites and the separately-versioned `@vuqs/devtools` package both consume
// these types (the latter via the `@vuqs/core/debug-protocol` subpath). Treat the
// shapes here as an experimental contract governed by `DEBUG_PROTOCOL_VERSION`, not by
// the package's normal semver.
import type { NavigateOptions, ParsedQuery } from '../types'

/**
 * Every debug event code mapped to the payload it carries. An `undefined` payload
 * marks an event that reports only its occurrence.
 *
 * @experimental Governed by {@link DEBUG_PROTOCOL_VERSION}, outside normal semver.
 */
export interface DebugEventMap {
  // binding
  'binding:created': { id: string, keys: readonly string[], managedPaths: readonly string[] }
  'binding:disposed': { id: string, keys: readonly string[], managedPaths: readonly string[] }
  'binding:set': { id: string, keys: readonly string[], managedPaths: readonly string[], touched: readonly string[], touchedPaths: readonly string[], values: unknown, options: NavigateOptions }
  // engine
  'engine:clear-on-default': { id: string, keys: readonly string[], key: string, paths: readonly string[], defaultValue: unknown }
  'engine:parse-miss': { path: string, raw: unknown }
  // gtq (adapter-scoped throttle queue)
  'gtq:enqueue': { deltas: Overlay, pendingPathCount: number }
  'gtq:coalesce': { previous: NavigateOptions, incoming: NavigateOptions, resolved: NavigateOptions, writeCount: number }
  'gtq:schedule': { delayMs: number, mechanism: 'microtask' | 'timer' }
  'gtq:flush': { paths: readonly string[], query: ParsedQuery, options: NavigateOptions }
  'gtq:flush-skip': { reason: 'no paths' }
  'gtq:settle': { dropped: readonly string[] }
  'gtq:reset': undefined
  // tx (adapter-scoped transactions)
  'tx:start': { id: number, mode: 'patch' | 'replace', paths: readonly string[], origin?: string }
  // adapter
  'adapter:navigate': { adapter: string, mode: 'push' | 'replace', query: ParsedQuery }
  'adapter:commit': { query: ParsedQuery, paths: readonly string[], pendingPathCount: number, source: 'write' | 'external' }
  'adapter:error': { adapter: string, error: unknown, rolledBack?: readonly string[] }
  'adapter:missing': undefined
  // hooks
  'hooks:subscribe': { event: string }
  'hooks:emit': { event: string, args: readonly unknown[] }
  // pipeline
  'pipeline:tap': { stages: readonly QueryPipelineStage[], enforce: Enforce }
  // withRuntimeDefaults
  'rd:set': { defaults: Record<string, unknown> }
  'rd:clear': undefined
  'rd:reset': { context: string }
  'rd:register': { state: 'registered' | 'disposed' }
  // withContext
  'ctx:build': { kept: readonly string[], dropped: readonly string[] }
  'ctx:switch': { to: string }
  'ctx:change': { context: string, valid: readonly string[], invalid: readonly string[] }
  // withStorage
  'storage:restore-start': { key: string, policy: 'if-empty' | 'never' }
  'storage:restore': {
    key: string
    outcome: 'mirror-only' | 'load-error' | 'url-won' | 'empty' | 'invalid' | 'restored' | 'failed' | 'server-skip' | 'disposed'
  }
  'storage:write': { key: string, revision: number, operation: 'save' | 'remove', query: ParsedQuery }
  'storage:coalesce': { key: string, from: number, to: number }
  'storage:error': { key: string, operation: 'save' | 'remove' | 'serialize' | 'load' | 'snapshot' | 'restore', error: unknown }
  // serializer
  'serializer:clear-on-default': { key: string }
  'serializer:build': { query: ParsedQuery }
  // Escape hatch for third-party module loggers, at each level. Carries the raw message
  // and its native console arguments; the console reporter prefixes the namespace.
  'module:log': { namespace: string, message: string, values: readonly unknown[] }
  'module:warn': { namespace: string, message: string, values: readonly unknown[] }
}

/**
 * The set of valid debug codes: the keys of {@link DebugEventMap}.
 *
 * @experimental
 */
export type DebugEventCode = keyof DebugEventMap

/**
 * Codes emitted at the `warn` level. Kept as an explicit union so the emit API can
 * refuse a warning code where a log is expected, and vice versa.
 *
 * @experimental
 */
export type WarnDebugCode = 'engine:parse-miss' | 'adapter:error' | 'storage:error' | 'module:warn'

/**
 * Codes emitted at the `debug` (log) level: every code that is not a {@link WarnDebugCode}.
 *
 * @experimental
 */
export type LogDebugCode = Exclude<DebugEventCode, WarnDebugCode>

/**
 * The subsystem prefix of a code (the part before `:`), used to group and filter
 * events by area.
 *
 * @experimental
 */
export type DebugScope = DebugEventCode extends `${infer Scope}:${string}` ? Scope : never
