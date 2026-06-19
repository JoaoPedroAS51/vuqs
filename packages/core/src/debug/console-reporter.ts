import type { DebugContext, DebugEvent, DebugLevel, Reporter } from '../core/debug/bus'
import type { DebugEventCode, DebugEventMap } from '../core/debug/events'
import type { NormalizeLimits } from '../core/debug/normalize'
import type { NavigateOptions, ParsedQuery } from '../core/types'
import type { DebugRedactor } from './payload'
import { getPath, setPath } from '../core/path'
import { DEBUG_EVENT_CATALOG } from './event-catalog'
import { formatDebugLabelList, projectedDebugObjectKeys } from './labels'
import { createDebugPreview, resolvePreviewLimits } from './payload'

// This file is reachable only from opt-in debug entries. Human-readable prose and
// presentation policy must never be imported by the base package.

export type ConsoleDebugPreset = 'summary' | 'trace'
export type DebugPayloadMode = 'preview' | 'full' | 'hidden'

export interface DebugEventSelector {
  levels?: readonly DebugLevel[]
  scopes?: readonly string[]
  codes?: readonly string[]
  runtimeIds?: readonly string[]
  bindingIds?: readonly string[]
}

export interface DebugEventFilter {
  include?: DebugEventSelector
  exclude?: DebugEventSelector
}

export interface ConsoleReporterOptions {
  /** Human-oriented `summary`, or the complete event stream. @default 'summary' */
  preset?: ConsoleDebugPreset
  /** Stable bounded preview, raw live references, or no payload. @default 'preview' */
  payload?: DebugPayloadMode
  /** Selects events before any payload normalization or redaction work. */
  filter?: DebugEventFilter
  /** Additional application redaction applied after the built-in sensitive-key pass. */
  redact?: DebugRedactor
  /** Overrides the bounded preview limits. */
  previewLimits?: Partial<NormalizeLimits>
}

type Rendered = readonly [method: 'log' | 'warn', message: string, ...args: unknown[]]

interface ProjectedEvent {
  readonly details: unknown
  readonly data: unknown
}

interface ClearOnDefaultDecision {
  readonly key: string
  readonly paths: readonly string[]
  readonly defaultValue: unknown
}

interface PendingWriteSummary {
  flush?: DebugEventMap['gtq:flush']
  readonly clearOnDefault: ClearOnDefaultDecision[]
  readonly includedPaths: Set<string>
  unrestricted: boolean
}

interface WriteSummaryDetails {
  readonly changes: Record<string, unknown>
  readonly query: ParsedQuery
  readonly navigation: NavigateOptions
  readonly defaults: Record<string, unknown>
}

const REMOVED = '[Removed]'

function selectorMatches(selector: DebugEventSelector, event: DebugEvent): boolean {
  const context = event.context

  return matches(selector.levels, event.level)
    && matches(selector.scopes, event.scope)
    && matches(selector.codes, event.code)
    && matches(selector.runtimeIds, context?.runtimeId)
    && matches(selector.bindingIds, context?.bindingId)
}

function matches(values: readonly string[] | undefined, value: string | undefined): boolean {
  return values === undefined || (value !== undefined && values.includes(value))
}

function filterAllows(filter: DebugEventFilter | undefined, event: DebugEvent): boolean {
  if (filter?.include !== undefined && !selectorMatches(filter.include, event)) {
    return false
  }

  return !filterExcludes(filter, event)
}

function filterExcludes(filter: DebugEventFilter | undefined, event: DebugEvent): boolean {
  return filter?.exclude !== undefined && selectorMatches(filter.exclude, event)
}

function projectedPayload(
  event: DebugEvent,
  data: unknown,
  options: ConsoleReporterOptions,
  limits: NormalizeLimits,
): unknown {
  if (options.payload === 'hidden') {
    return undefined
  }

  if (options.payload === 'full') {
    return data
  }

  return createDebugPreview({ ...event, data }, limits, options.redact)
}

function eventDetails(event: DebugEvent, data: unknown = event.data): Record<string, unknown> {
  return {
    sequence: event.seq,
    timestamp: event.timestamp,
    monotonicTime: event.monotonicTime,
    scope: event.scope,
    context: event.context,
    data,
  }
}

function traceProse(event: DebugEvent, data: unknown): string {
  const reference = DEBUG_EVENT_CATALOG[event.code as DebugEventCode]
  if (reference === undefined) {
    return 'Observed an unknown debug event.'
  }
  if (!traceProjectionMatches(event.data, data)) {
    return 'Observed this debug event; its labels were hidden by the payload policy.'
  }

  try {
    return (reference.formatTrace as (data: unknown, raw: unknown) => string)(data, event.data)
  }
  /* v8 ignore start -- catalog formatters are exhaustive and projected shapes are validated above */
  catch {
    return 'Observed this debug event; its labels were hidden by the payload policy.'
  }
  /* v8 ignore stop */
}

function traceProjectionMatches(raw: unknown, projected: unknown): boolean {
  if (raw === undefined) {
    return projected === undefined
  }
  const rawRecord = asRecord(raw)
  const projectedRecord = asRecord(projected)
  if (rawRecord === undefined || projectedRecord === undefined) {
    return valueKind(raw) === valueKind(projected)
  }

  return Object.entries(rawRecord).every(([key, rawValue]) => rawValue === undefined
    || (Object.hasOwn(projectedRecord, key) && valueKind(rawValue) === valueKind(projectedRecord[key])))
}

function valueKind(value: unknown): string {
  if (value === null) {
    return 'null'
  }
  return Array.isArray(value) ? 'array' : typeof value
}

function quoted(value: string): string {
  return JSON.stringify(value)
}

function naturalList(values: readonly string[]): string {
  if (values.length === 1) {
    return values[0]!
  }
  if (values.length === 2) {
    return `${values[0]} and ${values[1]}`
  }
  return `${values.slice(0, -1).join(', ')}, and ${values.at(-1)}`
}

function formatInline(value: unknown): string | undefined {
  if (typeof value === 'string') {
    return value === '[Redacted]' ? value : JSON.stringify(value)
  }
  if (typeof value === 'number' || typeof value === 'boolean' || value === null) {
    return String(value)
  }
  if (Array.isArray(value)) {
    if (value.length > 3 || !value.every(item => ['string', 'number', 'boolean'].includes(typeof item) || item === null)) {
      return undefined
    }
    return `[${value.map(item => formatInline(item)).join(', ')}]`
  }
  return undefined
}

function previewRecord(value: unknown, key: string): Record<string, unknown> | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return undefined
  }
  const nested = (value as Record<string, unknown>)[key]
  return nested !== null && typeof nested === 'object' && !Array.isArray(nested)
    ? nested as Record<string, unknown>
    : undefined
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

function recordValue(value: unknown, key: string): unknown {
  return asRecord(value)?.[key]
}

function stringValue(value: unknown, key: string): string | undefined {
  const field = recordValue(value, key)
  return typeof field === 'string' ? field : undefined
}

function stringList(value: unknown, key: string): string[] {
  const field = recordValue(value, key)
  return Array.isArray(field) && field.every(item => typeof item === 'string')
    ? field
    : []
}

function countLabel(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`
}

function clearOnDefaultLabel(decision: ClearOnDefaultDecision): string {
  return decision.key === 'value' && decision.paths.length === 1 ? decision.paths[0]! : decision.key
}

class ConsoleProjection {
  private readonly pendingWrites = new Map<string, PendingWriteSummary>()

  constructor(private readonly options: ConsoleReporterOptions, private readonly limits: NormalizeLimits) {}

  report(event: DebugEvent): void {
    const allowed = filterAllows(this.options.filter, event)
    const excluded = filterExcludes(this.options.filter, event)

    if (this.options.preset === 'summary') {
      this.recordAggregate(event, allowed)
    }

    const pendingTerminal = this.options.preset === 'summary' && this.terminalHasPendingAggregate(event)
    const requiresBindingOrigin = this.options.preset === 'summary'
      && this.filtersByBinding()
      && this.isAggregateTerminal(event)
    const allowedProjection = !excluded
      && (requiresBindingOrigin ? pendingTerminal : allowed || pendingTerminal)
    if (!allowedProjection || !this.visibleInPreset(event)) {
      this.cleanupTerminal(event)
      return
    }

    const rendered = this.options.preset === 'trace'
      ? this.renderTrace(event)
      : this.renderSummary(event)

    /* v8 ignore next -- visibility is derived from the same exhaustive catalog as the renderer */
    if (rendered === undefined) {
      this.cleanupTerminal(event)
      return
    }

    const [method, message, ...args] = rendered
    if (method === 'warn') {
      console.warn(message, ...args)
    }
    else {
      // eslint-disable-next-line no-console -- this module is the opt-in console bridge
      console.log(message, ...args)
    }

    this.cleanupTerminal(event)
  }

  private visibleInPreset(event: DebugEvent): boolean {
    if (this.options.preset === 'trace') {
      return true
    }

    const reference = DEBUG_EVENT_CATALOG[event.code as DebugEventCode]
    if (reference === undefined) {
      return false
    }

    if (event.code === 'storage:restore') {
      const outcome = (event.data as DebugEventMap['storage:restore']).outcome
      return outcome === 'restored' || outcome === 'url-won'
    }

    return reference.summary === 'visible'
      || reference.summary === 'conditional'
      || reference.summary === 'passthrough'
  }

  private projectEvent(event: DebugEvent, data: unknown = event.data): ProjectedEvent {
    const rawDetails = eventDetails(event, data)
    const projected = this.options.payload === 'full'
      ? rawDetails
      : createDebugPreview({ ...event, data: rawDetails }, this.limits, this.options.redact)

    return {
      details: this.options.payload === 'hidden' ? undefined : projected,
      data: recordValue(projected, 'data'),
    }
  }

  private renderTrace(event: DebugEvent): Rendered {
    const projection = this.projectEvent(event)
    return this.withPayload(event, `[vuqs trace] ${event.code} — ${traceProse(event, projection.data)}`, projection.details)
  }

  private renderSummary(event: DebugEvent): Rendered | undefined {
    if (event.code === 'adapter:commit' && (event.data as DebugEventMap['adapter:commit']).source === 'write') {
      return this.renderCommittedWrite(event, event.data as DebugEventMap['adapter:commit'])
    }
    if (event.code === 'adapter:error') {
      return this.renderAdapterError(event, event.data as DebugEventMap['adapter:error'])
    }
    if (event.code === 'module:log' || event.code === 'module:warn') {
      const payload = projectedPayload(event, event.data, this.options, this.limits) as DebugEventMap['module:log'] | undefined
      const raw = event.data as DebugEventMap['module:log']
      return [event.level === 'warn' ? 'warn' : 'log', `[vuqs ${raw.namespace}] ${raw.message}`, ...(payload?.values ?? [])]
    }

    const projection = this.projectEvent(event)

    switch (event.code) {
      case 'engine:parse-miss': {
        const path = stringValue(projection.data, 'path')
        const target = path === undefined ? 'a query parameter' : quoted(path)
        return this.withPayload(event, `[vuqs] Ignored an invalid URL value for ${target} because it could not be decoded.`, projection.details)
      }
      case 'adapter:commit': {
        const paths = stringList(projection.data, 'paths')
        const suffix = paths.length === 0
          ? '.'
          : `; synchronized ${formatDebugLabelList(paths, 3, (event.data as DebugEventMap['adapter:commit']).paths)}.`
        return this.withPayload(event, `[vuqs] The URL changed outside vuqs${suffix}`, projection.details)
      }
      case 'rd:set':
        return this.renderRuntimeDefaults(event, projection)
      case 'rd:clear':
        return this.withPayload(event, '[vuqs] Cleared the runtime defaults.', projection.details)
      case 'rd:reset': {
        const context = stringValue(projection.data, 'context')
        const suffix = context === undefined ? 'changed.' : `changed to ${quoted(context)}.`
        return this.withPayload(event, `[vuqs] Cleared the runtime defaults after the query context ${suffix}`, projection.details)
      }
      case 'ctx:change': {
        const context = stringValue(projection.data, 'context')
        const invalidPaths = stringList(projection.data, 'invalid')
        const contextLabel = context === undefined ? '' : ` to ${quoted(context)}`
        const invalid = invalidPaths.length === 0
          ? '.'
          : `; ${formatDebugLabelList(invalidPaths, 3, (event.data as DebugEventMap['ctx:change']).invalid)} ${(event.data as DebugEventMap['ctx:change']).invalid.length === 1 ? 'is' : 'are'} no longer valid.`
        return this.withPayload(event, `[vuqs] Changed the query context${contextLabel}${invalid}`, projection.details)
      }
      case 'storage:restore': {
        const data = event.data as DebugEventMap['storage:restore']
        const key = stringValue(projection.data, 'key')
        const storedState = key === undefined ? 'storage' : quoted(key)
        const message = data.outcome === 'restored'
          ? `[vuqs] Applied saved query state from ${storedState}.`
          : `[vuqs] Kept the current URL instead of restoring ${storedState} because the URL already contains query state.`
        return this.withPayload(event, message, projection.details)
      }
      case 'storage:error':
        return this.renderStorageError(event, event.data as DebugEventMap['storage:error'], projection)
      /* v8 ignore next -- every summary-visible catalog code is handled above */
      default:
        return undefined
    }
  }

  private renderCommittedWrite(event: DebugEvent, commit: DebugEventMap['adapter:commit']): Rendered | undefined {
    const pending = this.consumePending(event.context)
    const visiblePaths = this.visiblePaths(pending?.flush?.paths ?? commit.paths, pending)
    const flush = pending?.flush === undefined
      ? undefined
      : this.projectFlush(pending.flush, visiblePaths)
    const clearOnDefault = pending?.clearOnDefault ?? []
    if (flush === undefined) {
      const visibleCommit = {
        ...commit,
        paths: visiblePaths,
        query: this.projectQuery(commit.query, visiblePaths),
      }
      const projection = this.projectEvent(event, visibleCommit)
      const projectedPaths = stringList(projection.data, 'paths')
      const message = projectedPaths.length === 0
        ? '[vuqs] Updated the URL.'
        : `[vuqs] Updated ${formatDebugLabelList(projectedPaths, 3, visiblePaths)} in the URL.`
      return this.withPayload(event, message, projection.details)
    }

    if (flush.paths.length === 0) {
      return undefined
    }

    const changes: Record<string, unknown> = {}
    for (const path of flush.paths) {
      const value = getPath(flush.query, path)
      Object.defineProperty(changes, path, {
        value: value === undefined ? REMOVED : value,
        enumerable: true,
        writable: true,
        configurable: true,
      })
    }
    const defaults: Record<string, unknown> = {}
    for (const decision of clearOnDefault) {
      Object.defineProperty(defaults, clearOnDefaultLabel(decision), {
        value: decision.defaultValue,
        enumerable: true,
        writable: true,
        configurable: true,
      })
    }
    const rawDetails: WriteSummaryDetails = {
      changes,
      query: flush.query,
      navigation: flush.options,
      defaults,
    }
    const projection = this.projectEvent(event, rawDetails)
    const message = this.committedWriteMessage(
      flush,
      clearOnDefault,
      projection.data,
      this.options.payload !== 'hidden',
    )
    return this.withPayload(event, `[vuqs] ${message}`, projection.details)
  }

  private committedWriteMessage(
    flush: DebugEventMap['gtq:flush'],
    defaults: readonly ClearOnDefaultDecision[],
    projectedData: unknown,
    showValues: boolean,
  ): string {
    const previewChanges = previewRecord(projectedData, 'changes')
    const previewDefaults = previewRecord(projectedData, 'defaults')
    const changes = flush.paths.map((path) => {
      const raw = getPath(flush.query, path)
      const visible = previewChanges !== undefined && Object.hasOwn(previewChanges, path)
      const display = visible && showValues ? previewChanges[path] : undefined
      return { path, visible, removed: raw === undefined, display }
    })
    const pushed = flush.options.history === 'push'
    const historySuffix = pushed ? ' and added a browser history entry' : ''

    if (defaults.length === 1 && changes.every(change => change.removed && defaults[0]!.paths.includes(change.path))) {
      const decision = defaults[0]!
      const label = clearOnDefaultLabel(decision)
      const defaultValue = showValues ? formatInline(previewDefaults?.[label]) : undefined
      const visibleLabel = previewDefaults !== undefined && Object.hasOwn(previewDefaults, label)
      const historySentence = pushed ? ' Added a browser history entry.' : ''
      if (!visibleLabel) {
        return `A query parameter now uses its default value, so it is not included in the URL.${historySentence}`
      }
      const target = quoted(label)
      const value = defaultValue === undefined ? '' : ` (${defaultValue})`
      return `${target} now uses its default value${value}, so the URL does not need a ${target} parameter.${historySentence}`
    }

    if (changes.length === 1) {
      const change = changes[0]!
      if (change.removed) {
        const target = change.visible ? quoted(change.path) : 'a URL parameter'
        return `Removed ${target} from the URL${historySuffix}.`
      }
      const value = formatInline(change.display)
      if (!change.visible) {
        return `Updated the URL${historySuffix}.`
      }
      if (value === undefined) {
        return `Updated the URL parameter ${quoted(change.path)}${historySuffix}.`
      }
      return pushed
        ? `Updated the URL and added a browser history entry: ${quoted(change.path)} = ${value}.`
        : `Updated the URL: ${quoted(change.path)} = ${value}.`
    }

    const names = changes.filter(change => change.visible).map(change => quoted(change.path))
    if (names.length === 0) {
      return `Updated ${countLabel(changes.length, 'URL parameter')} in one navigation${historySuffix}.`
    }
    if (changes.length > 3 || names.length !== changes.length) {
      const visible = names.slice(0, 3)
      const omitted = changes.length - visible.length
      const list = `${visible.join(', ')}, and ${countLabel(omitted, 'more parameter')}`
      return `Updated ${countLabel(changes.length, 'URL parameter')} in one navigation${historySuffix}: ${list}.`
    }

    if (!showValues) {
      return `Updated ${countLabel(changes.length, 'URL parameter')} in one navigation${historySuffix}: ${naturalList(names)}.`
    }

    const clauses = changes.map((change) => {
      if (change.removed) {
        return `removed ${quoted(change.path)}`
      }
      const value = formatInline(change.display)
      return value === undefined ? `updated ${quoted(change.path)}` : `${quoted(change.path)} = ${value}`
    })
    return `Updated ${countLabel(changes.length, 'URL parameter')} in one navigation${historySuffix}: ${naturalList(clauses)}.`
  }

  private renderAdapterError(event: DebugEvent, data: DebugEventMap['adapter:error']): Rendered {
    const pending = this.consumePending(event.context)
    const rolledBack = this.visiblePaths(data.rolledBack ?? [], pending)
    const projection = this.projectEvent(event, { ...data, rolledBack })
    const adapter = stringValue(projection.data, 'adapter')
    const rollbackPaths = stringList(projection.data, 'rolledBack')
    const message = rolledBack.length === 0
      ? adapter === undefined
        ? '[vuqs] The query adapter could not update the URL.'
        : `[vuqs] The ${quoted(adapter)} adapter could not update the URL.`
      : rollbackPaths.length === rolledBack.length
        ? `[vuqs] Could not update the URL; restored the previous ${rollbackPaths.length === 1 ? 'value' : 'values'} of ${formatDebugLabelList(rollbackPaths, 3, rolledBack)}.`
        : `[vuqs] Could not update the URL; restored ${countLabel(rolledBack.length, 'previous value')}.`
    return this.withPayload(event, message, projection.details)
  }

  private renderRuntimeDefaults(event: DebugEvent, projection: ProjectedEvent): Rendered {
    const previewDefaults = previewRecord(projection.data, 'defaults')
    if (previewDefaults === undefined) {
      return this.withPayload(event, '[vuqs] Updated the runtime defaults.', projection.details)
    }

    const rawDefaults = (event.data as DebugEventMap['rd:set']).defaults
    const rawKeys = Object.keys(rawDefaults)
    const keys = projectedDebugObjectKeys(previewDefaults, rawDefaults)
    if (rawKeys.length === 0) {
      return this.withPayload(event, '[vuqs] Set an empty runtime-default layer.', projection.details)
    }

    const clauses = keys.slice(0, 3).map((key) => {
      const value = formatInline(previewDefaults?.[key])
      return value === undefined ? quoted(key) : `${quoted(key)} = ${value}`
    })
    const omitted = rawKeys.length - clauses.length
    const values = clauses.length === 0
      ? undefined
      : omitted === 0
        ? naturalList(clauses)
        : `${clauses.join(', ')}, and ${countLabel(omitted, 'more default')}`
    const message = values === undefined
      ? `[vuqs] Set ${countLabel(rawKeys.length, 'runtime default')}.`
      : rawKeys.length === 1
        ? `[vuqs] Set the runtime default: ${values}.`
        : `[vuqs] Set ${countLabel(rawKeys.length, 'runtime default')}: ${values}.`
    return this.withPayload(event, message, projection.details)
  }

  private renderStorageError(event: DebugEvent, data: DebugEventMap['storage:error'], projection: ProjectedEvent): Rendered {
    const key = stringValue(projection.data, 'key')
    const target = key === undefined ? 'query state' : quoted(key)
    const messages: Record<DebugEventMap['storage:error']['operation'], string> = {
      save: `Could not save ${target} to storage.`,
      remove: `Could not remove ${target} from storage.`,
      serialize: `Could not prepare ${target} for storage.`,
      load: `Could not load ${target} from storage.`,
      snapshot: `Ignored invalid stored query state for ${target}.`,
      restore: `Could not restore ${target} from storage.`,
    }
    return this.withPayload(event, `[vuqs] ${messages[data.operation]}`, projection.details)
  }

  private withPayload(event: DebugEvent, message: string, payload: unknown): Rendered {
    const method = event.level === 'warn' ? 'warn' : 'log'
    return payload === undefined ? [method, message] : [method, message, payload]
  }

  private recordAggregate(event: DebugEvent, allowed: boolean): void {
    const key = this.pendingKey(event.context)
    if (key === undefined) {
      return
    }

    if (event.code === 'binding:set') {
      if (!allowed) {
        return
      }
      const pending = this.pending(key)
      const data = event.data as DebugEventMap['binding:set']
      pending.unrestricted ||= !this.filtersByBinding()
      for (const path of data.touchedPaths) {
        pending.includedPaths.add(path)
      }
    }
    else if (event.code === 'engine:clear-on-default') {
      if (!allowed) {
        return
      }
      const data = event.data as DebugEventMap['engine:clear-on-default']
      const pending = this.pending(key)
      pending.unrestricted ||= !this.filtersByBinding()
      pending.clearOnDefault.push({
        key: data.key,
        paths: data.paths,
        defaultValue: data.defaultValue,
      })
      for (const path of data.paths) {
        pending.includedPaths.add(path)
      }
    }
    else if (event.code === 'gtq:flush') {
      const pending = this.pendingWrites.get(key)
      if (pending === undefined && (!allowed || this.filtersByBinding())) {
        return
      }
      const target = pending ?? this.pending(key)
      target.flush = event.data as DebugEventMap['gtq:flush']
      if (allowed && !this.filtersByBinding()) {
        target.unrestricted = true
      }
    }
  }

  private pending(key: string): PendingWriteSummary {
    let pending = this.pendingWrites.get(key)
    if (pending === undefined) {
      pending = { clearOnDefault: [], includedPaths: new Set(), unrestricted: false }
      this.pendingWrites.set(key, pending)
    }
    return pending
  }

  private consumePending(context: DebugContext | undefined): PendingWriteSummary | undefined {
    const key = this.pendingKey(context)
    if (key === undefined) {
      return undefined
    }
    const pending = this.pendingWrites.get(key)
    this.pendingWrites.delete(key)
    return pending
  }

  private terminalHasPendingAggregate(event: DebugEvent): boolean {
    const key = this.isAggregateTerminal(event) ? this.pendingKey(event.context) : undefined
    return key !== undefined && this.pendingWrites.has(key)
  }

  private isAggregateTerminal(event: DebugEvent): boolean {
    return event.code === 'adapter:error'
      || (event.code === 'adapter:commit' && (event.data as DebugEventMap['adapter:commit']).source === 'write')
  }

  private cleanupTerminal(event: DebugEvent): void {
    if (event.code === 'adapter:error') {
      this.consumePending(event.context)
      return
    }
    if (event.code === 'adapter:commit' && (event.data as DebugEventMap['adapter:commit']).source === 'write') {
      this.consumePending(event.context)
      return
    }
    if (event.code === 'gtq:reset') {
      const runtime = event.context?.runtimeId ?? 'global'
      for (const key of this.pendingWrites.keys()) {
        if (key.startsWith(`${runtime}:`)) {
          this.pendingWrites.delete(key)
        }
      }
    }
  }

  private pendingKey(context: DebugContext | undefined): string | undefined {
    return context?.batchId === undefined
      ? undefined
      : `${context.runtimeId ?? 'global'}:${context.batchId}`
  }

  private filtersByBinding(): boolean {
    return this.options.filter?.include?.bindingIds !== undefined
      || this.options.filter?.exclude?.bindingIds !== undefined
  }

  private visiblePaths(paths: readonly string[], pending: PendingWriteSummary | undefined): string[] {
    if (pending === undefined || pending.unrestricted) {
      return [...paths]
    }
    return paths.filter(path => pending.includedPaths.has(path))
  }

  private projectFlush(flush: DebugEventMap['gtq:flush'], paths: readonly string[]): DebugEventMap['gtq:flush'] {
    if (paths.length === flush.paths.length && paths.every((path, index) => path === flush.paths[index])) {
      return flush
    }

    return { ...flush, paths: [...paths], query: this.projectQuery(flush.query, paths) }
  }

  private projectQuery(source: ParsedQuery, paths: readonly string[]): ParsedQuery {
    const query: ParsedQuery = {}
    for (const path of paths) {
      const value = getPath(source, path)
      if (value !== undefined) {
        setPath(query, path, value)
      }
    }
    return query
  }
}

/** Creates the human-facing projection of the structured debug stream. */
export function createConsoleReporter(options: ConsoleReporterOptions = {}): Reporter {
  const resolved: ConsoleReporterOptions = {
    ...options,
    preset: options.preset ?? 'summary',
    payload: options.payload ?? 'preview',
  }
  const projection = new ConsoleProjection(resolved, resolvePreviewLimits(options.previewLimits))
  return event => projection.report(event)
}
