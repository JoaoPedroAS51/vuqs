# API: modules

Composable modules layered onto [`useQueryStates`](/api/composables#usequerystates)
with `.use()`. See the [Modules guide](/modules/introduction) for the narrative. A
module is a function `(core) => addedApi` whose return type is merged onto the
composable.

## .use(module) <Badge type="info" text="vuqs" />

Applies a module to the composable, merging its contributed API and widening the
return type. Calls chain.

### Signature

```ts
interface QueryComposable<TSchema, TApi> {
  use: <TAdded>(module: QueryModule<TSchema, TAdded>) => QueryComposable<TSchema, TApi & TAdded>
  // ...the API accumulated so far
}

type QueryModule<TSchema, TAdded> = (core: QueryCore<TSchema>) => TAdded
```

### Example

```ts
import { useQueryStates } from 'vuqs'
import { withContext, withEffective } from 'vuqs/modules'

const filters = useQueryStates(schema)
  .use(withEffective())
  .use(withContext({ active: tab, preserve: ['q'] }))
```

## withEffective <Badge type="tip" text="vuqs/modules" />

Adds the `selected` / `defaults` / `effective` states and runtime-default writers.
See the [withEffective guide](/modules/effective).

### Signature

```ts
function withEffective(): QueryModule<TSchema, EffectiveApi<TSchema>>
```

### Returns

A module contributing `EffectiveApi`:

```ts
interface EffectiveApi<TSchema> {
  selected: Readonly<QueryStateValues<TSchema>>   // explicit URL selections only
  defaults: Readonly<QueryStateValues<TSchema>>   // runtime defaults over codec defaults
  effective: Readonly<QueryStateValues<TSchema>>  // selected over defaults
  setDefaults: (values: QueryStateValues<TSchema>) => void  // replace (snapshot)
  clearDefaults: () => void                       // drop runtime defaults
}
```

- States are **readonly reactive objects** — `selected.field`, no `.value`. Only
  `selected` is serialized.
- `setDefaults` replaces the runtime defaults; it doesn't merge. They never reach
  the URL and reset on a context change (see [`withContext`](#withcontext)).

### Example

```ts
const { effective, setDefaults } = useQueryStates(schema).use(withEffective())

setDefaults({ status: 'active', perPage: 20 }) // e.g. from an API
```

## withContext <Badge type="tip" text="vuqs/modules" />

Adds context-aware param validity, plus reset/preserve on a context change. It
never navigates on its own. See the [withContext guide](/modules/context).

### Signature

```ts
// Inferred from the chained schema:
function withContext<TSchema, TContext extends string>(
  options: ContextOptions<TSchema, TContext>,
): QueryModule<TSchema, ContextApi<TContext>>

// Schema-bound, for explicit key checking:
function withContext<TSchema, TContext extends string>(
  schema: TSchema,
  options: ContextOptions<TSchema, TContext>,
): QueryModule<TSchema, ContextApi<TContext>>
```

### Parameters

```ts
interface ContextOptions<TSchema, TContext extends string> {
  active: MaybeRefOrGetter<TContext>                                   // external, opaque
  preserve?: ReadonlyArray<keyof TSchema & string>                    // kept on a switch
  only?: Partial<Record<keyof TSchema & string, readonly TContext[]>> // validity per context
  navigate?: (target: TContext, query: ParsedQueryRaw, options?: NavigateOptions) => void // how switchTo navigates
}
```

| Property | Type | Description |
| --- | --- | --- |
| `active` | `MaybeRefOrGetter<TContext>` | The current context — external and opaque; the store never derives it. |
| `preserve` | `(keyof TSchema)[]` | Params kept across a context change; everything else resets. |
| `only` | `Partial<Record<key, TContext[]>>` | The contexts each param exists in. Omit a param to make it valid everywhere. |
| `navigate` | `(target, query, options?) => void` | How `switchTo` navigates. Required only if you call `switchTo`. |

`preserve` and `only` are type-checked against the schema — either the one chained
through `use`, or the one passed to the schema-bound overload.

### Returns

A module contributing `ContextApi`:

```ts
interface ContextApi<TContext extends string> {
  activeContext: ComputedRef<TContext>  // a ref — use .value
  buildContextQuery: (currentQuery: ParsedQuery, nextContext: TContext) => ParsedQueryRaw
  switchTo: (target: TContext, options?: NavigateOptions) => void
}
```

- `activeContext` is a **ref** (`.value`) because it's a single scalar.
- `buildContextQuery` returns the reconciled switch query without navigating — for
  links or SSR.
- `switchTo` reconciles and navigates in one step via the `navigate` option; throws
  if `navigate` is not configured.

### Example

```ts
const filters = useQueryStates(schema).use(withContext({
  active: tab,
  preserve: ['q'],
  only: { category: ['products'], status: ['orders'] },
}))
```

## Authoring

Types and helpers for writing your own module. See the
[authoring guide](/modules/authoring) for the narrative.

### QueryCore <Badge type="info" text="vuqs" />

The shared object passed to every module.

```ts
interface QueryCore<TSchema> {
  schema: TSchema
  selected: ComputedRef<QueryStateValues<TSchema>>      // selections + overlay, `read` applied, no codec defaults
  setValue: (key, value, options?: NavigateOptions) => void
  navigate: (query: ParsedQueryRaw, options?: NavigateOptions) => void // applies a full query; runs the `navigate` stage
  currentQuery: () => ParsedQuery
  hooks: QueryHookBus
  pipeline: QueryPipelineBus
  clearOnDefault: boolean
}
```

### Hooks <Badge type="info" text="vuqs" />

The coordination bus. `QueryHooks` is empty in the core; a module declares its
event via `declare module 'vuqs'`.

```ts
interface QueryHooks {} // augment to add typed events, e.g. 'context:change'

interface QueryHookBus {
  on: <E extends keyof QueryHooks>(event: E, handler: QueryHooks[E]) => () => void
  emit: <E extends keyof QueryHooks>(event: E, ...args: Parameters<QueryHooks[E]>) => void
}
```

Fire-and-forget: handlers run synchronously, in an unspecified order, and must be
commutative. A throwing handler is isolated and logged.

### Pipeline <Badge type="info" text="vuqs" />

The transform pipeline. Stages are core-owned and closed; transforms must be pure.

```ts
interface QueryPipeline {
  read: (values: QueryValues) => QueryValues          // values the app reads
  write: (values: QueryValues) => QueryValues          // values written to the URL
  navigate: (query: ParsedQueryRaw) => ParsedQueryRaw  // serialized query at the navigation boundary
}
type QueryPipelineStage = keyof QueryPipeline // 'read' | 'write' | 'navigate'
type Enforce = 'pre' | 'default' | 'post'

interface QueryPipelineBus {
  tap: <S extends QueryPipelineStage>(
    stage: S | S[],
    transform: QueryPipeline[S],
    options?: { enforce?: Enforce },
  ) => () => void
  run: <S extends QueryPipelineStage>(stage: S, value: Parameters<QueryPipeline[S]>[0]) => ReturnType<QueryPipeline[S]>
}
```

`tap` registers a transform and returns a disposer; `run` applies a stage's
composed transforms to a value map a module derived itself.

### Shared helpers <Badge type="tip" text="vuqs/shared" />

```ts
function pickBy(predicate: (key: string) => boolean): <T>(values: T) => Partial<T>
function omitBy(predicate: (key: string) => boolean): <T>(values: T) => Partial<T>
function definedOnly<T>(values: T): T
function toReadonlyState<T>(source: ComputedRef<T>): Readonly<T>
```

- `pickBy` / `omitBy` — build a pipeline transform that keeps / drops matching keys.
- `definedOnly` — copy without `undefined`-valued keys (a cleared param reads as absent).
- `toReadonlyState` — expose a `ComputedRef<record>` as a readonly reactive object.
