import type { ComputedRef } from 'vue'
import type { QueryCore } from '../module-system/query-core'
import type { NavigateOptions } from '../runtime/adapter'
import type { QueryStateEngine } from '../runtime/engine'
import type { QueryTransactionRequest } from '../runtime/transaction'
import type { QueryStateRefValue, QueryStateSchema, QueryStateValues, QueryStateWriteValues } from '../schema/schema'
import { computed, onScopeDispose, reactive } from 'vue'
import { emitDebug } from '../diagnostics/bus'
import { createQueryStateEngine } from '../runtime/engine'
import { createQueryHooks } from '../runtime/hooks'
import { assertUniquePaths, getManagedKeys } from '../schema/schema'
import { useQueryAdapter } from './adapter-provider'

/**
 * Behavior options for {@link useQueryStates} and {@link useQueryState}.
 */
export interface UseQueryStatesOptions extends NavigateOptions {
  /** Coalesce writes within this many ms into one navigation. Defaults to a microtask. */
  throttleMs?: number
  /** Drop a value from the URL when it equals its codec default. Defaults to `true`. */
  clearOnDefault?: boolean
}

/**
 * The reactive value map returned by {@link useQueryStates}: each param is a
 * value, not a ref. Read `values.page`; assign `values.page = x` to write with
 * the default navigation options, or `values.page = undefined` to clear a
 * param whose type includes `undefined`. Use Vue's `toRefs` to obtain individual
 * refs.
 *
 * @typeParam TSchema - The schema bound to the URL.
 */
export type QueryStatesValues<TSchema extends QueryStateSchema> = {
  [Key in keyof TSchema]: QueryStateRefValue<TSchema[Key]>
}

let bindingCounter = 0

/**
 * The single root the reactive lenses derive from: a schema-typed whole-object
 * read plus an atomic transaction writer.
 *
 * @typeParam TSchema - The schema whose params the binding exposes.
 */
export interface QueryBinding<TSchema extends QueryStateSchema> {
  /** The schema param names, the key set every lens iterates. */
  readonly keys: readonly (keyof TSchema & string)[]
  /** The resolved whole-object read: the selection layered over defaults. */
  readonly read: ComputedRef<QueryStateValues<TSchema>>
  /** Atomically applies a partial or exhaustive query-state write. */
  readonly transact: (request: QueryTransactionRequest<TSchema>) => void
}

/**
 * Anything that carries a {@link QueryBinding}: the object a reactive lens such
 * as {@link toQueryRefs} accepts.
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

  const { defaultOptions: adapterDefaults } = adapter
  const resolvedSchema = resolveSchemaClearOnDefault(
    schema,
    options.clearOnDefault,
    adapterDefaults?.clearOnDefault,
  )

  const id = (bindingCounter++).toString(36)

  const engine = createQueryStateEngine({
    id,
    schema: resolvedSchema,
    adapter,
    history: options.history ?? adapterDefaults?.history,
    scroll: options.scroll ?? adapterDefaults?.scroll,
    throttleMs: options.throttleMs ?? adapterDefaults?.throttleMs,
    clearOnDefault: options.clearOnDefault,
    adapterClearOnDefault: adapterDefaults?.clearOnDefault,
  })

  const binding: QueryBinding<TSchema> = {
    keys: Object.keys(resolvedSchema) as Array<keyof TSchema & string>,
    read: engine.state.values,
    transact: engine.query.transact,
  }
  const managedPaths = getManagedKeys(resolvedSchema)

  const core: QueryCore<TSchema> = {
    schema: resolvedSchema,
    state: engine.state,
    defaults: engine.defaults,
    options: engine.options,
    pipeline: engine.pipeline,
    hooks: createQueryHooks(engine.debug),
    query: engine.query,
    debug: engine.debug,
  }

  emitDebug(engine.debug, 'binding:created', {
    id,
    keys: binding.keys,
    managedPaths,
  })
  onScopeDispose(() => {
    emitDebug(engine.debug, 'binding:disposed', { id, keys: binding.keys, managedPaths })
  }, true)

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
 * @typeParam TSchema - The schema the binding exposes.
 * @param binding - The root binding to project.
 * @returns The reactive, writable value map, one entry per param.
 * @internal
 */
export function toReactiveQuery<TSchema extends QueryStateSchema>(
  binding: QueryBinding<TSchema>,
): QueryStatesValues<TSchema> {
  const refs: Record<string, unknown> = {}

  for (const key of binding.keys) {
    refs[key] = computed({
      get: () => (binding.read.value as Record<string, unknown>)[key],
      set: value => transactQueryKey(binding, key, value),
    })
  }

  return reactive(refs) as QueryStatesValues<TSchema>
}

/** Writes one reactive field, where assigning `undefined` explicitly clears it. */
export function transactQueryKey<TSchema extends QueryStateSchema>(
  binding: QueryBinding<TSchema>,
  key: keyof TSchema & string,
  value: unknown,
  navigation?: NavigateOptions,
): void {
  binding.transact({
    mode: 'patch',
    values: { [key]: value } as QueryStateWriteValues<TSchema>,
    navigation,
  })
}
