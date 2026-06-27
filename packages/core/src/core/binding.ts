import type { WritableComputedRef } from 'vue'
import type { QueryStateEngine } from './engine'
import type { QueryStateSchema } from './schema'
import type { QueryCore, UseQueryStatesOptions } from './use-query-states'
import { computed } from 'vue'
import { useQueryAdapter } from './adapter'
import { createQueryStateEngine } from './engine'
import { createQueryHooks } from './hooks'
import { assertUniquePaths } from './schema'

/**
 * The shared query binding used by the public composable facades.
 *
 * @internal
 */
export interface QueryBinding<TSchema extends QueryStateSchema> {
  /** The reactive engine backing the bound schema. */
  engine: QueryStateEngine<TSchema>
  /** One writable computed ref per schema param. */
  refs: Record<string, WritableComputedRef<unknown>>
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
): QueryBinding<TSchema> {
  assertUniquePaths(schema)

  const adapter = useQueryAdapter()

  if (adapter === undefined) {
    throw new Error(
      '[vuqs] no query adapter: provide one with provideQueryAdapter() (or installQueryAdapter() at the app level).',
    )
  }

  const { query: querySource, navigate, defaultOptions: adapterDefaults } = adapter

  const engine = createQueryStateEngine({
    schema,
    adapter: { query: querySource, navigate },
    history: options.history ?? adapterDefaults?.history,
    scroll: options.scroll ?? adapterDefaults?.scroll,
    throttleMs: options.throttleMs ?? adapterDefaults?.throttleMs,
    clearOnDefault: options.clearOnDefault ?? adapterDefaults?.clearOnDefault,
  })

  const refs: Record<string, WritableComputedRef<unknown>> = {}

  for (const key of Object.keys(schema) as Array<keyof TSchema & string>) {
    refs[key] = computed<unknown>({
      get: () => (engine.state.values.value as Record<string, unknown>)[key],
      set: value => engine.query.set(key, value),
    })
  }

  const core: QueryCore<TSchema> = {
    schema,
    state: engine.state,
    defaults: engine.defaults,
    options: engine.options,
    pipeline: engine.pipeline,
    hooks: createQueryHooks(),
    query: engine.query,
  }

  return { engine, refs, core }
}

/**
 * Builds the engine and one writable computed per param.
 *
 * @internal
 */
export function createQueryStateRefs<TSchema extends QueryStateSchema>(
  schema: TSchema,
  options: UseQueryStatesOptions,
): Pick<QueryBinding<TSchema>, 'engine' | 'refs'> {
  const { engine, refs } = createQueryBinding(schema, options)

  return { engine, refs }
}
