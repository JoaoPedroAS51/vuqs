# toQueryRef <Badge type="info" text="@vuqs/core" />

Binds the whole schema to one writable ref, the singular counterpart to
[`toQueryRefs`](/api/composables/to-query-refs): a plain snapshot on read, an exhaustive replace on
write. Use it when the value is the complete state, such as a form model or an API
request object.

## Usage

```ts
import { codecs, toQueryRef, useQueryStates } from '@vuqs/core'

const query = useQueryStates({ q: codecs.string, sort: codecs.string })
const filters = toQueryRef(query)

filters.value = { q: 'phone', sort: 'desc' } // set q + sort, clear the rest
filters.value = { ...filters.value, q: 'sale' } // keep the object, change q
filters.clear()
```

## Type

```ts
function toQueryRef<TSchema extends QueryStateSchema>(query: QueryBindingSource<TSchema>): QueryRef<TSchema>
```

## Parameters

- `query: QueryBindingSource<TSchema>`
  - The [`useQueryStates`](/api/composables/use-query-states) composable.

## Return value

- `ref: QueryRef<TSchema>`
  - A writable ref over the whole object, plus `.set(value, options?)` and
    `.clear(options?)`.
  - Reading yields a plain snapshot of the resolved values after the read
    pipeline; `undefined` entries are omitted. The snapshot keeps a stable
    reference while its content is unchanged, so a whole-object `v-model` does not churn identity.
  - Writing **replaces** the state: params not present in the assigned value are
    cleared, as are params explicitly set to `undefined`.

## QueryRef

```ts
interface QueryRef<TSchema extends QueryStateSchema>
  extends WritableComputedRef<QueryStateValues<TSchema>> {
  set: (value: QueryStateValues<TSchema>, options?: NavigateOptions) => void
  clear: (options?: NavigateOptions) => void
}
```

## QueryBinding

```ts
interface QueryBinding<TSchema extends QueryStateSchema> {
  readonly keys: readonly (keyof TSchema & string)[]
  readonly read: ComputedRef<QueryStateValues<TSchema>>
  readonly transact: (request: QueryTransactionRequest<TSchema>) => void
}
```

## QueryBindingSource

```ts
interface QueryBindingSource<TSchema extends QueryStateSchema> {
  readonly binding: QueryBinding<TSchema>
}
```

## Related guide

[Query state](/guide/query-state/use-query-states).
