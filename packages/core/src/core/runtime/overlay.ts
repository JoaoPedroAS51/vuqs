import type { ParsedQuery, ParsedQueryRaw, ParsedQueryValue } from '../query/types'
import { cloneQuery } from '../query/object'
import { deletePath, pruneEmptyAncestors, setPath } from '../query/path'

/**
 * One pending write for a single query path: a raw value to set, or `null` to
 * remove the path from the URL.
 */
export type OverlayDelta = ParsedQueryValue | null

/**
 * The optimistic overlay: raw pending writes keyed by query path.
 */
export type Overlay = Record<string, OverlayDelta>

/**
 * Applies path deltas to a query.
 *
 * A `null` delta removes its path and prunes the ancestors the removal empties.
 *
 * @param query - The query to start from; it is not mutated.
 * @param deltas - The path changes to apply.
 * @returns A new query with the deltas applied.
 */
export function applyOverlay(query: ParsedQuery, deltas: Readonly<Overlay>): ParsedQueryRaw {
  const next = cloneQuery(query)

  for (const path of Object.keys(deltas)) {
    const delta = deltas[path]

    if (delta === null) {
      deletePath(next, path)
      pruneEmptyAncestors(next, path)
    }
    else {
      setPath(next, path, delta)
    }
  }

  return next
}
