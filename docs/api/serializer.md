# API: serializer & pure functions

`import { createSerializer, parseQueryStates, buildQuery, … } from 'vuqs'`

These are framework-free — no Vue, no router. Use them to build URLs, run on the
server, or compose your own behavior. See the [serializer guide](/guide/serializer)
for the narrative.

## `createSerializer`

Builds a reusable, schema-bound function that turns values into a query.

```ts
function createSerializer<TSchema>(
  schema: TSchema,
  options?: CreateSerializerOptions,
): Serializer<TSchema, …>

interface CreateSerializerOptions {
  clearOnDefault?: boolean                          // default true
  stringify?: (query: ParsedQueryRaw) => string     // enables string output
  parse?: (search: string) => ParsedQuery           // enables a string base
}
```

The returned `Serializer` is callable two ways:

```ts
serialize(values)        // fresh query from values
serialize(base, values)  // patch values over a base
```

- `stringify` and `parse` are symmetric opt-ins: `stringify` makes the output a
  string; `parse` lets the base be a string too.
- Write semantics match the reactive writers — `null` clears, `undefined`/absent
  skips, a value sets; unmanaged base params are always preserved.
- **Throws** if a string base is passed without a `parse` option.

```ts
const serialize = createSerializer(schema)
serialize({ q: 'lease' })                  // { q: 'lease' }
serialize(route.query, { page: 2 })        // patch over the current query
serialize(route.query, { currency: null }) // clear a field

const toUrl = createSerializer(schema, {
  stringify: q => qs.stringify(q, { addQueryPrefix: true }),
})
toUrl({ q: 'lease', page: 2 })             // '?q=lease&page=2'
```

## Pure functions

Framework-free helpers operating on a schema and a parsed query. `createSerializer`
and the engine are built on these; reach for them for custom server-side or
link-building logic.

### `parseQueryStates`

```ts
function parseQueryStates<TSchema>(schema: TSchema, query: ParsedQuery): QueryStateValues<TSchema>
```

Parses every field out of a query. Absent fields are omitted (not set to
`undefined`).

### `serializeQueryStates`

```ts
function serializeQueryStates<TSchema>(schema: TSchema, values: QueryStateValues<TSchema>): ParsedQueryRaw
```

Serializes a value map into a compacted nested query object. Pass selected values
only — a field equal to its default should be omitted first (see `dropDefaults`).

### `buildQuery`

```ts
function buildQuery<TSchema>(schema: TSchema, currentQuery: ParsedQuery, values: QueryStateValues<TSchema>): ParsedQueryRaw
```

Strips every managed key from `currentQuery`, then writes `values` back.
Unmanaged params are preserved; a managed key absent from `values` is dropped.

### `dropDefaults`

```ts
function dropDefaults<TSchema>(schema: TSchema, values: QueryStateValues<TSchema>): QueryStateValues<TSchema>
```

Drops fields whose value equals their codec default (and absent fields). The
`clearOnDefault` rule as a reusable function.

### `getManagedKeys`

```ts
function getManagedKeys<TSchema>(schema: TSchema): string[]
```

Every query key the schema manages, across all fields, in declaration order.

### `omitManagedKeys`

```ts
function omitManagedKeys<TSchema>(schema: TSchema, query: ParsedQuery): ParsedQueryRaw
```

Removes every managed key from a query (on a clone), pruning only ancestors left
empty by the removal. Unmanaged params, even empty ones, are untouched.

### `assertUniquePaths`

```ts
function assertUniquePaths<TSchema>(schema: TSchema): void
```

Throws if any query path is declared by more than one field. Called internally by
the composables.

## Path helpers

```ts
function getPath(query: ParsedQuery, path: string): ParsedQueryValue
function setPath<T>(query: T, path: string, value: ParsedQueryValue): T
function deletePath(query: ParsedQuery, path: string): void
function getQueryString(raw: ParsedQueryValue): string | undefined
function getQueryStringArray(raw: ParsedQueryValue): string[] | undefined
```

Dot-path read/write/delete over a parsed query, plus normalizers used when writing
[custom codecs](/guide/custom-codecs). `getQueryString` collapses a raw value to a
clean `string | undefined`.

## Equality

```ts
function structuralEq(a: unknown, b: unknown): boolean
```

The deep structural comparison used as the default codec `eq`.

## Engine (advanced)

```ts
function createQueryStateEngine<TSchema>(options: QueryStateEngineOptions<TSchema>): QueryStateEngine<TSchema>
```

The reactive core behind `useQueryStates` — the optimistic overlay,
reconciliation, write coalescing, and navigation — with injectable `parse`/`build`
hooks so a caller can make reads/writes context-aware. Most apps never call this
directly; it's exposed for building higher layers. Must run inside a Vue effect
scope.
