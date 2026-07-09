# withActiveParams <Badge type="tip" text="@vuqs/core/modules" />

Derives which params are explicitly selected away from their resolved defaults.
Use it for active-filter badges, summaries, and per-param indicators without
duplicating the comparison policy in application code.

## Usage

### On a group

```ts
import { codecs, useQueryStates } from '@vuqs/core'
import { withActiveParams } from '@vuqs/core/modules'

const query = useQueryStates({
  q: codecs.string,
  status: codecs.literal(['open', 'closed'] as const).withDefault('open'),
  page: codecs.integer.withDefault(1),
}).use(withActiveParams({ exclude: ['page'] }))

query.activeKeys.value // readonly ('q' | 'status' | 'page')[]
query.activeCount.value
query.hasActive.value
query.isActive('status')
```

`exclude` removes a param from every grouped view. Its keys are checked against
the surrounding schema.

### On a single param

```ts
import { codecs, useQueryState } from '@vuqs/core'
import { withActiveParams } from '@vuqs/core/modules'

const status = useQueryState(
  'status',
  codecs.literal(['open', 'closed'] as const).withDefault('open'),
).use(withActiveParams())

status.isActive.value
```

The single-param form takes no options.

## API

### `useQueryStates`

`withActiveParams(options?)` contributes `ActiveParamsStatesApi<TSchema>`:

- `activeKeys: ComputedRef<readonly SchemaKey[]>`: active params in schema order.
- `activeCount: ComputedRef<number>`: the number of active params.
- `hasActive: ComputedRef<boolean>`: whether at least one param is active.
- `isActive(key): boolean`: whether one schema param is active.

`isActive(key)` reads the same reactive source as the computed views. Call it in a
template, `computed`, or effect when its result must update reactively:

```ts
const hasActiveStatus = computed(() => query.isActive('status'))
```

### `useQueryState`

`withActiveParams()` contributes `ActiveParamsStateApi`:

- `isActive: ComputedRef<boolean>`: whether the bound param is active.

## Options

```ts
interface ActiveParamsOptions<TSchema extends QueryStateSchema> {
  exclude?: readonly (keyof TSchema & string)[]
}
```

`exclude` is static. The module captures it when composed. Pass a new module
instance when the excluded keys need to change.

## How it works

A param is active when all these conditions hold:

1. It exists in the explicit selection after the `read` pipeline.
2. It is not excluded.
3. It has no resolved default, or its value differs from that default according
   to the param's equality function.

Resolved defaults include codec defaults and layers such as
[`withRuntimeDefaults`](/modules/runtime-defaults). Custom equality from
`withEquality` is respected. Optimistic writes update the result before the
adapter commits the URL.

### Presence is not activity

An explicit selection can equal its resolved default. That param is present in
the URL, but it is not active.

| State | Present | Active |
| --- | --- | --- |
| Param absent | no | no |
| Explicit value with no default | yes | yes |
| Explicit value different from the default | yes | yes |
| Explicit value equal to the default | yes | no |

Use `core.state.selected` when authoring a module that needs URL presence alone.

## Composing

`withActiveParams` reads shared core state and registers no transforms or hooks.
It composes in either order with policy modules:

- `withRuntimeDefaults` can make a selection active or inactive when its resolved
  default changes.
- `withContext` removes context-invalid params through the `read` pipeline, so
  they disappear from active-param views.

## Example

```ts
import { codecs, useQueryStates } from '@vuqs/core'
import { withActiveParams } from '@vuqs/core/modules'
import { computed } from 'vue'

const filters = useQueryStates({
  q: codecs.string,
  category: codecs.string,
  sort: codecs.literal(['newest', 'price'] as const).withDefault('newest'),
  page: codecs.integer.withDefault(1),
}).use(withActiveParams({ exclude: ['page'] }))

const summary = computed(() => ({
  count: filters.activeCount.value,
  keys: filters.activeKeys.value,
}))
```

## Nuxt

Under [`@vuqs/nuxt`](/nuxt/auto-imports), `withActiveParams` is auto-imported
with the other modules.
