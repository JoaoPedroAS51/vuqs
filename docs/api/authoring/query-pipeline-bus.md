# QueryPipelineBus <Badge type="info" text="@vuqs/core" />

Creates the pipeline descriptors a module returns to reshape reads and writes.

## Usage

```ts
import type { QueryCore } from '@vuqs/core'
import { codecs, defineQueryModule, defineQuerySchema } from '@vuqs/core'

const schema = defineQuerySchema({ page: codecs.integer, q: codecs.string })

const withHiddenPage = defineQueryModule({
  states: (core: QueryCore<typeof schema>) => ({
    api: {},
    pipeline: [
      core.pipeline.define('read', ({ page: _page, ...rest }) => rest, {
        projection: 'resolved',
        presence: { optional: [['page']] },
      }),
    ],
  }),
})
```

## Type

```ts
interface QueryPipelineBus<TSchema extends QueryStateSchema = QueryStateSchema> {
  define: {
    <TProjection extends ReadProjection, const TOptional extends readonly PipelinePath<TSchema>[], const TRequired extends readonly PipelinePath<TSchema>[], TEnforce extends Enforce>(
      stage: 'read',
      callback: (values: PipelineView<TSchema, …>, context: PipelineReadContext<TSchema, TProjection>) => …,
      options: PipelineReadOptions<TProjection, TOptional, TRequired, TEnforce>,
    ): PipelineDescriptor<'read', TProjection, TOptional, TRequired, TEnforce>
    <const TOptional extends readonly PipelinePath<TSchema>[], const TRequired extends readonly PipelinePath<TSchema>[], TEnforce extends Enforce>(
      stage: 'write',
      callback: (values: PipelineView<TSchema, 'explicit'>, context: PipelineWriteContext<TSchema>) => …,
      options?: PipelineWriteOptions<TOptional, TRequired, TEnforce>,
    ): PipelineDescriptor<'write', undefined, TOptional, TRequired, TEnforce>
  }
}
```

## Methods

| Method | Parameters | Return value |
| --- | --- | --- |
| `define(stage, callback, options)` | `'read'` with a `projection` option, or `'write'`; a callback `(values, context) => nextValues`; optional `presence.optional`, `presence.required` and `enforce`. | An inert descriptor typed with its presence effects. |

`define` only creates a descriptor. A module installs it by returning it in the `pipeline` member of its setup result; a descriptor that is not returned has no effect, and the core assigns it a registration identity. The bus offers no way to run a stage or install a descriptor outside a result.

Callbacks must be pure. Reading reactive sources is supported; mutation, navigation, and side effects are not. Navigation is not a stage. `enforce` defaults to `'default'`: `pre`, then `default`, then `post`. Within a band, installation order is retained.


## Descriptor types

```ts
type ReadProjection = 'explicit' | 'defaults' | 'resolved'

type PipelinePath<TSchema extends QueryStateSchema> = /* tuples of logical keys through declared children */

interface PipelineDescriptor<TStage, TProjection, TOptional, TRequired, TEnforce> {
  readonly stage: TStage
  readonly projection: TProjection
  readonly optional: TOptional
  readonly required: TRequired
  readonly enforce: TEnforce
}

type OrderedPipelineDescriptors<TDescriptors extends readonly unknown[]> = /* pre, default, post, then installation order */
type ApplyPipelineEffects<TBase, TDescriptors extends readonly unknown[]> = /* the base read after the ordered presence effects */
```

`ApplyPipelineEffects` applies only descriptors of the resolved projection. A conditional declaration guarantees the paths every alternative names, and a widened list guarantees nothing while still admitting absence. `PipelineView`, `PipelineReadContext`, `PipelineWriteContext`, `PipelineWriteRequest`, `PipelinePresence`, `PipelineReadOptions` and `PipelineWriteOptions` describe the callback inputs and options; see [Writing a module](/modules/authoring#callback-inputs-and-results).

## QueryPipeline

```ts
interface QueryPipeline {
  read: (values: QueryValues) => QueryValues
  write: (values: QueryValues) => QueryValues
}
```

## QueryPipelineStage

```ts
type QueryPipelineStage = keyof QueryPipeline
```

## QueryValues

```ts
type QueryValues = Record<string, unknown>
```

## Enforce

```ts
type Enforce = 'pre' | 'default' | 'post'
```

## Related guide

[Shaping reads and writes](/modules/authoring#shaping-reads-and-writes).
