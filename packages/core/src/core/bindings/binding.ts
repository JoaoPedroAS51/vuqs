import type { ComputedRef } from 'vue'
import type { ModuleHost } from '../module-system/apply-module'
import type { NavigateOptions } from '../runtime/adapter'
import type { QueryStateEngine } from '../runtime/engine'
import type { QueryTransactionRequest } from '../runtime/transaction'
import type { QueryStateRefValue, QueryStateResolvedValues, QueryStateSchema, QueryStateWriteValues } from '../schema/schema'
import { computed, getCurrentScope, onScopeDispose, reactive } from 'vue'
import { emitDebug } from '../diagnostics/bus'
import { createQueryStateEngine } from '../runtime/engine'
import { createQueryHooks } from '../runtime/hooks'
import { assertUniquePaths, getManagedKeys } from '../schema/schema'
import { useQueryAdapter } from './adapter-provider'

/**
 * Behavior options for {@link useQueryStates} and {@link useQueryState}.
 */
export interface UseQueryStatesOptions extends NavigateOptions {
  /**
   * Coalesces writes within this many ms into one navigation (`0` uses a microtask).
   *
   * @default The adapter setting, or `0`.
   */
  throttleMs?: number
  /**
   * Allows default-equal writes to omit their URL representation when the binding
   * reads the same value afterward. Overrides the param and adapter settings.
   *
   * @default The param setting, then the adapter setting, then `true`.
   */
  clearOnDefault?: boolean
}

/**
 * A reactive param map whose assignments write to the URL.
 * Use Vue's `toRefs` to obtain individual refs.
 *
 * @typeParam TSchema - The schema bound to the URL.
 * @typeParam TRead - The read value of each param after module effects.
 *
 * @example
 * ```ts
 * values.page = 2
 * values.q = undefined // Clear a param whose type includes `undefined`.
 * ```
 */
export type QueryStatesValues<TSchema extends QueryStateSchema, TRead extends QueryReadShape<TSchema> = QueryReadMap<TSchema>> = {
  [Key in keyof TSchema]: TRead[Key]
}

/**
 * Any read map with one entry per param, such as the base map after module effects.
 *
 * @typeParam TSchema - The schema whose params key the map.
 */
export type QueryReadShape<TSchema extends QueryStateSchema> = {
  [Key in keyof TSchema]: unknown
}

/**
 * The read value of every param before module effects: the resolved value, which
 * permits `undefined` unless a static default guarantees presence.
 *
 * @typeParam TSchema - The schema whose params determine the value types.
 */
export type QueryReadMap<TSchema extends QueryStateSchema> = {
  [Key in keyof TSchema]: QueryStateRefValue<TSchema[Key]>
}

/**
 * The single root the reactive lenses derive from: a schema-typed whole-object
 * read plus an atomic transaction writer.
 *
 * @typeParam TSchema - The schema whose params the binding exposes.
 */
export interface QueryBinding<TSchema extends QueryStateSchema> {
  /** The schema param names, the key set every lens iterates. */
  readonly keys: readonly (keyof TSchema & string)[]
  /** The resolved whole-object read: explicit values layered over defaults. */
  readonly read: ComputedRef<QueryStateResolvedValues<TSchema>>
  /** Atomically applies a partial or exhaustive query-state write. */
  readonly transact: (request: QueryTransactionRequest<TSchema>) => void
}

/**
 * Type-only marker carrying the read value of each param after module effects.
 *
 * @internal
 */
export declare const QUERY_READ: unique symbol

/**
 * Anything that carries a {@link QueryBinding}: the object a reactive lens such
 * as {@link toQueryRefs} accepts.
 *
 * @typeParam TSchema - The schema the binding exposes.
 * @typeParam TRead - The read value of each param after module effects.
 */
export interface QueryBindingSource<TSchema extends QueryStateSchema, TRead extends QueryReadShape<TSchema> = QueryReadMap<TSchema>> {
  /**
   * The schema-typed root a reactive lens derives from.
   *
   * @internal
   */
  readonly binding: QueryBinding<TSchema>
  /** @internal */
  readonly [QUERY_READ]?: TRead
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
  /** What composed modules install through: an owned core view per module, and the registries. */
  host: ModuleHost<TSchema>
}

let bindingCounter = 0

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
    scroll: options.scroll ?? adapterDefaults?.scroll ?? false,
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

  const hooks = createQueryHooks(engine.debug)
  let moduleId = 0
  const host: ModuleHost<TSchema> = {
    pipeline: engine.pipeline,
    publish: engine.installations.publish,
    remove: engine.installations.remove,
    nextId: () => ++moduleId,
    scope: getCurrentScope(),
    // Subscriptions made through the core view are released with the module that made them.
    createCore: own => ({
      schema: resolvedSchema,
      state: engine.state,
      defaults: { candidates: engine.defaults.candidates },
      options: engine.options,
      pipeline: { define: engine.pipeline.define },
      hooks: {
        on: (event, handler) => own(hooks.on(event, handler)),
        emit: hooks.emit,
      },
      query: {
        current: engine.query.current,
        transact: engine.query.transact,
        transactions: { observe: observer => own(engine.query.transactions.observe(observer)) },
      },
      debug: engine.debug,
    }),
  }

  emitDebug(engine.debug, 'binding:created', {
    id,
    keys: binding.keys,
    managedPaths,
  })
  onScopeDispose(() => {
    emitDebug(engine.debug, 'binding:disposed', { id, keys: binding.keys, managedPaths })
  }, true)

  return { engine, binding, host }
}

/**
 * Projects a {@link QueryBinding} into the reactive dot-access value map behind
 * `useQueryStates().values`.
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
      set: value => transactQueryKey(binding, key, value),
    })
  }

  return reactive(refs) as QueryStatesValues<TSchema>
}

/**
 * Writes one reactive field, where assigning `undefined` explicitly clears it.
 *
 * @internal
 */
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
