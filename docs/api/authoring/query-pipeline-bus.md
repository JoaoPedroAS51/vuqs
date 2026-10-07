# QueryPipelineBus <Badge type="info" text="@vuqs/core" />

Registers pure transforms for reads, writes, and serialized navigation output.

## Usage

```ts
import { defineQueryModule } from '@vuqs/core'
import { omitBy } from '@vuqs/core/shared'
import { onScopeDispose } from 'vue'

const withHiddenPage = defineQueryModule({
  queryStates: (core) => {
    const stop = core.pipeline.tap('read', omitBy(key => key === 'page'))
    onScopeDispose(stop)
    return {}
  },
})
```

## Type

```ts
interface QueryPipelineBus {
  tap: <Stage extends QueryPipelineStage>(
    stage: Stage | Stage[],
    transform: QueryPipeline[Stage],
    options?: { enforce?: Enforce },
  ) => () => void
  run: <Stage extends QueryPipelineStage>(
    stage: Stage,
    value: Parameters<QueryPipeline[Stage]>[0],
  ) => ReturnType<QueryPipeline[Stage]>
}
```

## Methods

| Method | Parameters | Return value |
| --- | --- | --- |
| `tap(stage, transform, options?)` | One stage or an array of stages, its transform, optional `enforce`. | Disposer that unregisters the transform. |
| `run(stage, value)` | Stage and matching input. | The stage's transformed result. |

Transforms must be pure. Reading reactive sources is supported; mutation, navigation, and side effects are not. `enforce` defaults to `'default'`: `pre`, then `default`, then `post`. Within a band, registration order is retained.


## QueryPipeline

```ts
interface QueryPipeline {
  read: (values: QueryValues) => QueryValues
  write: (values: QueryValues) => QueryValues
  navigate: (query: ParsedQueryRaw) => ParsedQueryRaw
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
