import { isRef, toRaw } from 'vue'

/**
 * Bounds applied when turning a live payload into a history record.
 *
 * @remarks
 * The buffer retains events across time, so it must never hold a live reference, a
 * reactive proxy, a cycle, or an unbounded graph. These limits cap the work and the
 * memory a single retained event can cost, including a total-node budget so a wide or
 * deep graph cannot make the synchronous pre-dispatch normalization stall the app.
 */
export interface NormalizeLimits {
  /** Deepest object/array level walked before the value is replaced with a marker. */
  maxDepth: number
  /** Most own keys kept per object; the rest are summarized. */
  maxProps: number
  /** Most items kept per array/Map/Set; the rest are summarized. */
  maxItems: number
  /** Longest string kept verbatim; longer strings are truncated with an ellipsis. */
  maxStringLength: number
  /** Most values visited across the whole graph before the walk stops descending. */
  maxNodes: number
}

/**
 * Default bounds for a retained debug payload.
 */
export const DEFAULT_NORMALIZE_LIMITS: NormalizeLimits = {
  maxDepth: 6,
  maxProps: 64,
  maxItems: 128,
  maxStringLength: 4096,
  maxNodes: 4096,
}

interface Budget {
  remaining: number
}

/**
 * Produces a plain, bounded, cycle-free snapshot of a payload for the history buffer.
 *
 * @remarks
 * Vue refs and reactive proxies are unwrapped to raw data, `Error` is reduced to its
 * reportable fields, functions and symbols are dropped, and cycles and oversized
 * graphs are summarized. The result holds no live reference, so a later mutation of
 * the source cannot change a retained record. This never uses `structuredClone`,
 * which cannot clone reactive proxies.
 */
export function normalizeForHistory(value: unknown, limits: NormalizeLimits = DEFAULT_NORMALIZE_LIMITS): unknown {
  return walk(value, limits, 0, new WeakSet<object>(), { remaining: limits.maxNodes })
}

/**
 * Recursively freezes a normalized value so a retained record cannot be mutated in place.
 *
 * @remarks
 * A history record is stored once and delivered to every replay reporter (and shared by
 * the local and global buffers), so a mutable payload would allow one reporter to corrupt
 * what the next one replays. Only ever applied to {@link normalizeForHistory} output,
 * which is already bounded and cycle-free, so the recursion terminates; the `isFrozen`
 * short-circuit also avoids re-walking a shared, already-frozen subgraph.
 */
export function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) {
    return value
  }

  Object.freeze(value)

  for (const key of Object.keys(value)) {
    deepFreeze((value as Record<string, unknown>)[key])
  }

  return value
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text
}

function walk(value: unknown, limits: NormalizeLimits, depth: number, seen: WeakSet<object>, budget: Budget): unknown {
  if (budget.remaining <= 0) {
    return '[Budget]'
  }

  budget.remaining--

  if (value === null) {
    return null
  }

  switch (typeof value) {
    case 'string':
      return truncate(value, limits.maxStringLength)
    case 'number':
    case 'boolean':
    case 'bigint':
    case 'undefined':
      return value
    // Functions and symbols carry no reportable data and are not serializable; drop them.
    case 'function':
    case 'symbol':
      return undefined
  }

  if (isRef(value)) {
    return walk(value.value, limits, depth, seen, budget)
  }

  const raw = toRaw(value as object)

  if (raw instanceof Error) {
    return {
      name: raw.name,
      message: truncate(raw.message, limits.maxStringLength),
      stack: raw.stack === undefined ? undefined : truncate(raw.stack, limits.maxStringLength),
    }
  }

  if (raw instanceof Date) {
    return Number.isNaN(raw.valueOf()) ? 'Invalid Date' : raw.toISOString()
  }

  if (raw instanceof RegExp) {
    return truncate(raw.toString(), limits.maxStringLength)
  }

  if (depth >= limits.maxDepth) {
    return '[MaxDepth]'
  }

  if (seen.has(raw)) {
    return '[Circular]'
  }

  seen.add(raw)

  try {
    if (Array.isArray(raw)) {
      return walkList(raw, raw.length, limits, depth, seen, budget)
    }

    if (raw instanceof Map) {
      return { '[Map]': walkPairs(raw, raw.size, limits, depth, seen, budget) }
    }

    if (raw instanceof Set) {
      return { '[Set]': walkList(raw, raw.size, limits, depth, seen, budget) }
    }

    return walkObject(raw as Record<string, unknown>, limits, depth, seen, budget)
  }
  finally {
    seen.delete(raw)
  }
}

// Walks at most `maxItems` entries of any iterable without materializing all of it.
function walkList(items: Iterable<unknown>, total: number, limits: NormalizeLimits, depth: number, seen: WeakSet<object>, budget: Budget): unknown[] {
  const out: unknown[] = []
  let index = 0

  for (const item of items) {
    if (index >= limits.maxItems) {
      break
    }

    out.push(walk(item, limits, depth + 1, seen, budget))
    index++
  }

  if (total > limits.maxItems) {
    out.push(`[+${total - limits.maxItems} more]`)
  }

  return out
}

function walkPairs(entries: Iterable<[unknown, unknown]>, total: number, limits: NormalizeLimits, depth: number, seen: WeakSet<object>, budget: Budget): unknown[] {
  const out: unknown[] = []
  let index = 0

  for (const [key, val] of entries) {
    if (index >= limits.maxItems) {
      break
    }

    out.push([walk(key, limits, depth + 1, seen, budget), walk(val, limits, depth + 1, seen, budget)])
    index++
  }

  if (total > limits.maxItems) {
    out.push(`[+${total - limits.maxItems} more]`)
  }

  return out
}

function walkObject(source: Record<string, unknown>, limits: NormalizeLimits, depth: number, seen: WeakSet<object>, budget: Budget): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  let kept = 0
  let truncated = false

  // Iterate lazily and stop at the limit rather than materializing the full key list, so
  // an object with an enormous number of keys cannot make this synchronous walk stall.
  for (const key in source) {
    // Count every key the engine yields, inherited ones included, against the node
    // budget and bail before the ownership check, so a huge prototype chain cannot make
    // this loop run unbounded skipping inherited keys.
    if (budget.remaining <= 0) {
      truncated = true
      break
    }
    budget.remaining--

    if (!Object.hasOwn(source, key)) {
      continue
    }

    if (kept >= limits.maxProps) {
      truncated = true
      break
    }

    // Catch getter failures so history retention continues with an unreadable marker.
    let normalized: unknown
    try {
      normalized = walk(source[key], limits, depth + 1, seen, budget)
    }
    catch {
      normalized = '[Unreadable]'
    }

    if (normalized !== undefined) {
      // Define the property rather than assign: a `__proto__` own key must remain data
      // instead of changing the output prototype.
      Object.defineProperty(out, key, { value: normalized, enumerable: true, configurable: true, writable: true })
      kept++
    }
  }

  if (truncated) {
    out['…'] = '[truncated]'
  }

  return out
}
