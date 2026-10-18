import type { QueryDefaultSource } from '../../src/core/module-system/contract'
import type { InstallationRegistry } from '../../src/core/runtime/installations'
import type { AnyPipelineDescriptor, PipelineOwner, ReadProjection } from '../../src/core/runtime/pipeline/contract'
import type { QueryPipelineRuntime } from '../../src/core/runtime/pipeline/pipeline'
import type { QueryStateSchema } from '../../src/core/schema/schema'
import { createInstallationRegistry } from '../../src/core/runtime/installations'
import { createQueryPipeline } from '../../src/core/runtime/pipeline/pipeline'

type Callback = (values: any, context: any) => Record<string, unknown>

interface Options {
  /** Paths the callback may remove, as logical tuples. */
  optional?: readonly (readonly string[])[]
  enforce?: 'pre' | 'default' | 'post'
}

const PROJECTIONS: readonly ReadProjection[] = ['explicit', 'defaults', 'resolved']

/** Where a registration is published: an engine, or a standalone pipeline fixture. */
type Target = InstallationTarget & { pipeline: Pick<QueryPipelineRuntime<any>, 'define'> }

/**
 * Installs a read callback on every projection as one installation, the way an
 * unconditional filter behaves.
 *
 * @returns A function that removes the installation.
 */
export function installRead(target: Target, callback: Callback, options: Options = {}): () => void {
  return installContributions(target, {
    pipeline: PROJECTIONS.map(projection =>
      target.pipeline.define('read', callback as never, {
        projection,
        presence: { optional: options.optional ?? [] },
        enforce: options.enforce,
      } as never),
    ),
  }).remove
}

/**
 * Installs a write callback as one installation.
 *
 * @returns A function that removes the installation.
 */
export function installWrite(target: Target, callback: Callback, options: Options = {}): () => void {
  return installContributions(target, {
    pipeline: [target.pipeline.define('write', callback as never, {
      presence: { optional: options.optional ?? [] },
      enforce: options.enforce,
    } as never)],
  }).remove
}

let nextIdentity = 1000

interface Contributions {
  /** Default sources in occurrence order, each its own registration. */
  defaults?: readonly QueryDefaultSource[]
  /** Descriptors in occurrence order, each its own registration. */
  pipeline?: readonly AnyPipelineDescriptor[]
  /** The module name diagnostics attribute the registrations to. */
  name?: string
}

/** Where a complete installation is published: an engine, or a standalone pipeline with its registry. */
export interface InstallationTarget {
  installations: Pick<InstallationRegistry, 'publish' | 'remove'>
}

/**
 * Publishes one complete installation the way a module installation does.
 *
 * @returns The installation identity and a function that removes exactly this installation.
 */
export function installContributions(target: InstallationTarget, contributions: Contributions): { id: number, remove: () => void } {
  const id = nextIdentity++
  const owner = (): PipelineOwner => ({ moduleName: contributions.name, installationId: id, registrationId: nextIdentity++ })

  target.installations.publish({
    id,
    name: contributions.name,
    defaults: (contributions.defaults ?? []).map(source => ({ source, owner: owner() })),
    pipeline: (contributions.pipeline ?? []).map(descriptor => ({ descriptor, owner: owner() })),
  })

  return { id, remove: () => target.installations.remove(id) }
}

/**
 * Builds a standalone pipeline fed by its own installation registry, the owner engines use.
 */
export function createPipelineFixture<TSchema extends QueryStateSchema>(schema: TSchema): {
  pipeline: QueryPipelineRuntime<TSchema>
  installations: InstallationRegistry
} {
  const installations = createInstallationRegistry()

  return { pipeline: createQueryPipeline(schema, installations.snapshot), installations }
}
