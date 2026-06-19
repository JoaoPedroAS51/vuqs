import type { DebugEvent } from '../core/debug/bus'
import type { NormalizeLimits } from '../core/debug/normalize'
import { DEFAULT_NORMALIZE_LIMITS, normalizeForHistory } from '../core/debug/normalize'

export type DebugRedactor = (preview: unknown, event: DebugEvent) => unknown

const SENSITIVE_KEYS = new Set([
  'authorization',
  'cookie',
  'password',
  'passwd',
  'secret',
  'token',
  'accesstoken',
  'refreshtoken',
  'apikey',
  'session',
])

/** Returns whether a key or dot-path segment is covered by the built-in preview denylist. */
export function isSensitiveDebugKey(key: string): boolean {
  return key.split(/[.[\]]/).some((segment) => {
    const canonicalKey = segment.toLowerCase().replace(/[^a-z0-9]/g, '')
    return canonicalKey !== '' && SENSITIVE_KEYS.has(canonicalKey)
  })
}

export function resolvePreviewLimits(partial: Partial<NormalizeLimits> | undefined): NormalizeLimits {
  const merged = { ...DEFAULT_NORMALIZE_LIMITS, ...partial }

  return {
    maxDepth: positiveInteger(merged.maxDepth),
    maxProps: positiveInteger(merged.maxProps),
    maxItems: positiveInteger(merged.maxItems),
    maxStringLength: positiveInteger(merged.maxStringLength),
    maxNodes: positiveInteger(merged.maxNodes),
  }
}

export function createDebugPreview(event: DebugEvent, limits: NormalizeLimits, redact?: DebugRedactor): unknown {
  try {
    let preview = applyBuiltInRedaction(normalizeForHistory(event.data, limits), event)
    if (redact !== undefined) {
      // Normalize and apply the built-in pass again: a custom hook cannot accidentally
      // reintroduce a live proxy, an unbounded graph, or a known sensitive key.
      preview = applyBuiltInRedaction(normalizeForHistory(redact(preview, event), limits), event)
    }
    return preview
  }
  catch {
    // Redaction is a safety boundary: failure must never fall back to raw data.
    return '[Preview unavailable]'
  }
}

function applyBuiltInRedaction(value: unknown, event: DebugEvent): unknown {
  const preview = redactKnownKeys(value)
  if (event.code !== 'engine:parse-miss' || preview === null || typeof preview !== 'object' || Array.isArray(preview)) {
    return preview
  }

  const record = preview as Record<string, unknown>
  redactParseMissValue(record)
  if (record.data !== null && typeof record.data === 'object' && !Array.isArray(record.data)) {
    redactParseMissValue(record.data as Record<string, unknown>)
  }
  return record
}

function redactParseMissValue(record: Record<string, unknown>): void {
  if (typeof record.path !== 'string' || !isSensitiveDebugKey(record.path) || !Object.hasOwn(record, 'raw')) {
    return
  }

  Object.defineProperty(record, 'raw', {
    value: '[Redacted]',
    enumerable: true,
    writable: true,
    configurable: true,
  })
}

function positiveInteger(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0
}

function redactKnownKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(redactKnownKeys)
  }

  if (value === null || typeof value !== 'object') {
    return value
  }

  const redacted: Record<string, unknown> = {}
  for (const [key, child] of Object.entries(value)) {
    Object.defineProperty(redacted, key, {
      value: isSensitiveDebugKey(key) ? '[Redacted]' : redactKnownKeys(child),
      enumerable: true,
      writable: true,
      configurable: true,
    })
  }
  return redacted
}
