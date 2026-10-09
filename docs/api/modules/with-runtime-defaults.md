# withRuntimeDefaults <Badge type="tip" text="@vuqs/core/modules" />

Layers runtime defaults below explicit query values without serializing them.

## Usage

```ts
import { codecs, useQueryStates } from '@vuqs/core'
import { withRuntimeDefaults } from '@vuqs/core/modules'

const query = useQueryStates({ perPage: codecs.integer })
  .use(withRuntimeDefaults())

query.setDefaults({ perPage: 20 })
query.values.perPage // 20 when no explicit value is present
```

## Type

```ts
declare const withRuntimeDefaults: QueryModuleFactory<'vuqs:runtime-defaults'>
```

`QueryModuleFactory` is the inferred factory type, not a package export.
See [Factory call forms](/api/authoring/define-query-module#factory-call-forms)
for adaptive, schema, param, and path calls.

## Parameters

The adaptive call takes no options. Its grouped or single-param facade is inferred from the surrounding `.use()`.

## Return value

A module contributing `RuntimeDefaultsStatesApi<TSchema>` to `useQueryStates`, or `RuntimeDefaultsStateApi<TValue>` to `useQueryState`.

| Member | Grouped API | Single API | Behavior |
| --- | --- | --- | --- |
| Explicit values | `explicitValues` | `explicitValue` | Includes optimistic writes and the read pipeline, before engine default resolution. The grouped map uses dot access; the single value is a computed ref. |
| Resolved default | `defaults` | `defaultValue` | Runtime defaults layered over codec defaults. |
| Set defaults | `setDefaults(values)` | `setDefault(value)` | Replaces the runtime layer; it does not merge. |
| Clear defaults | `clearDefaults()` | `clearDefault()` | Removes the runtime layer, retaining codec defaults. |

The effective read remains `query.values` or the single ref's `.value`. Defaults are not serialized. Changing context clears the runtime layer through [`context:change`](/modules/signals#the-signal-registry).


## RuntimeDefaultsStatesApi

```ts
interface RuntimeDefaultsStatesApi<TSchema extends QueryStateSchema> {
  explicitValues: Readonly<QueryStateValues<TSchema>>
  defaults: Readonly<QueryStateValues<TSchema>>
  setDefaults: (values: QueryStateValues<TSchema>) => void
  clearDefaults: () => void
}
```

## RuntimeDefaultsStateApi

```ts
interface RuntimeDefaultsStateApi<TValue> {
  explicitValue: ComputedRef<TValue | undefined>
  defaultValue: ComputedRef<TValue | undefined>
  setDefault: (value: TValue) => void
  clearDefault: () => void
}
```

## Related guide

[Runtime defaults](/modules/runtime-defaults).
