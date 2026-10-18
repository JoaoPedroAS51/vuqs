import type { EffectScope } from 'vue'
import type { InstalledContributions } from '../runtime/installations'
import type { PipelineOwner } from '../runtime/pipeline/contract'
import type { QueryPipelineRuntime } from '../runtime/pipeline/pipeline'
import type { QueryStateSchema } from '../schema/schema'
import type { DefinedQueryStateModule, QueryModuleInfo, QueryModulePipelineDescriptor, QueryModuleResult, QueryStatesModule } from './contract'
import type { QueryCore } from './query-core'
import { effectScope, onScopeDispose } from 'vue'
import { QUERY_MODULE_INFO, QUERY_STATE_MODULE } from './contract'

/**
 * The module and registration identities the core assigns, never the author.
 *
 * @internal
 */
export interface ModuleInstallation {
  readonly id: number
  readonly name?: string
}

/**
 * What the binding provides to install a module: an owned view of the core and the
 * operations that activate and remove its contributions.
 *
 * @internal
 */
export interface ModuleHost<TSchema extends QueryStateSchema> {
  /** Builds the core a module sees; subscriptions made through it register with `own`. */
  createCore: (own: (stop: () => void) => () => void) => QueryCore<TSchema>
  /** Validates the descriptors a module returns. */
  pipeline: Pick<QueryPipelineRuntime<TSchema>, 'validate'>
  /** Activates a complete, prepared installation. */
  publish: (installation: InstalledContributions) => void
  /** Removes the installation with this identity as a whole; removing an absent one changes nothing. */
  remove: (id: number) => void
  /** The scope the binding was created in, which owns every module installed on it. */
  scope: EffectScope | undefined
  /** Allocates the next identity inside the binding. */
  nextId: () => number
}

/**
 * Applies a grouped module to a composable.
 *
 * @internal
 */
export function applyQueryStatesModule<TSchema extends QueryStateSchema>(
  composable: object,
  host: ModuleHost<TSchema>,
  module: QueryStatesModule<TSchema>,
): void {
  installModule(composable, host, moduleName(module), module)
}

/**
 * Applies a single-param module to a ref composable.
 *
 * @internal
 */
export function applyQueryStateModule<TSchema extends QueryStateSchema>(
  composable: object,
  host: ModuleHost<TSchema>,
  key: keyof TSchema & string,
  module: DefinedQueryStateModule,
): void {
  const project = module[QUERY_STATE_MODULE]

  if (project === undefined) {
    throw new Error('[vuqs] module does not support useQueryState()')
  }

  installModule(composable, host, moduleName(module), core => project(core, key))
}

// Installation

function installModule<TSchema extends QueryStateSchema>(
  target: object,
  host: ModuleHost<TSchema>,
  name: string | undefined,
  setup: (core: QueryCore<TSchema>) => QueryModuleResult,
): void {
  const installation: ModuleInstallation = { id: host.nextId(), name }
  const scope = createInstallationScope(host)
  const owned = new Set<() => void>()
  let closed = false
  let published = false
  let attached: string[] = []

  // Idempotent. Closes the owned-subscription lifetime, removes the complete installation,
  // then releases what the module subscribed through its core.
  function cleanup(): void {
    if (closed) {
      return
    }

    closed = true
    host.remove(installation.id)
    for (const stop of [...owned]) {
      stop()
    }
    owned.clear()
  }

  // Armed before setup so it runs ahead of any cleanup the author registers.
  scope.run(() => onScopeDispose(cleanup))

  // Ownership follows the module, not whichever scope is active when a subscription is made.
  const core = host.createCore((stop) => {
    if (closed) {
      stop()

      return () => {}
    }

    owned.add(stop)

    return () => {
      if (owned.delete(stop)) {
        stop()
      }
    }
  })

  try {
    const result = scope.run(() => setup(core))

    validateResult(result)
    assertNoCollision(target, result.api)

    const descriptors = result.pipeline ?? []
    const sources = result.defaults ?? []

    // Validate every declaration before preparing any of them.
    for (const descriptor of descriptors) {
      validateDescriptor(descriptor)
      host.pipeline.validate(descriptor!)
    }
    for (const source of sources) {
      if (source === undefined || source === null) {
        throw new Error('[vuqs] module returned an invalid default source')
      }
    }

    // Prepare the API and every registration without changing the active configuration.
    const api = { ...result.api }
    const contributions: InstalledContributions = {
      id: installation.id,
      name,
      defaults: sources.map(source => ({ source, owner: owner(host, installation) })),
      pipeline: descriptors.map(descriptor => ({ descriptor: descriptor!, owner: owner(host, installation) })),
    }

    // The module was disposed while its setup ran, so nothing of it is published.
    if (closed) {
      return
    }

    attached = Object.keys(api)
    Object.assign(target, api)

    // Cleanup is armed and the API is attached before any observer can react.
    published = true
    host.publish(contributions)
  }
  catch (error) {
    // An error after publication came from notification or evaluation, which stay visible:
    // the armed cleanup still releases the installation with its scope.
    if (!published) {
      for (const key of attached) {
        Reflect.deleteProperty(target, key)
      }

      cleanup()
      scope.stop()
    }

    throw error
  }
}

// Installation scopes belong to the binding, whichever scope is active when `use` runs.
function createInstallationScope<TSchema extends QueryStateSchema>(host: ModuleHost<TSchema>): EffectScope {
  if (host.scope === undefined) {
    return effectScope()
  }

  if (!host.scope.active) {
    throw new Error('[vuqs] cannot install a module on a disposed binding')
  }

  return host.scope.run(() => effectScope())!
}

function owner<TSchema extends QueryStateSchema>(host: ModuleHost<TSchema>, installation: ModuleInstallation): PipelineOwner {
  return { moduleName: installation.name, installationId: installation.id, registrationId: host.nextId() }
}

function moduleName(module: object): string | undefined {
  return (module as { [QUERY_MODULE_INFO]?: QueryModuleInfo })[QUERY_MODULE_INFO]?.name
}

function validateResult(result: unknown): asserts result is QueryModuleResult {
  const api = (result as { api?: unknown } | undefined | null)?.api

  if (typeof result !== 'object' || result === null || typeof api !== 'object' || api === null) {
    throw new Error('[vuqs] module did not return an API object')
  }
}

function validateDescriptor(descriptor: QueryModulePipelineDescriptor | undefined): void {
  if (
    typeof descriptor !== 'object'
    || descriptor === null
    || typeof descriptor.callback !== 'function'
    || (descriptor.stage !== 'read' && descriptor.stage !== 'write')
  ) {
    throw new Error('[vuqs] module returned an invalid pipeline registration; create it with core.pipeline.define')
  }
}

function assertNoCollision(target: object, added: object): void {
  for (const key of Object.keys(added)) {
    if (key in target) {
      throw new Error(`[vuqs] module key "${key}" is already provided by an earlier module`)
    }
  }
}
