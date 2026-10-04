import type { ParsedQueryValue } from '../query/types'

/**
 * One pending write for a single query path: a raw value to set, or `null` to
 * remove the path from the URL.
 */
export type OverlayDelta = ParsedQueryValue | null

/**
 * The optimistic overlay: raw pending writes keyed by query path.
 */
export type Overlay = Record<string, OverlayDelta>
