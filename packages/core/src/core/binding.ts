import type { WritableComputedRef } from 'vue'
import type { QueryStateEngine } from './engine'
import type { QueryCore } from './query-core'
import type { QueryStateSchema } from './schema'
import type { UseQueryStatesOptions } from './use-query-states'
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
  const resolvedSchema = resolveSchemaClearOnDefault(
    schema,
    options.clearOnDefault,
    adapterDefaults?.clearOnDefault,
  )

  const engine = createQueryStateEngine({
    schema: resolvedSchema,
    adapter: { query: querySource, navigate },
    history: options.history ?? adapterDefaults?.history,
    scroll: options.scroll ?? adapterDefaults?.scroll,
    throttleMs: options.throttleMs ?? adapterDefaults?.throttleMs,
    clearOnDefault: options.clearOnDefault,
    adapterClearOnDefault: adapterDefaults?.clearOnDefault,
  })

  const refs: Record<string, WritableComputedRef<unknown>> = {}

  for (const key of Object.keys(resolvedSchema) as Array<keyof TSchema & string>) {
    refs[key] = computed<unknown>({
      get: () => (engine.state.values.value as Record<string, unknown>)[key],
      set: value => engine.query.set(key, value),
    })
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
