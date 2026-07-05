import type { ParsedQueryRaw } from './types'
import { shallowRef } from 'vue'
import { debug } from './debug/sink'

/** A param-keyed value map flowing through the pipeline. */
export type QueryValues = Record<string, unknown>

/**
 * The pipeline stage map: each stage is an application point the engine runs,
 * with its own transform signature.
 *
 * @remarks
 * Core-owned and closed: modules tap existing stages, they do not add new ones
 * (a stage only exists where the engine applies it). Signatures are
 * heterogeneous: the value-map stages reshape parsed values, while `navigate`
 * rewrites the serialized query at the navigation boundary.
 */
export interface QueryPipeline {
  /** Reshapes the values the app reads, for example dropping context-invalid params. */
  read: (values: QueryValues) => QueryValues
  /** Reshapes the values written to the URL on a navigation. */
  write: (values: QueryValues) => QueryValues
  /** Rewrites the serialized query at the navigation boundary. */
  navigate: (query: ParsedQueryRaw) => ParsedQueryRaw
}

/** A stage name. */
export type QueryPipelineStage = keyof QueryPipeline

/**
 * Orders a tap within its stage: `pre` runs first, then `default`, then `post`.
 * Omitting it is the same as `'default'`.
 */
export type Enforce = 'pre' | 'default' | 'post'

/**
 * The transform pipeline modules contribute to through {@link QueryCore}.
 *
 * @remarks
 * Modules `tap` transforms at a stage; the engine `run`s the composed stage
 * inside its reactive reads and writes. Transforms must be pure functions of
 * their input so the pull-based reactivity stays correct.
 */
export interface QueryPipelineBus {
  /**
   * Registers a transform at one or more stages and returns a function that
   * removes it. `enforce` orders it relative to other taps in the same stage.
   */
  tap: <Stage extends QueryPipelineStage>(
    stage: Stage | Stage[],
    transform: QueryPipeline[Stage],
    options?: { enforce?: Enforce },
  ) => () => void
  /**
   * Applies a stage's composed transforms to a value map a module derived
   * itself, so the derived state is shaped like the engine's own reads.
   */
  run: <Stage extends QueryPipelineStage>(
    stage: Stage,
    value: Parameters<QueryPipeline[Stage]>[0],
  ) => ReturnType<QueryPipeline[Stage]>
}

interface Tap {
  transform: (value: unknown) => unknown
  enforce: Enforce
}

const ENFORCE_ORDER: Record<Enforce, number> = { pre: 0, default: 1, post: 2 }

/**
 * Creates a {@link QueryPipelineBus}. One pipeline is created per engine and
 * shared with its modules.
 *
 * @internal
 */
export function createQueryPipeline(): QueryPipelineBus {
  const taps = shallowRef<Record<QueryPipelineStage, Tap[]>>({
    read: [],
    write: [],
    navigate: [],
  })

  function tap<Stage extends QueryPipelineStage>(
    stage: Stage | Stage[],
    transform: QueryPipeline[Stage],
    options?: { enforce?: Enforce },
  ): () => void {
    const stages = (Array.isArray(stage) ? stage : [stage]) as QueryPipelineStage[]
    const entry: Tap = { transform: transform as Tap['transform'], enforce: options?.enforce ?? 'default' }

    debug('pipeline:tap', [...stages], entry.enforce)

    // Insert keeping each stage ordered by enforce band; the stable sort keeps
    // registration order within a band, so `run` can iterate without re-sorting.
    const next = { ...taps.value }
    for (const name of stages) {
      next[name] = [...next[name], entry].sort((a, b) => ENFORCE_ORDER[a.enforce] - ENFORCE_ORDER[b.enforce])
    }
    taps.value = next

    return () => {
      const without = { ...taps.value }
      let changed = false

      for (const name of stages) {
        const filtered = without[name].filter(item => item !== entry)
        if (filtered.length !== without[name].length) {
          without[name] = filtered
          changed = true
        }
      }

      if (changed) {
        taps.value = without
      }
    }
  }

  function run<Stage extends QueryPipelineStage>(
    stage: Stage,
    value: Parameters<QueryPipeline[Stage]>[0],
  ): ReturnType<QueryPipeline[Stage]> {
    const entries = taps.value[stage]

    if (entries.length === 0) {
      return value as ReturnType<QueryPipeline[Stage]>
    }

    let current: unknown = value

    for (const { transform } of entries) {
      current = transform(current)
    }

    return current as ReturnType<QueryPipeline[Stage]>
  }

  return { tap, run }
}
