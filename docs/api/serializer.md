# API: serializer & pure functions

Framework-free building blocks: no Vue, no router. Use them to build URLs or
compose your own behavior. See [Building URLs](/guide/going-further/serializer) for
the narrative.

## createSerializer <Badge type="info" text="@vuqs/core" />

Builds a reusable, schema-bound function that turns values into a query.

```ts
function createSerializer<TSchema>(
  schema: TSchema,
  options?: CreateSerializerOptions,
): Serializer<TSchema, ParsedQuery, ParsedQueryRaw | string>
```

**Parameters**

- `schema: TSchema`
  - The params to serialize, keyed by logical name.
- `options?: CreateSerializerOptions`
  - `clearOnDefault?: boolean`: default `true`. Drop a value when it equals its codec default.
  - `stringify?: (query: ParsedQueryRaw) => string`: enables string output. Provide it to return a query string instead of a query object.
  - `parse?: (search: string) => ParsedQuery`: enables a string base. Provide it to accept a raw query string as the base argument.
  - `stringify` and `parse` are symmetric opt-ins.

**Returns**

- `serialize: Serializer`
  - Callable two ways: `serialize(values)` builds a fresh query from `values`, and
    `serialize(base, values)` patches `values` over a `base` query.
  - Write semantics match the reactive writers: `null` clears, `undefined`/absent
    skips, a value sets. Unmanaged base params are always preserved.
  - **Throws** if a string base is passed without a `parse` option.

**Example**

```ts
import { createSerializer } from '@vuqs/core'
import qs from 'qs'

const serialize = createSerializer(schema)
serialize({ q: 'lease' })                  // { q: 'lease' }
serialize(route.query, { page: 2 })        // patch over the current query
serialize(route.query, { currency: null }) // clear a param

const toUrl = createSerializer(schema, {
  stringify: q => qs.stringify(q, { addQueryPrefix: true }),
})
toUrl({ q: 'lease', page: 2 })             // '?q=lease&page=2'
```

## Pure functions <Badge type="info" text="@vuqs/core" />

Framework-free helpers over a schema and a parsed query. `createSerializer` and
the engine are built on these; reach for them for custom link-building or
query-reading logic.

### parseQueryStates

```ts
function parseQueryStates<TSchema>(schema: TSchema, query: ParsedQuery): QueryStateValues<TSchema>
```

Parses every param out of a query. Absent params are omitted (not set to
`undefined`).

### serializeQueryStates

```ts
function serializeQueryStates<TSchema>(schema: TSchema, values: QueryStateValues<TSchema>): ParsedQueryRaw
```

Serializes a value map into a compacted nested query object. Pass selected values
only: a param equal to its default should be omitted first (see `dropDefaults`).

### buildQuery

```ts
function buildQuery<TSchema>(schema: TSchema, currentQuery: ParsedQuery, values: QueryStateValues<TSchema>): ParsedQueryRaw
```

Strips every managed key from `currentQuery`, then writes `values` back. Unmanaged
params are preserved; a managed key absent from `values` is dropped.

### dropDefaults

```ts
function dropDefaults<TSchema>(schema: TSchema, values: QueryStateValues<TSchema>): QueryStateValues<TSchema>
```

Drops params whose value equals their codec default (and absent params). The
`clearOnDefault` rule as a reusable function.

### getManagedKeys

```ts
function getManagedKeys<TSchema>(schema: TSchema): string[]
```

Every query key the schema manages, across all params, in declaration order.

### omitManagedKeys

```ts
function omitManagedKeys<TSchema>(schema: TSchema, query: ParsedQuery): ParsedQueryRaw
```

Removes every managed key from a query (on a clone), pruning only ancestors left
empty by the removal. Unmanaged params, even empty ones, are untouched.

### assertUniquePaths

```ts
function assertUniquePaths<TSchema>(schema: TSchema): void
```

Throws if any query path is declared by more than one param. Called internally by
the composables.

## Path helpers <Badge type="info" text="@vuqs/core" />

Dot-path read/write/delete over a parsed query, plus the normalizers used when
writing [custom codecs](/guide/codecs/custom).

```ts
function getPath(query: ParsedQuery, path: string): ParsedQueryValue
function setPath<T>(query: T, path: string, value: ParsedQueryValue): T
function deletePath(query: ParsedQuery, path: string): void
function getQueryString(raw: ParsedQueryValue): string | undefined
function getQueryStringArray(raw: ParsedQueryValue): string[] | undefined
```

`getQueryString` collapses a raw value to a clean `string | undefined`;
`getQueryStringArray` does the same for a list.

## structuralEq <Badge type="info" text="@vuqs/core" />

```ts
function structuralEq(a: unknown, b: unknown): boolean
```

The deep structural comparison used as the default codec `eq`.

## createQueryStateEngine <Badge type="info" text="@vuqs/core" />

The reactive core behind `useQueryStates`: the optimistic overlay,
reconciliation, write coalescing, and navigation.

```ts
function createQueryStateEngine<TSchema>(options: QueryStateEngineOptions<TSchema>): QueryStateEngine<TSchema>
```

**Parameters**

- `options: QueryStateEngineOptions<TSchema>`
  - The schema, resolved options, and injectable `parse`/`build` hooks. See
    [`QueryStateEngineOptions`](/api/types#engine-types).

**Returns**

- `engine: QueryStateEngine<TSchema>`
  - The reactive state map and scheduled `setValue`, plus the facets a
    [module](/modules/authoring#the-core) receives.

Takes injectable `parse`/`build` hooks so a caller can make reads/writes
context-aware. Most apps never call this directly; it's exposed for building
higher layers. Must run inside a Vue effect scope. See
[`QueryStateEngineOptions`](/api/types#engine-types).
