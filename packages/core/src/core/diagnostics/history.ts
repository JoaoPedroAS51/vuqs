export const DEFAULT_HISTORY_LIMIT = 200

// Hard ceiling so a lease of `Infinity` (or an absurd number) cannot retain without bound.
const MAX_HISTORY_LIMIT = 10_000

// A fixed-capacity circular buffer of retained values. Insertion and
// eviction are O(1) with no per-event copy. The capacity is the largest limit among
// active leases; changing a lease resizes once (O(size)), not per event.
export class HistoryBuffer<T> {
  private readonly leases = new Set<{ limit: number }>()
  private buffer: T[] = []
  private head = 0
  private size = 0
  private cap = 0

  leased(): boolean {
    return this.cap > 0
  }

  retain(limit: number): () => void {
    const lease = { limit: clampLimit(limit) }
    this.leases.add(lease)
    this.applyCapacity()

    return () => {
      this.leases.delete(lease)
      this.applyCapacity()
    }
  }

  add(value: T): void {
    if (this.cap === 0) {
      return
    }

    if (this.size < this.cap) {
      this.buffer[(this.head + this.size) % this.cap] = value
      this.size++
    }
    else {
      // Full: overwrite the oldest slot and advance the head.
      this.buffer[this.head] = value
      this.head = (this.head + 1) % this.cap
    }
  }

  // A stable copy in insertion order, so a replay callback that emits cannot disturb it.
  snapshot(): T[] {
    const out: T[] = []

    for (let index = 0; index < this.size; index++) {
      out.push(this.buffer[(this.head + index) % this.cap])
    }

    return out
  }

  private capacity(): number {
    let cap = 0

    for (const { limit } of this.leases) {
      if (limit > cap) {
        cap = limit
      }
    }

    return cap
  }

  private applyCapacity(): void {
    const next = this.capacity()

    if (next === this.cap) {
      return
    }

    const kept = this.snapshot()
    const trimmed = kept.length > next ? kept.slice(kept.length - next) : kept
    this.buffer = trimmed.slice()
    this.head = 0
    this.size = trimmed.length
    this.cap = next
  }
}

function clampLimit(limit: number): number {
  if (limit === Number.POSITIVE_INFINITY) {
    return MAX_HISTORY_LIMIT
  }

  if (!Number.isFinite(limit) || limit <= 0) {
    return 0
  }

  return Math.min(Math.floor(limit), MAX_HISTORY_LIMIT)
}
