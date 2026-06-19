# withActiveParams <Badge type="tip" text="@vuqs/core/modules" />

Derives which params are explicitly selected away from their resolved defaults.
Use it for active-filter badges, summaries, and per-param indicators without
duplicating the comparison policy in application code.

## Usage

`withActiveParams` composes on a group with `useQueryStates` or on a single param
with `useQueryState`. The group receives aggregate views; the single param
receives one computed activity flag.

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

## Signals

- **Emits:** none.
- **Reacts to:** none.

The module derives from shared reactive reads instead. See
[Composing built-in modules](/modules/composition) for the built-in interactions
that affect those reads.

## How it works

### Activity rules

A param is active when all these conditions hold:

1. It exists in the explicit selection after the `read` pipeline.
2. It is not excluded.
3. It has no resolved default, or its value differs from that default according
   to the param's equality function.

Resolved defaults include codec defaults and registered default layers. Custom
equality from `withEquality` is respected. Changes to the explicit selection,
resolved defaults, or read pipeline update the result reactively. Optimistic
writes update it before the adapter commits the URL.

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

## Debugging

`withActiveParams` is a read-only projection and emits no module-specific debug
events. Use [vuqs debug logging](/guide/going-further/debugging) to inspect the
transactions, pipeline taps, and default-layer changes that feed its computed
state.

## Nuxt

Under [`@vuqs/nuxt`](/nuxt/auto-imports), `withActiveParams` is auto-imported
with the other modules.
