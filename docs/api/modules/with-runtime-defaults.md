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
import type { QueryModuleFactory } from '@vuqs/core'

declare const withRuntimeDefaults: QueryModuleFactory<
  'vuqs:runtime-defaults',
  typeof import('@vuqs/core/modules').withRuntimeDefaults.definition
>
```

`QueryModuleFactory` is exported from `@vuqs/core`. Its second type parameter preserves the module's setup definitions.
See [Factory call forms](/api/authoring/define-query-module#factory-call-forms)
for adaptive, schema, param, and path calls.

## Parameters

The adaptive call takes no options. Its grouped or single-param facade is inferred from the surrounding `.use()`.

## Return value

A module contributing `RuntimeDefaultsStatesApi<TSchema>` to `useQueryStates`, or `RuntimeDefaultsStateApi<TExplicit, TContribution>` to `useQueryState`.

| Member | Grouped API | Single API | Behavior |
| --- | --- | --- | --- |
| Explicit values | `explicitValues` | `explicitValue` | Includes optimistic writes and the read pipeline, before engine default resolution. The grouped map uses dot access; the single value is a computed ref. |
| Composed default | `defaults` | `defaultValue` | Runtime defaults layered over static defaults. A composed param shows its inspected candidate even while a presence gate keeps it absent from `values`. |
| Set defaults | `setDefaults(values)` | `setDefault(value)` | Replaces the runtime source; it does not merge with the previous call. A composed param accepts a partial object, and omitted or `undefined` paths keep the lower defaults. |
| Clear defaults | `clearDefaults()` | `clearDefault()` | Removes the runtime source contribution, retaining static defaults. |

The effective read remains `query.values` or the single ref's `.value`. Defaults are not serialized. Changing context clears the runtime layer through [`context:change`](/modules/signals#the-signal-registry).


## RuntimeDefaultsStatesApi

```ts
interface RuntimeDefaultsStatesApi<TSchema extends QueryStateSchema> {
  explicitValues: Readonly<QueryStateValues<TSchema>>
  defaults: Readonly<QueryStateContributions<TSchema>>
  setDefaults: (values: QueryStateContributions<TSchema>) => void
  clearDefaults: () => void
}
```

## RuntimeDefaultsStateApi

```ts
interface RuntimeDefaultsStateApi<TExplicit, TContribution = TExplicit> {
  explicitValue: ComputedRef<TExplicit | undefined>
  defaultValue: ComputedRef<TContribution | undefined>
  setDefault: (value: TContribution) => void
  clearDefault: () => void
}
```

## Related guide

[Runtime defaults](/modules/runtime-defaults).
