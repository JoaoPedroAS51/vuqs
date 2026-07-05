import type { ComputedRef } from 'vue'
import type { QueryStateEngine } from './engine'
import type { QueryCore } from './query-core'
import type { QueryStateSchema, QueryStateValues } from './schema'
import type { NavigateOptions } from './types'
import type { QueryStatesValues, UseQueryStatesOptions } from './use-query-states'
import { computed, reactive } from 'vue'
import { useQueryAdapter } from './adapter'
import { debug } from './debug/sink'
import { createQueryStateEngine } from './engine'
import { createQueryHooks } from './hooks'
import { assertUniquePaths, getManagedKeys } from './schema'

let bindingCounter = 0

/**
 * The single root the reactive lenses derive from: a schema-typed whole-object
 * read plus a per-key write.
 *
 * @remarks
 * `useQueryStates` exposes a binding as `query.binding`. Lenses such as
 * {@link toQueryRefs} take it and derive their shape from `read` and `write`
 * directly, so no shape reconstructs another and none carries a hidden brand.
 * `write` takes `undefined` to clear a param; per-call navigation options flow
 * through its third argument. Keeping the binding generic over `TSchema` is what
 * preserves per-key `T` vs `T | undefined` narrowing at the lens boundary.
 *
 * @typeParam TSchema - The schema whose params the binding exposes.
 */
export interface QueryBinding<TSchema extends QueryStateSchema> {
  /** The schema param names, the key set every lens iterates. */
  readonly keys: readonly (keyof TSchema & string)[]
  /** The resolved whole-object read: the selection layered over defaults. */
  readonly read: ComputedRef<QueryStateValues<TSchema>>
  /** Writes one param. `undefined` clears it; `options` overrides navigation defaults. */
  readonly write: (key: keyof TSchema & string, value: unknown, options?: NavigateOptions) => void
}

/**
 * Anything that carries a {@link QueryBinding}: the object a reactive lens such
 * as {@link toQueryRefs} accepts.
 *
 * @remarks
 * `useQueryStates` returns a source, so `toQueryRefs(query)` reads the root off
 * it. The `binding` field is an implementation seam, not a documented surface:
 * pass the composable, do not reach for `.binding`.
 *
 * @typeParam TSchema - The schema the binding exposes.
 */
export interface QueryBindingSource<TSchema extends QueryStateSchema> {
  /**
   * The schema-typed root a reactive lens derives from.
   *
   * @internal
   */
  readonly binding: QueryBinding<TSchema>
}

/**
 * The shared engine, root binding, and module core built by the public
 * composable facades.
 *
 * @internal
 */
export interface QueryBindingResult<TSchema extends QueryStateSchema> {
  /** The reactive engine backing the bound schema. */
  engine: QueryStateEngine<TSchema>
  /** The schema-typed root every reactive lens derives from. */
  binding: QueryBinding<TSchema>
  /** The shared core passed to composed modules. */
  core: QueryCore<TSchema>
}

/**
 * Builds the engine, writable refs, and module core for a schema.
 *
 * @internal
 */
export function createQueryBinding<TSchema extends QueryStateSchema>(
  schema: TSchema,
  options: UseQueryStatesOptions,
): QueryBindingResult<TSchema> {
  assertUniquePaths(schema)

  const adapter = useQueryAdapter()

  if (adapter === undefined) {
    throw new Error(
      '[vuqs] no query adapter: provide one with provideQueryAdapter() (or installQueryAdapter() at the app level).',
    )
  }

  const { query: querySource, navigate, defaultOptions: adapterDefaults } = adapter
  const resolvedSchema = resolveSchemaClearOnDefault(
    schema,
    options.clearOnDefault,
    adapterDefaults?.clearOnDefault,
  )

  const id = (bindingCounter++).toString(36)

  const engine = createQueryStateEngine({
    id,
    schema: resolvedSchema,
    adapter: { query: querySource, navigate },
    history: options.history ?? adapterDefaults?.history,
    scroll: options.scroll ?? adapterDefaults?.scroll,
    throttleMs: options.throttleMs ?? adapterDefaults?.throttleMs,
    clearOnDefault: options.clearOnDefault,
    adapterClearOnDefault: adapterDefaults?.clearOnDefault,
  })

  const binding: QueryBinding<TSchema> = {
    keys: Object.keys(resolvedSchema) as Array<keyof TSchema & string>,
    read: engine.state.values,
    write: engine.query.set,
  }

  const core: QueryCore<TSchema> = {
    schema: resolvedSchema,
    state: engine.state,
    defaults: engine.defaults,
    options: engine.options,
    pipeline: engine.pipeline,
    hooks: createQueryHooks(),
    query: engine.query,
  }

  debug('binding:created', id, binding.keys.join(','), getManagedKeys(resolvedSchema))

  return { engine, binding, core }
}

function resolveSchemaClearOnDefault<TSchema extends QueryStateSchema>(
  schema: TSchema,
  instanceClearOnDefault: boolean | undefined,
  adapterClearOnDefault: boolean | undefined,
): TSchema {
  const resolved: QueryStateSchema = {}

  for (const key of Object.keys(schema)) {
    const definition = schema[key]

    resolved[key] = {
      ...definition,
      clearOnDefault: instanceClearOnDefault
        ?? definition.clearOnDefault
        ?? adapterClearOnDefault
        ?? true,
    }
  }

  return resolved as TSchema
}

/**
 * Projects a {@link QueryBinding} into the reactive dot-access value map behind
 * `useQueryStates().values`.
 *
 * @remarks
 * Each param is a per-key writable `computed` over `binding.read`/`binding.write`,
 * wrapped in `reactive` so `values.page` reads and `values.page = x` writes with
 * the instance navigation defaults. Reactivity stays fine-grained: a per-key
 * `computed` recomputes when `read` changes but only re-notifies when its own
 * slice changes.
 *
 * @typeParam TSchema - The schema the binding exposes.
 * @param binding - The root binding to project.
 * @returns The reactive, writable value map, one entry per param.
 *
 * @internal
 */
export function toReactiveQuery<TSchema extends QueryStateSchema>(
  binding: QueryBinding<TSchema>,
): QueryStatesValues<TSchema> {
  const refs: Record<string, unknown> = {}

  for (const key of binding.keys) {
    refs[key] = computed({
      get: () => (binding.read.value as Record<string, unknown>)[key],
      set: value => binding.write(key, value),
    })
  }

  return reactive(refs) as QueryStatesValues<TSchema>
}
