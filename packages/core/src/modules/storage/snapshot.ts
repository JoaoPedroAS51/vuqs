import type { ParsedQueryRaw } from '../../core/query/types'

/** The versioned raw-query envelope persisted by {@link withStorage}. */
export interface StoredQuerySnapshot {
  /** Snapshot format version owned by vuqs. */
  format: 1
  /** Optional application version used to invalidate incompatible snapshots. */
  version?: string
  /** Unix timestamp in milliseconds for diagnostics and future policies. */
  savedAt: number
  /** Explicit selected state encoded through the schema params. */
  query: ParsedQueryRaw
}

export type SnapshotResult
  = | { snapshot: StoredQuerySnapshot, error?: never }
    | { snapshot?: never, error: Error }

export function validateSnapshot(value: unknown, version: string | undefined): SnapshotResult {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return { error: new Error('[vuqs] withStorage: stored snapshot is invalid') }
  }

  const snapshot = value as Partial<StoredQuerySnapshot>

  if (
    snapshot.format !== 1
    || typeof snapshot.savedAt !== 'number'
    || !Number.isFinite(snapshot.savedAt)
    || typeof snapshot.query !== 'object'
    || snapshot.query === null
    || Array.isArray(snapshot.query)
    || (snapshot.version !== undefined && typeof snapshot.version !== 'string')
  ) {
    return { error: new Error('[vuqs] withStorage: stored snapshot is invalid') }
  }

  if (version !== undefined && snapshot.version !== version) {
    return { error: new Error('[vuqs] withStorage: stored snapshot version is incompatible') }
  }

  return { snapshot: snapshot as StoredQuerySnapshot }
}
