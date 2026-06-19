import type { DebugEventCode, DebugEventMap, WarnDebugCode } from '../core/debug/events'
import { formatDebugLabelList, projectedDebugObjectKeys, quoteDebugLabel } from './labels'

export type DebugSummaryPolicy = 'aggregate' | 'visible' | 'conditional' | 'trace-only' | 'passthrough'

interface DebugEventReferenceBase<Code extends DebugEventCode> {
  readonly level: Code extends WarnDebugCode ? 'warn' : 'debug'
  readonly emittedWhen: string
  readonly payload: readonly (keyof DebugEventMap[Code] & string)[]
  readonly formatTrace: (data: DebugEventMap[Code], raw: DebugEventMap[Code]) => string
}

type DebugSummaryReference
  = | { readonly summary: 'trace-only', readonly summaryNote?: never, readonly summaryExample?: never }
    | { readonly summary: 'aggregate', readonly summaryNote: string, readonly summaryExample?: never }
    | { readonly summary: 'visible' | 'conditional' | 'passthrough', readonly summaryNote: string, readonly summaryExample: string }

type DebugEventReference<Code extends DebugEventCode> = DebugEventReferenceBase<Code> & DebugSummaryReference

type DebugEventCatalogShape = {
  readonly [Code in DebugEventCode]: DebugEventReference<Code>
}

type PayloadKeys<Code extends DebugEventCode> = DebugEventMap[Code] extends undefined
  ? never
  : keyof DebugEventMap[Code] & string

type CompletePayloadFields<Code extends DebugEventCode, Fields extends readonly string[]>
  = Exclude<PayloadKeys<Code>, Fields[number]> extends never
    ? unknown
    : { readonly __missingPayloadFields: never }

function defineDebugEventCatalog<const Catalog extends DebugEventCatalogShape>(
  catalog: Catalog & {
    readonly [Code in DebugEventCode]: CompletePayloadFields<Code, Catalog[Code]['payload']>
  },
): Catalog {
  return catalog
}

function count(value: number, singular: string, plural = `${singular}s`): string {
  return `${value} ${value === 1 ? singular : plural}`
}

function clearOnDefaultLabel(data: DebugEventMap['engine:clear-on-default']): string {
  return data.key === 'value' && data.paths.length === 1 ? data.paths[0]! : data.key
}

function bindingLabels(data: { keys: readonly string[], managedPaths: readonly string[] }, values = data.keys): readonly string[] {
  return data.keys.length === 1 && data.keys[0] === 'value' ? data.managedPaths : values
}

/**
 * Exhaustive presentation and documentation metadata for the structured debug protocol.
 *
 * This module is reachable only from opt-in debug entries and the documentation site.
 * Keeping the map typed by `DebugEventCode` makes a new protocol event fail compilation
 * until its console and reference policy are deliberately chosen.
 */
export const DEBUG_EVENT_CATALOG = defineDebugEventCatalog({
  'binding:created': {
    level: 'debug',
    summary: 'trace-only',
    emittedWhen: 'A query binding is created.',
    payload: ['id', 'keys', 'managedPaths'],
    formatTrace: (data, raw) => `Created a query binding for ${formatDebugLabelList(bindingLabels(data), 3, bindingLabels(raw))}.`,
  },
  'binding:disposed': {
    level: 'debug',
    summary: 'trace-only',
    emittedWhen: 'A query binding leaves its Vue effect scope.',
    payload: ['id', 'keys', 'managedPaths'],
    formatTrace: (data, raw) => `Disposed the query binding for ${formatDebugLabelList(bindingLabels(data), 3, bindingLabels(raw))}.`,
  },
  'binding:set': {
    level: 'debug',
    summary: 'aggregate',
    summaryNote: 'Contributes the paths requested by this binding to the final committed-write summary.',
    emittedWhen: 'A binding requests a patch or replacement transaction.',
    payload: ['id', 'keys', 'managedPaths', 'touched', 'touchedPaths', 'values', 'options'],
    formatTrace: (data, raw) => `Requested changes to ${formatDebugLabelList(data.touchedPaths, 3, raw.touchedPaths)}.`,
  },
  'engine:clear-on-default': {
    level: 'debug',
    summary: 'aggregate',
    summaryNote: 'Explains when a changed URL path now uses its resolved default in the final committed-write summary.',
    emittedWhen: 'The engine omits a value that equals its resolved default.',
    payload: ['id', 'keys', 'key', 'paths', 'defaultValue'],
    formatTrace: data => `Omitted ${quoteDebugLabel(clearOnDefaultLabel(data))} from the serialized query because it matches the resolved default value.`,
  },
  'engine:parse-miss': {
    level: 'warn',
    summary: 'visible',
    summaryNote: 'Warns that the invalid URL value was ignored.',
    summaryExample: '[vuqs] Ignored an invalid URL value for "page" because it could not be decoded.',
    emittedWhen: 'A value present in the URL cannot be decoded by its query param.',
    payload: ['path', 'raw'],
    formatTrace: data => `Could not decode the URL value for ${quoteDebugLabel(data.path)}.`,
  },
  'gtq:enqueue': {
    level: 'debug',
    summary: 'trace-only',
    emittedWhen: 'Serialized path changes enter the adapter write queue.',
    payload: ['deltas', 'pendingPathCount'],
    formatTrace: (data, raw) => `Queued ${count(Object.keys(raw.deltas).length, 'URL change')}; ${count(data.pendingPathCount, 'path')} ${data.pendingPathCount === 1 ? 'is' : 'are'} now pending.`,
  },
  'gtq:coalesce': {
    level: 'debug',
    summary: 'trace-only',
    emittedWhen: 'Another write joins the current queue batch and its options are merged.',
    payload: ['previous', 'incoming', 'resolved', 'writeCount'],
    formatTrace: () => 'Combined another write with the pending URL update.',
  },
  'gtq:schedule': {
    level: 'debug',
    summary: 'trace-only',
    emittedWhen: 'The queue schedules its next flush.',
    payload: ['delayMs', 'mechanism'],
    formatTrace: data => data.mechanism === 'microtask'
      ? 'Scheduled the URL update for the next microtask.'
      : `Scheduled the URL update in ${data.delayMs} ms.`,
  },
  'gtq:flush': {
    level: 'debug',
    summary: 'aggregate',
    summaryNote: 'Supplies the final changed paths, query, and navigation options to the committed-write summary.',
    emittedWhen: 'A queue batch materializes the next query and begins navigation.',
    payload: ['paths', 'query', 'options'],
    formatTrace: data => `Prepared ${count(data.paths.length, 'query parameter')} for navigation.`,
  },
  'gtq:flush-skip': {
    level: 'debug',
    summary: 'trace-only',
    emittedWhen: 'A scheduled queue flush finds no pending paths.',
    payload: ['reason'],
    formatTrace: () => 'Skipped the queue flush because no paths were pending.',
  },
  'gtq:settle': {
    level: 'debug',
    summary: 'trace-only',
    emittedWhen: 'Committed URL paths are removed from the optimistic overlay.',
    payload: ['dropped'],
    formatTrace: (data, raw) => `Removed committed paths from the optimistic state: ${formatDebugLabelList(data.dropped, 3, raw.dropped)}.`,
  },
  'gtq:reset': {
    level: 'debug',
    summary: 'trace-only',
    emittedWhen: 'The adapter write queue is reset.',
    payload: [],
    formatTrace: () => 'Reset the URL write queue.',
  },
  'tx:start': {
    level: 'debug',
    summary: 'trace-only',
    emittedWhen: 'The adapter runtime assigns an id to a query transaction.',
    payload: ['id', 'mode', 'paths', 'origin'],
    formatTrace: (data, raw) => `Started a ${data.mode} transaction for ${formatDebugLabelList(data.paths, 3, raw.paths)}.`,
  },
  'adapter:navigate': {
    level: 'debug',
    summary: 'trace-only',
    emittedWhen: 'The core or a standalone adapter requests URL navigation.',
    payload: ['adapter', 'mode', 'query'],
    formatTrace: data => `Asked the ${quoteDebugLabel(data.adapter)} adapter to ${data.mode} the URL.`,
  },
  'adapter:commit': {
    level: 'debug',
    summary: 'conditional',
    summaryNote: 'Completes one aggregated vuqs write, or reports paths changed outside vuqs.',
    summaryExample: '[vuqs] Updated "color" in the URL.',
    emittedWhen: 'The adapter query commits a managed write or changes externally.',
    payload: ['query', 'paths', 'pendingPathCount', 'source'],
    formatTrace: (data, raw) => data.source === 'write'
      ? `Observed a committed vuqs URL change for ${formatDebugLabelList(data.paths, 3, raw.paths)}.`
      : `Observed an external URL change for ${formatDebugLabelList(data.paths, 3, raw.paths)}.`,
  },
  'adapter:error': {
    level: 'warn',
    summary: 'visible',
    summaryNote: 'Reports the failed navigation and any values restored by rollback.',
    summaryExample: '[vuqs] Could not update the URL; restored the previous value of "color".',
    emittedWhen: 'An adapter navigation throws or rejects.',
    payload: ['adapter', 'error', 'rolledBack'],
    formatTrace: data => `The ${quoteDebugLabel(data.adapter)} adapter could not update the URL.`,
  },
  'adapter:missing': {
    level: 'debug',
    summary: 'trace-only',
    emittedWhen: '`useQueryAdapter()` finds no adapter in the current injection scope.',
    payload: [],
    formatTrace: () => 'No query adapter was available in the current scope.',
  },
  'hooks:subscribe': {
    level: 'debug',
    summary: 'trace-only',
    emittedWhen: 'A module subscribes to a query hook.',
    payload: ['event'],
    formatTrace: data => `Subscribed to the ${quoteDebugLabel(data.event)} hook.`,
  },
  'hooks:emit': {
    level: 'debug',
    summary: 'trace-only',
    emittedWhen: 'A query hook synchronously dispatches to its subscribers.',
    payload: ['event', 'args'],
    formatTrace: data => `Emitted the ${quoteDebugLabel(data.event)} hook.`,
  },
  'pipeline:tap': {
    level: 'debug',
    summary: 'trace-only',
    emittedWhen: 'A module registers one or more query pipeline transforms.',
    payload: ['stages', 'enforce'],
    formatTrace: data => `Registered a ${data.enforce} transform for the ${data.stages.join(' and ')} ${data.stages.length === 1 ? 'pipeline' : 'pipelines'}.`,
  },
  'rd:set': {
    level: 'debug',
    summary: 'visible',
    summaryNote: 'Reports the runtime-default decision with a bounded value preview.',
    summaryExample: '[vuqs] Set an empty runtime-default layer.',
    emittedWhen: 'A runtime-default layer sets one or more values.',
    payload: ['defaults'],
    formatTrace: (data, raw) => {
      const rawKeys = Object.keys(raw.defaults)
      const keys = projectedDebugObjectKeys(data.defaults, raw.defaults)
      return rawKeys.length === 0 ? 'Set an empty runtime-default layer.' : `Set runtime defaults for ${formatDebugLabelList(keys, 3, rawKeys)}.`
    },
  },
  'rd:clear': {
    level: 'debug',
    summary: 'visible',
    summaryNote: 'Reports an explicit removal of the runtime-default layer.',
    summaryExample: '[vuqs] Cleared the runtime defaults.',
    emittedWhen: 'The runtime-default layer is cleared explicitly.',
    payload: [],
    formatTrace: () => 'Cleared the runtime defaults.',
  },
  'rd:reset': {
    level: 'debug',
    summary: 'visible',
    summaryNote: 'Explains that a context change cleared the runtime-default layer.',
    summaryExample: '[vuqs] Cleared the runtime defaults after the query context changed to "reviews".',
    emittedWhen: 'A query context change resets the runtime-default layer.',
    payload: ['context'],
    formatTrace: data => `Cleared runtime defaults after the query context changed to ${quoteDebugLabel(data.context)}.`,
  },
  'rd:register': {
    level: 'debug',
    summary: 'trace-only',
    emittedWhen: 'The runtime-default layer is registered or disposed.',
    payload: ['state'],
    formatTrace: data => `${data.state === 'registered' ? 'Registered' : 'Disposed'} the runtime-default layer.`,
  },
  'ctx:build': {
    level: 'debug',
    summary: 'trace-only',
    emittedWhen: 'The context module builds a query for another context.',
    payload: ['kept', 'dropped'],
    formatTrace: (data, raw) => `Built the query for a context change; kept ${formatDebugLabelList(data.kept, 3, raw.kept)} and dropped ${formatDebugLabelList(data.dropped, 3, raw.dropped)}.`,
  },
  'ctx:switch': {
    level: 'debug',
    summary: 'trace-only',
    emittedWhen: '`switchTo()` requests navigation to another query context.',
    payload: ['to'],
    formatTrace: data => `Requested a switch to query context ${quoteDebugLabel(data.to)}.`,
  },
  'ctx:change': {
    level: 'debug',
    summary: 'visible',
    summaryNote: 'Reports the committed context and any query paths that became invalid.',
    summaryExample: '[vuqs] Changed the query context to "reviews"; "category" is no longer valid.',
    emittedWhen: 'The active query context changes.',
    payload: ['context', 'valid', 'invalid'],
    formatTrace: (data, raw) => `Changed the query context to ${quoteDebugLabel(data.context)}${data.invalid.length === 0 ? '.' : `; ${formatDebugLabelList(data.invalid, 3, raw.invalid)} ${raw.invalid.length === 1 ? 'is' : 'are'} no longer valid.`}`,
  },
  'storage:restore-start': {
    level: 'debug',
    summary: 'trace-only',
    emittedWhen: 'The storage module starts its initialization policy.',
    payload: ['key', 'policy'],
    formatTrace: data => `Started ${data.policy === 'never' ? 'mirroring' : 'restoring'} ${quoteDebugLabel(data.key)} ${data.policy === 'never' ? 'to' : 'from'} storage.`,
  },
  'storage:restore': {
    level: 'debug',
    summary: 'conditional',
    summaryNote: 'Appears only when stored state is applied or the current URL wins over storage.',
    summaryExample: '[vuqs] Applied saved query state from "filters".',
    emittedWhen: 'Storage initialization reaches a terminal outcome.',
    payload: ['key', 'outcome'],
    formatTrace: data => `Storage initialization for ${quoteDebugLabel(data.key)} finished with outcome ${quoteDebugLabel(data.outcome)}.`,
  },
  'storage:write': {
    level: 'debug',
    summary: 'trace-only',
    emittedWhen: 'A storage revision starts saving or removing a snapshot.',
    payload: ['key', 'revision', 'operation', 'query'],
    formatTrace: data => `Started ${data.operation === 'save' ? 'saving' : 'removing'} revision ${data.revision} of ${quoteDebugLabel(data.key)} ${data.operation === 'save' ? 'to' : 'from'} storage.`,
  },
  'storage:coalesce': {
    level: 'debug',
    summary: 'trace-only',
    emittedWhen: 'A newer storage revision replaces one that has not started yet.',
    payload: ['key', 'from', 'to'],
    formatTrace: data => `Replaced pending storage revision ${data.from} with revision ${data.to} for ${quoteDebugLabel(data.key)}.`,
  },
  'storage:error': {
    level: 'warn',
    summary: 'visible',
    summaryNote: 'Reports the failed storage operation with an operation-specific sentence.',
    summaryExample: '[vuqs] Could not save "filters" to storage.',
    emittedWhen: 'A storage load, validation, serialization, save, removal, or restore operation fails.',
    payload: ['key', 'operation', 'error'],
    formatTrace: data => `Storage operation ${quoteDebugLabel(data.operation)} failed for ${quoteDebugLabel(data.key)}.`,
  },
  'serializer:clear-on-default': {
    level: 'debug',
    summary: 'trace-only',
    emittedWhen: 'The standalone serializer omits a value equal to its default.',
    payload: ['key'],
    formatTrace: data => `Omitted ${quoteDebugLabel(data.key)} because it matches its default value.`,
  },
  'serializer:build': {
    level: 'debug',
    summary: 'trace-only',
    emittedWhen: 'The standalone serializer finishes building a query object.',
    payload: ['query'],
    formatTrace: (_data, raw) => `Built a query object with ${count(Object.keys(raw.query).length, 'top-level parameter')}.`,
  },
  'module:log': {
    level: 'debug',
    summary: 'passthrough',
    summaryNote: 'Prints the module-authored message and projected native console arguments.',
    summaryExample: '[vuqs module] hello',
    emittedWhen: 'A third-party module writes through `createDebugLogger()`.',
    payload: ['namespace', 'message', 'values'],
    formatTrace: data => `Module ${quoteDebugLabel(data.namespace)} logged: ${data.message}`,
  },
  'module:warn': {
    level: 'warn',
    summary: 'passthrough',
    summaryNote: 'Prints the module-authored warning and projected native console arguments.',
    summaryExample: '[vuqs module] careful',
    emittedWhen: 'A third-party module warns through `createDebugLogger()`.',
    payload: ['namespace', 'message', 'values'],
    formatTrace: data => `Module ${quoteDebugLabel(data.namespace)} warned: ${data.message}`,
  },
})

export const DEBUG_EVENT_ENTRIES = Object.entries(DEBUG_EVENT_CATALOG) as Array<[
  DebugEventCode,
  DebugEventCatalogShape[DebugEventCode],
]>
