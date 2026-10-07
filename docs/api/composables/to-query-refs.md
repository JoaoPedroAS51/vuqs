# toQueryRefs <Badge type="info" text="@vuqs/core" />

Projects the composable into one writable ref per field. Use it to recover the
per-field `.set`/`.clear` that the grouped `values` map drops, or to pass a single
field around.

## Usage

```ts
import { codecs, toQueryRefs, useQueryStates } from '@vuqs/core'

const query = useQueryStates({ q: codecs.string, page: codecs.integer.withDefault(1) })
const { q, page } = toQueryRefs(query)

q.set('phone')
page.clear()
```

## Type

```ts
function toQueryRefs<TSchema extends QueryStateSchema>(query: QueryBindingSource<TSchema>): ToQueryRefs<TSchema>
```

## Parameters

- `query: QueryBindingSource<TSchema>`
  - The [`useQueryStates`](/api/composables/use-query-states) composable. For read-only per-field refs
    over a module's `selected`/`defaults` map, use Vue's `toRefs` directly.

## Return value

- `refs: ToQueryRefs<TSchema>`
  - One [`QueryStateRef`](/api/composables/use-query-state) per param, with writable `.value` plus
    `.set`/`.clear`. A param with a default reads as `T`, otherwise
    `T | undefined`. Assigning `undefined` clears when the ref type includes it;
    `.clear()` is available for defaulted params too.

## ToQueryRefs

```ts
type ToQueryRefs<TSchema extends QueryStateSchema> = {
  [Key in keyof TSchema]: QueryStateRef<QueryStateRefValue<TSchema[Key]>>
}
```

## Related guide

[Query state](/guide/query-state/use-query-states).
