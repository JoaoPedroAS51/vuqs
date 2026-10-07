# withContext <Badge type="tip" text="@vuqs/core/modules" />

Filters query state by an active context and provides controls for reconciling context switches.

## Usage

```ts
import { codecs, useQueryStates } from '@vuqs/core'
import { withContext } from '@vuqs/core/modules'
import { ref } from 'vue'

const active = ref<'products' | 'orders'>('products')
const query = useQueryStates({ q: codecs.string, category: codecs.string })
  .use(withContext({
    active,
    preserve: ['q'],
    only: { category: ['products'] },
  }))

query.buildContextQuery({}, 'orders')
```

## Type

```ts
declare const withContext: QueryModuleFactory<'vuqs:context'>
```

`QueryModuleFactory` is the inferred factory type, not a package export.
See [Factory call forms](/api/authoring/define-query-module#factory-call-forms)
for adaptive, schema, param, and path calls.

## Parameters

| Option | Type | Default | Behavior |
| --- | --- | --- | --- |
| `active` | `MaybeRefOrGetter<TContext>` | Required | Supplies the active context. |
| `preserve` | Group: readonly schema keys; single: `boolean` | Nothing preserved | Params retained across a switch when valid in the target. |
| `only` | Group: partial key-to-context map; single: readonly contexts | Valid everywhere | Restricts param validity. |
| `navigate` | `ContextNavigate<TContext>` | Absent | Required by `switchTo`; optional for `buildContextQuery`. |

Grouped `preserve` and `only` are checked against the schema. Calls built outside a `.use()` chain can pass a normalized schema or a param to make the facade explicit.

## Return value

A module contributing `ContextStatesApi<TContext>` or `ContextStateApi<TContext>`.

| Member | Type | Behavior |
| --- | --- | --- |
| `activeContext` | `ComputedRef<TContext>` | Mirrors `active`. |
| `buildContextQuery` | `(currentQuery: ParsedQuery, nextContext: TContext) => ParsedQueryRaw` | Reconciles params for a target without navigating. |
| `switchTo` | `(target: TContext, options?: NavigateOptions) => void` | Reconciles the query and calls the supplied `navigate`. Throws when `navigate` is absent. |

Changing `active` filters reads and emits `context:change`; it does not itself reconcile the URL. Invalid raw params in an external URL are removed by a later write. `switchTo` uses the supplied callback rather than the vuqs adapter.


## ContextBaseOptions

```ts
interface ContextBaseOptions<TContext extends string> {
  active: MaybeRefOrGetter<TContext>
  navigate?: ContextNavigate<TContext>
}
```

## QueryStatesContextOptions

```ts
type QueryStatesContextOptions<TSchema extends QueryStateSchema, TContext extends string>
  = ContextBaseOptions<TContext> & (
    | { preserve?: undefined, only?: undefined }
    | {
      preserve: ReadonlyArray<keyof TSchema & string>
      only?: Partial<Record<keyof TSchema & string, readonly TContext[]>>
    }
    | {
      preserve?: ReadonlyArray<keyof TSchema & string>
      only: Partial<Record<keyof TSchema & string, readonly TContext[]>>
    }
  )
```

## QueryStateContextOptions

```ts
type QueryStateContextOptions<TContext extends string> = ContextBaseOptions<TContext> & (
  | { preserve?: undefined, only?: undefined }
  | {
    preserve: boolean
    only?: readonly TContext[]
  }
  | {
    preserve?: boolean
    only: readonly TContext[]
  }
)
```

## ContextNavigate

```ts
type ContextNavigate<TContext extends string> = (
  target: TContext,
  query: ParsedQueryRaw,
  options?: NavigateOptions,
) => void
```

## ContextStatesApi

```ts
interface ContextControls<TContext extends string> {
  activeContext: ComputedRef<TContext>
  buildContextQuery: (currentQuery: ParsedQuery, nextContext: TContext) => ParsedQueryRaw
  switchTo: (target: TContext, options?: NavigateOptions) => void
}

interface ContextStatesApi<TContext extends string> extends ContextControls<TContext> {}
```

`ContextControls` is a supporting internal interface, not a package export.

## ContextStateApi

```ts
interface ContextStateApi<TContext extends string> extends ContextControls<TContext> {}
```

## Related guide

[Context changes](/modules/context).
