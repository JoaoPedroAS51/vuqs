import type { QueryStateSchema } from '../schema/schema'
import type { DefinedQueryStateModule, QueryStatesModule } from './contract'
import type { QueryCore } from './query-core'
import { effectScope } from 'vue'
import { QUERY_STATE_MODULE } from './contract'

/**
 * Merges a module API onto a composable, failing on key collisions.
 *
 * @internal
 */
export function mergeModuleApi(target: object, added: object): void {
  for (const key of Object.keys(added)) {
    if (key in target) {
      throw new Error(`[vuqs] module key "${key}" is already provided by an earlier module`)
    }
  }

  Object.assign(target, added)
}

/**
 * Applies a grouped module to a composable.
 *
 * @internal
 */
export function applyQueryStatesModule<TSchema extends QueryStateSchema, TAdded>(
  composable: object,
  core: QueryCore<TSchema>,
  module: QueryStatesModule<TSchema, TAdded>,
): void {
  applyWithRollback(composable, () => module(core) as object)
}

/**
 * Applies a single-param module to a ref composable.
 *
 * @internal
 */
export function applyQueryStateModule<TSchema extends QueryStateSchema, TStateApi>(
  composable: object,
  core: QueryCore<TSchema>,
  key: keyof TSchema & string,
  module: DefinedQueryStateModule<TStateApi>,
): void {
  const project = module[QUERY_STATE_MODULE]

  if (project === undefined) {
    throw new Error('[vuqs] module does not support useQueryState()')
  }

  applyWithRollback(composable, () => project(core, key) as object)
}

function applyWithRollback(target: object, createApi: () => object): void {
  const scope = effectScope()

  try {
    const added = scope.run(createApi)

    if (added === undefined) {
      throw new Error('[vuqs] module did not return an API object')
    }

    mergeModuleApi(target, added)
  }
  catch (error) {
    scope.stop()
    throw error
  }
}
