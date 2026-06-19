import type { DebugLevel } from '../core/debug/bus'
import type { DebugEventCode, DebugScope } from '../core/debug/events'
import type { ConsoleDebugPreset } from './console-reporter'
import { DEBUG_EVENT_ENTRIES } from './event-catalog'

/** Browser storage key read by the opt-in debug entry. */
export const VUQS_DEBUG_STORAGE_KEY = 'vuqs:debug'
/** Current schema version for the persisted browser debug configuration. */
export const VUQS_DEBUG_CONFIG_VERSION = 1

/** Safe payload projections accepted in persistent browser configuration. */
export type StoredDebugPayloadMode = 'preview' | 'hidden'

/** Stable selector dimensions that remain meaningful across page reloads. */
export interface StoredDebugEventSelector {
  /** Event levels to include or exclude. */
  levels?: readonly DebugLevel[]
  /** Event scopes to include or exclude. */
  scopes?: readonly DebugScope[]
  /** Exact event codes to include or exclude. */
  codes?: readonly DebugEventCode[]
}

/** Persisted include/exclude selectors for the console projection. */
export interface StoredDebugEventFilter {
  /** Events must match every provided selector dimension. */
  include?: StoredDebugEventSelector
  /** Matching events are removed after inclusion. */
  exclude?: StoredDebugEventSelector
}

/** Serializable safe subset of the console reporter options. */
export interface StoredConsoleReporterOptions {
  /** Human summary or complete event trace. */
  preset?: ConsoleDebugPreset
  /** Bounded preview or prose without payload details. */
  payload?: StoredDebugPayloadMode
  /** Stable event selectors applied before projection work. */
  filter?: StoredDebugEventFilter
}

/** Persistent configuration for the official browser console projection. */
export interface StoredConsoleDebugConfig extends StoredConsoleReporterOptions {
  /** Installs or suppresses the console reporter while retaining its settings. */
  enabled: boolean
}

/** Versioned browser-only bootstrap configuration stored under `vuqs:debug`. */
export interface StoredDebugConfigV1 {
  /** Persisted-config schema version, independent of `DEBUG_PROTOCOL_VERSION`. */
  version: typeof VUQS_DEBUG_CONFIG_VERSION
  /** Browser console projection; absence leaves it disabled. */
  console?: StoredConsoleDebugConfig
}

/** Result of reading and validating the persistent browser configuration. */
export type StoredConsoleDebugResolution
  = { readonly status: 'absent' | 'unavailable' | 'disabled' }
    | { readonly status: 'enabled', readonly options: StoredConsoleReporterOptions }
    | { readonly status: 'invalid', readonly message: string }

const ROOT_KEYS = new Set(['version', 'console'])
const CONSOLE_KEYS = new Set(['enabled', 'preset', 'payload', 'filter'])
const FILTER_KEYS = new Set(['include', 'exclude'])
const SELECTOR_KEYS = new Set(['levels', 'scopes', 'codes'])
const LEVELS = new Set<string>(['debug', 'warn'])
const CODES = new Set<string>(DEBUG_EVENT_ENTRIES.map(([code]) => code))
const SCOPES = new Set<string>(DEBUG_EVENT_ENTRIES.map(([code]) => code.slice(0, code.indexOf(':'))))

/**
 * Parses a persisted config without reading or writing browser storage.
 *
 * @internal
 */
export function parseStoredDebugConfig(raw: string): StoredConsoleDebugResolution {
  let value: unknown
  try {
    value = JSON.parse(raw)
  }
  catch {
    return invalid('the stored value must be valid JSON')
  }

  try {
    const root = strictRecord(value, ROOT_KEYS, 'configuration')
    if (root.version !== VUQS_DEBUG_CONFIG_VERSION) {
      fail(`version must be ${VUQS_DEBUG_CONFIG_VERSION}`)
    }
    if (root.console === undefined) {
      return { status: 'disabled' }
    }

    const consoleConfig = strictRecord(root.console, CONSOLE_KEYS, 'console')
    if (typeof consoleConfig.enabled !== 'boolean') {
      fail('console.enabled must be a boolean')
    }

    const options: StoredConsoleReporterOptions = {}
    if (consoleConfig.preset !== undefined) {
      if (consoleConfig.preset !== 'summary' && consoleConfig.preset !== 'trace') {
        fail('console.preset must be "summary" or "trace"')
      }
      options.preset = consoleConfig.preset
    }
    if (consoleConfig.payload !== undefined) {
      if (consoleConfig.payload !== 'preview' && consoleConfig.payload !== 'hidden') {
        fail('console.payload must be "preview" or "hidden"')
      }
      options.payload = consoleConfig.payload
    }
    if (consoleConfig.filter !== undefined) {
      options.filter = parseFilter(consoleConfig.filter)
    }

    return consoleConfig.enabled ? { status: 'enabled', options } : { status: 'disabled' }
  }
  catch (error) {
    return invalid((error as Error).message)
  }
}

/** Reads the versioned browser config once without mutating storage. */
export function readStoredConsoleDebugConfig(): StoredConsoleDebugResolution {
  if (typeof window === 'undefined') {
    return { status: 'unavailable' }
  }

  try {
    if (typeof localStorage === 'undefined') {
      return { status: 'unavailable' }
    }
    const raw = localStorage.getItem(VUQS_DEBUG_STORAGE_KEY)
    return raw === null ? { status: 'absent' } : parseStoredDebugConfig(raw)
  }
  catch {
    return { status: 'unavailable' }
  }
}

function parseFilter(value: unknown): StoredDebugEventFilter {
  const filter = strictRecord(value, FILTER_KEYS, 'console.filter')
  return {
    ...(filter.include === undefined ? {} : { include: parseSelector(filter.include, 'console.filter.include') }),
    ...(filter.exclude === undefined ? {} : { exclude: parseSelector(filter.exclude, 'console.filter.exclude') }),
  }
}

function parseSelector(value: unknown, path: string): StoredDebugEventSelector {
  const selector = strictRecord(value, SELECTOR_KEYS, path)
  return {
    ...(selector.levels === undefined ? {} : { levels: parseStringArray(selector.levels, LEVELS, `${path}.levels`) as DebugLevel[] }),
    ...(selector.scopes === undefined ? {} : { scopes: parseStringArray(selector.scopes, SCOPES, `${path}.scopes`) as DebugScope[] }),
    ...(selector.codes === undefined ? {} : { codes: parseStringArray(selector.codes, CODES, `${path}.codes`) as DebugEventCode[] }),
  }
}

function parseStringArray(value: unknown, allowed: ReadonlySet<string>, path: string): string[] {
  if (!Array.isArray(value)) {
    fail(`${path} must be an array`)
  }
  if (!value.every(item => typeof item === 'string' && allowed.has(item))) {
    fail(`${path} contains an unsupported value`)
  }
  return [...value]
}

function strictRecord(value: unknown, allowedKeys: ReadonlySet<string>, path: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    fail(`${path} must be an object`)
  }
  if (Object.keys(value).some(key => !allowedKeys.has(key))) {
    fail(`${path} contains an unsupported property`)
  }
  return value as Record<string, unknown>
}

function fail(message: string): never {
  throw new Error(message)
}

function invalid(reason: string): StoredConsoleDebugResolution {
  return {
    status: 'invalid',
    message: `[vuqs] Ignored invalid "${VUQS_DEBUG_STORAGE_KEY}" configuration: ${reason}.`,
  }
}
