import type { QueryStateSchema } from '../../schema/schema'
import type { InstallationRegistry } from '../installations'
import type { AnyPipelineDescriptor, Enforce, PipelineOwner, PipelineReadContext, PipelineWriteContext, QueryPipelineBus, QueryPipelineStage, QueryValues, ReadProjection } from './contract'
import { computed } from 'vue'
import { createPresenceValidation } from './presence'

/**
 * Descriptor construction, validation and execution for a pipeline.
 *
 * @typeParam TSchema - The schema of the binding.
 *
 * @internal
 */
export interface QueryPipelineRuntime<TSchema extends QueryStateSchema = QueryStateSchema> extends QueryPipelineBus<TSchema> {
  /**
   * Validates a descriptor's presence paths against the schema.
   *
   * @throws {Error} When a presence path is unknown, enters an atomic param, or is both optional and required.
   */
  validate: (descriptor: AnyPipelineDescriptor) => void
  /**
   * Applies descriptors matching the stage and read projection.
   *
   * Each output is checked against the descriptor's presence effects before it
   * reaches the next callback or `observe`.
   *
   * `observe` receives each applied descriptor's output in execution order.
   *
   * @returns The input when no descriptor applies; otherwise, the final callback output.
   */
  run: {
    (
      stage: 'read',
      value: QueryValues,
      context: PipelineReadContext<TSchema, ReadProjection>,
      observe?: (output: QueryValues) => void,
    ): QueryValues
    (
      stage: 'write',
      value: QueryValues,
      context: PipelineWriteContext<TSchema>,
      observe?: (output: QueryValues) => void,
    ): QueryValues
  }
}

interface Entry {
  readonly enforce: Enforce
  readonly descriptor: AnyPipelineDescriptor
  readonly owner: PipelineOwner
}

const ENFORCE_ORDER: Record<Enforce, number> = { pre: 0, default: 1, post: 2 }

/**
 * Creates a pipeline over a reactive installation snapshot.
 *
 * Descriptors execute in `pre`, `default`, then `post` order, retaining installation
 * and occurrence order within each band.
 *
 * @param schema - The schema for path and output validation.
 * @param installations - The active installations in publication order.
 * @returns A pipeline whose prepared order follows changes to installation membership.
 *
 * @internal
 */
export function createQueryPipeline<TSchema extends QueryStateSchema = QueryStateSchema>(
  schema: TSchema,
  installations: InstallationRegistry['snapshot'],
): QueryPipelineRuntime<TSchema> {
  const presence = createPresenceValidation(schema)
  // Source-value updates must not rebuild the registration order.
  const prepared = computed<Record<QueryPipelineStage, readonly Entry[]>>(() => {
    const next: Record<QueryPipelineStage, Entry[]> = { read: [], write: [] }

    for (const installation of installations.value) {
      for (const { descriptor, owner } of installation.pipeline) {
        next[descriptor.stage as QueryPipelineStage].push({ enforce: descriptor.enforce, descriptor, owner })
      }
    }

    for (const stage of Object.keys(next) as QueryPipelineStage[]) {
      // The stable sort keeps installation order within a band.
      next[stage].sort((a, b) => ENFORCE_ORDER[a.enforce] - ENFORCE_ORDER[b.enforce])
    }

    return next
  })

  const define: QueryPipelineBus<TSchema>['define'] = ((
    stage: 'read' | 'write',
    callback: (values: any, context: any) => any,
    options: {
      projection?: ReadProjection
      presence?: { optional?: readonly unknown[], required?: readonly unknown[] }
      enforce?: Enforce
    } = {},
  ): AnyPipelineDescriptor => ({
    stage,
    projection: stage === 'read' ? options.projection : undefined,
    optional: options.presence?.optional ?? [],
    required: options.presence?.required ?? [],
    enforce: options.enforce ?? 'default',
    callback,
  })) as QueryPipelineBus<TSchema>['define']

  const run: QueryPipelineRuntime<TSchema>['run'] = (stage, value, context, observe): QueryValues => {
    const entries = prepared.value[stage]

    if (entries.length === 0) {
      return value
    }

    const projection = context.stage === 'read' ? context.projection : undefined
    const verification = presence.beginRun({ stage, projection })
    let current = value
    let index = 0

    for (const { descriptor, owner } of entries) {
      index++

      if (stage === 'read' && descriptor.projection !== projection) {
        continue
      }

      const output = descriptor.callback(current, context)

      verification.verify({ descriptor, owner, index, input: current, output })

      current = output
      observe?.(output)
    }

    return current
  }

  return { define, validate: presence.validate, run }
}
