# QueryModuleRegistry <Badge type="info" text="@vuqs/core" />

Registers schema-, value-, or facade-dependent options and API through TypeScript module augmentation.

## Usage

```ts
import type { QueryStateSchema, QueryStateValueAt } from '@vuqs/core'
import type { ComputedRef } from 'vue'
import { defineQueryModule } from '@vuqs/core'
import { computed } from 'vue'

declare module '@vuqs/core' {
  interface QueryModuleRegistry<TSchema extends QueryStateSchema, TParam extends string> {
    'my-lib:selection': {
      state: { api: { selection: ComputedRef<QueryStateValueAt<TSchema, 'value'> | undefined> } }
    }
  }
}

export const withSelection = defineQueryModule({
  name: 'my-lib:selection',
  queryState: (core, key) => ({
    selection: computed(() => core.state.selected.value[key]),
  }),
})
```

## Type

```ts
interface QueryModuleRegistry<TSchema extends QueryStateSchema, TParam extends string> {}

type QueryModuleName = keyof QueryModuleRegistry<QueryStateSchema, string>
```

## Type parameters

| Parameter | Meaning |
| --- | --- |
| `TSchema extends QueryStateSchema` | Schema supplied by the composing facade. A `state` facet receives the single schema `{ value: DefinedQueryParam<TValue> }`. |
| `TParam extends string` | Extra string type inferred by the factory, such as a context identifier union. |

## Facets

| Facet | Property | Meaning |
| --- | --- | --- |
| `states` | `options` | Options accepted by the grouped form, when declared. |
| `states` | `api` | API contributed to `useQueryStates`. |
| `state` | `options` | Options accepted by the single form, when declared. |
| `state` | `api` | API contributed to `useQueryState`. |

Keys are namespaced module names. `QueryModuleName` is their union. Pass a key as `name` to `defineQueryModule`; the registry is type-only and does not register runtime behavior.

Read the single param value with `QueryStateValueAt<TSchema, 'value'>`. Grouped APIs can key their options and maps against `keyof TSchema`.

## Related guide

[Value-typed APIs](/modules/authoring#value-typed-single-apis) and [facade-dependent options](/modules/authoring#facade-driven-options).
