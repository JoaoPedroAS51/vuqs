# withActiveParams <Badge type="tip" text="@vuqs/core/modules" />

Derives which params are explicitly present and different from their composed defaults.

## Usage

```ts
import { codecs, useQueryStates } from '@vuqs/core'
import { withActiveParams } from '@vuqs/core/modules'

const query = useQueryStates({ q: codecs.string, page: codecs.integer })
  .use(withActiveParams({ exclude: ['page'] }))

query.activeCount.value
query.isActive('q')
```

## Type

```ts
import type { QueryModuleFactory } from '@vuqs/core'

declare const withActiveParams: QueryModuleFactory<
  'vuqs:active-params',
  typeof import('@vuqs/core/modules').withActiveParams.definition
>
```

`QueryModuleFactory` is exported from `@vuqs/core`. Its second type parameter preserves the module's setup definitions.
See [Factory call forms](/api/authoring/define-query-module#factory-call-forms)
for adaptive, schema, param, and path calls.

## Parameters

| Option | Type | Default | Behavior |
| --- | --- | --- | --- |
| `exclude` | `readonly (keyof TSchema & string)[]` | `[]` | Removes params from every grouped view. Captured when the module is composed. |

The single-param form takes no options. Schema keys are inferred when the factory is called inline in `.use()`.

## Return value

A module contributing `ActiveParamsStatesApi<TSchema>` to a group or `ActiveParamsStateApi` to one param.

| Grouped member | Type | Behavior |
| --- | --- | --- |
| `activeKeys` | `ComputedRef<readonly (keyof TSchema & string)[]>` | Active keys in schema order. |
| `activeCount` | `ComputedRef<number>` | Count of active params. |
| `hasActive` | `ComputedRef<boolean>` | Whether a param is active. |
| `isActive` | `(key: keyof TSchema & string) => boolean` | Reads the same reactive source as the aggregate views. |

The single API exposes `isActive: ComputedRef<boolean>`. A param is active when an explicit value survives the read pipeline and differs from its composed default according to its equality function, compared without filling omitted children. Optimistic writes and changes to default layers update the result.

Call grouped `isActive(key)` in a template, computed, or effect when the result must track changes.


## ActiveParamsOptions

```ts
interface ActiveParamsOptions<TSchema extends QueryStateSchema> {
  exclude?: readonly (keyof TSchema & string)[]
}
```

## ActiveParamsStatesApi

```ts
interface ActiveParamsStatesApi<TSchema extends QueryStateSchema> {
  activeKeys: ComputedRef<readonly (keyof TSchema & string)[]>
  activeCount: ComputedRef<number>
  hasActive: ComputedRef<boolean>
  isActive: (key: keyof TSchema & string) => boolean
}
```

## ActiveParamsStateApi

```ts
interface ActiveParamsStateApi {
  isActive: ComputedRef<boolean>
}
```

## Related guide

[Active params](/modules/active-params).
