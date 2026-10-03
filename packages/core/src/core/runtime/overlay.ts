import type { ParsedQueryValue } from '../query/types'

/**
 * One pending write for a single query path: a raw value to set, or `null` to
 * remove the path from the URL.
 */
export type OverlayDelta = ParsedQueryValue | null

/**
 * The optimistic overlay: raw pending writes keyed by query path.
 *
 * @remarks
 * A path present here overrides the committed query until its navigation attempt
 * completes. Values are raw (already serialized), so the overlay is the one
 * namespace every engine shares regardless of its schema or codecs.
 */
export type Overlay = Record<string, OverlayDelta>
