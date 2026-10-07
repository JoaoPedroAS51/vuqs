# API: serializer & pure functions

Schema-bound serialization and query helpers. The serializer and pure functions
are framework-free: no Vue, no router. The advanced `createQueryStateEngine`
section documents the reactive Vue core and calls out its effect-scope requirement.
See [Building URLs](/guide/going-further/serializer) for serializer usage.

## createSerializer <Badge type="info" text="@vuqs/core" />

Builds a reusable, schema-bound function that turns values into a query.

```ts
function createSerializer<TSchema extends QueryStateSchemaInput>(
  schema: TSchema,
  options: CreateSerializerOptions & { stringify: SerializerStringify, parse: SerializerParse },
): Serializer<NormalizeQueryStateSchema<TSchema>, ParsedQuery | string, string>

function createSerializer<TSchema extends QueryStateSchemaInput>(
  schema: TSchema,
  options: CreateSerializerOptions & { stringify: SerializerStringify },
): Serializer<NormalizeQueryStateSchema<TSchema>, ParsedQuery, string>

function createSerializer<TSchema extends QueryStateSchemaInput>(
  schema: TSchema,
  options: CreateSerializerOptions & { parse: SerializerParse },
): Serializer<NormalizeQueryStateSchema<TSchema>, ParsedQuery | string, ParsedQueryRaw>

function createSerializer<TSchema extends QueryStateSchemaInput>(
  schema: TSchema,
  options?: CreateSerializerOptions,
): Serializer<NormalizeQueryStateSchema<TSchema>, ParsedQuery, ParsedQueryRaw>
```

**Parameters**

- `schema: TSchema`
  - Codecs or param definitions keyed by logical name. Codec inputs are normalized
    before serialization.
- `options?: CreateSerializerOptions`
  - `clearOnDefault?: boolean`: default `true`. Drop a value when it equals its codec default.
  - `stringify?: (query: ParsedQueryRaw) => string`: enables string output. Provide it to return a query string instead of a query object.
  - `parse?: (search: string) => ParsedQuery`: enables a string base. Provide it to accept a raw query string as the base argument.
  - `stringify` controls output; `parse` controls the accepted base. They can be
    supplied independently.

**Returns**

- `serialize: Serializer`
  - Callable two ways: `serialize(values)` builds a fresh query from `values`, and
    `serialize(base, values)` patches `values` over a `base` query.
  - Omitted params are preserved, `undefined` clears, and a value sets.
    Unmanaged base params are preserved.
  - **Throws** if a string base is passed without a `parse` option.

**Example**

```ts
import { codecs, createSerializer, defineQuerySchema } from '@vuqs/core'
import qs from 'qs'

const schema = defineQuerySchema({ q: codecs.string, page: codecs.integer })
const serialize = createSerializer(schema)
serialize({ q: 'phone' }) // { q: 'phone' }
serialize({ q: 'old', page: '1' }, { page: 2 }) // { q: 'old', page: '2' }
serialize({ q: 'old' }, { q: undefined }) // {}

const toUrl = createSerializer(schema, {
  stringify: query => qs.stringify(query, { addQueryPrefix: true }),
})
toUrl({ q: 'phone', page: 2 }) // '?q=phone&page=2'
```

## Pure functions <Badge type="info" text="@vuqs/core" />

Framework-free helpers over a schema and a parsed query. `createSerializer` and
the engine use these functions. They are also available for custom link-building
or query-reading logic.

### parseQueryStates <Badge type="info" text="@vuqs/core" />

Parses selections from a query.

```ts
function parseQueryStates<TSchema extends QueryStateSchema>(schema: TSchema, query: ParsedQuery): QueryStateValues<TSchema>
```

**Parameters**

- `schema: TSchema`
  - The normalized param definitions, keyed by logical name.
- `query: ParsedQuery`
  - The parsed query object.

**Returns**

- `values: QueryStateValues<TSchema>`
  - Selections present in the query. Absent or invalid params are omitted; defaults are not resolved.

**Example**

```ts
import { codecs, defineQuerySchema, parseQueryStates } from '@vuqs/core'

const schema = defineQuerySchema({ q: codecs.string, page: codecs.integer.withDefault(1) })

parseQueryStates(schema, { q: 'phone', page: '2' })
// { q: 'phone', page: 2 }
```

### serializeQueryStates <Badge type="info" text="@vuqs/core" />

Serializes a value map into query keys.

```ts
function serializeQueryStates<TSchema extends QueryStateSchema>(schema: TSchema, values: QueryStateValues<TSchema>): ParsedQueryRaw
```

**Parameters**

- `schema: TSchema`
  - The normalized param definitions, keyed by logical name.
- `values: QueryStateValues<TSchema>`
  - The values keyed by logical param name.

**Returns**

- `query: ParsedQueryRaw`
  - A compacted nested query object. Apply `dropDefaults` first when default-valued params should be omitted.

**Example**

```ts
import { codecs, defineQuerySchema, serializeQueryStates } from '@vuqs/core'

const schema = defineQuerySchema({ q: codecs.string, page: codecs.integer.withDefault(1) })

serializeQueryStates(schema, { q: 'phone', page: 2 })
// { q: 'phone', page: '2' }
```

### buildQuery <Badge type="info" text="@vuqs/core" />

Replaces managed query keys with serialized values.

```ts
function buildQuery<TSchema extends QueryStateSchema>(schema: TSchema, currentQuery: ParsedQuery, values: QueryStateValues<TSchema>): ParsedQueryRaw
```

**Parameters**

- `schema: TSchema`
  - The normalized param definitions, keyed by logical name.
- `currentQuery: ParsedQuery`
  - The query to update.
- `values: QueryStateValues<TSchema>`
  - The values keyed by logical param name.

**Returns**

- `query: ParsedQueryRaw`
  - A new query preserving unmanaged params. Managed params absent from `values` are removed.

**Example**

```ts
import { codecs, defineQuerySchema, buildQuery } from '@vuqs/core'

const schema = defineQuerySchema({ q: codecs.string, page: codecs.integer.withDefault(1) })

buildQuery(schema, { q: 'old', page: '3', keep: 'yes' }, { q: 'phone' })
// { keep: 'yes', q: 'phone' }
```

### dropDefaults <Badge type="info" text="@vuqs/core" />

Filters values according to the schema's static defaults.

```ts
function dropDefaults<TSchema extends QueryStateSchema>(schema: TSchema, values: QueryStateValues<TSchema>): QueryStateValues<TSchema>
```

**Parameters**

- `schema: TSchema`
  - The normalized param definitions, keyed by logical name.
- `values: QueryStateValues<TSchema>`
  - The values keyed by logical param name.

**Returns**

- `values: QueryStateValues<TSchema>`
  - A new map without `undefined` values or values equal to a static default, unless the param disables `clearOnDefault`.

**Example**

```ts
import { codecs, defineQuerySchema, dropDefaults } from '@vuqs/core'

const schema = defineQuerySchema({ q: codecs.string, page: codecs.integer.withDefault(1) })

dropDefaults(schema, { q: 'phone', page: 1 })
// { q: 'phone' }
```

### getManagedKeys <Badge type="info" text="@vuqs/core" />

Lists the query paths declared by a schema.

```ts
function getManagedKeys<TSchema extends QueryStateSchema>(schema: TSchema): string[]
```

**Parameters**

- `schema: TSchema`
  - The normalized param definitions, keyed by logical name.

**Returns**

- `paths: string[]`
  - The query paths owned by the schema, in declaration order.

**Example**

```ts
import { codecs, defineQuerySchema, getManagedKeys } from '@vuqs/core'

const schema = defineQuerySchema({ q: codecs.string, page: codecs.integer.withDefault(1) })

getManagedKeys(schema)
// ['q', 'page']
```

### omitManagedKeys <Badge type="info" text="@vuqs/core" />

Removes the query keys owned by a schema.

```ts
function omitManagedKeys<TSchema extends QueryStateSchema>(schema: TSchema, query: ParsedQuery): ParsedQueryRaw
```

**Parameters**

- `schema: TSchema`
  - The normalized param definitions, keyed by logical name.
- `query: ParsedQuery`
  - The parsed query object.

**Returns**

- `query: ParsedQueryRaw`
  - A cloned query with managed keys removed. Only ancestors emptied by the removal are pruned; unmanaged params are preserved.

**Example**

```ts
import { codecs, defineQuerySchema, omitManagedKeys } from '@vuqs/core'

const schema = defineQuerySchema({ q: codecs.string, page: codecs.integer.withDefault(1) })

omitManagedKeys(schema, { q: 'phone', keep: 'yes' })
// { keep: 'yes' }
```

### assertUniquePaths <Badge type="info" text="@vuqs/core" />

Checks that params do not share query paths.

```ts
function assertUniquePaths<TSchema extends QueryStateSchema>(schema: TSchema): void
```

**Parameters**

- `schema: TSchema`
  - The normalized param definitions, keyed by logical name.

**Returns**

- `void`
  - Returns normally when paths are unique. Throws if two params declare the same query path.

**Example**

```ts
import { codecs, defineQuerySchema, assertUniquePaths } from '@vuqs/core'

const schema = defineQuerySchema({ q: codecs.string, page: codecs.integer.withDefault(1) })

assertUniquePaths(schema)
```

## Path helpers <Badge type="info" text="@vuqs/core" />

Dot-path query helpers and value readers for [custom codecs](/guide/codecs/custom).

### getPath <Badge type="info" text="@vuqs/core" />

Reads a query value at a dot-path.

```ts
function getPath(query: ParsedQuery, path: string): ParsedQueryValue
```

**Parameters**

- `query: ParsedQuery`
  - The parsed query object.
- `path: string`
  - The dot-path to read.

**Returns**

- `value: ParsedQueryValue`
  - The value at `path`, or `undefined` when it does not resolve.

**Example**

```ts
import { getPath } from '@vuqs/core'

getPath({ filters: { sort: 'name' } }, 'filters.sort')
// 'name'
```

### setPath <Badge type="info" text="@vuqs/core" />

Writes a query value at a dot-path.

```ts
function setPath(target: ParsedQueryRaw, path: string, value: ParsedQueryValue): ParsedQueryRaw
```

**Parameters**

- `target: ParsedQueryRaw`
  - The query object to mutate.
- `path: string`
  - The dot-path to write.
- `value: ParsedQueryValue`
  - The value to set.

**Returns**

- `query: ParsedQueryRaw`
  - The same target object, with intermediate objects created as needed. Unsafe prototype paths leave it unchanged.

**Example**

```ts
import { setPath } from '@vuqs/core'

setPath({}, 'filters.sort', 'name')
// { filters: { sort: 'name' } }
```

### deletePath <Badge type="info" text="@vuqs/core" />

Deletes a query key at a dot-path.

```ts
function deletePath(target: ParsedQueryRaw, path: string): void
```

**Parameters**

- `target: ParsedQueryRaw`
  - The query object to mutate.
- `path: string`
  - The dot-path to delete.

**Returns**

- `void`
  - Deletes the key in place, preserving siblings. Empty ancestors are not pruned.

**Example**

```ts
import { deletePath } from '@vuqs/core'

const query = { filters: { sort: 'name', category: 'books' } }
deletePath(query, 'filters.sort')
// query: { filters: { category: 'books' } }
```

### getQueryString <Badge type="info" text="@vuqs/core" />

Reads one non-empty string from a query value.

```ts
function getQueryString(value: ParsedQueryValue): string | undefined
```

**Parameters**

- `value: ParsedQueryValue`
  - A scalar or array query value.

**Returns**

- `value: string | undefined`
  - A non-empty string from the scalar value or first array item. Other values return `undefined`.

**Example**

```ts
import { getQueryString } from '@vuqs/core'

getQueryString(['phone', 'laptop']) // 'phone'
getQueryString('   ') // undefined
```

### getQueryStringArray <Badge type="info" text="@vuqs/core" />

Reads non-empty strings from a query value.

```ts
function getQueryStringArray(value: ParsedQueryValue): string[]
```

**Parameters**

- `value: ParsedQueryValue`
  - A scalar or array query value.

**Returns**

- `values: string[]`
  - Non-empty strings in order. Invalid items are dropped; an absent or invalid value returns `[]`.

**Example**

```ts
import { getQueryStringArray } from '@vuqs/core'

getQueryStringArray(['phone', '', 'laptop'])
// ['phone', 'laptop']
```

## structuralEq <Badge type="info" text="@vuqs/core" />

The deep structural comparison used as the default codec `eq`.

```ts
function structuralEq(a: unknown, b: unknown): boolean
```

**Parameters**

- `a: unknown`
  - The first value.
- `b: unknown`
  - The second value.

**Returns**

- `equal: boolean`
  - Whether the values are structurally equal.

**Example**

```ts
import { structuralEq } from '@vuqs/core'

structuralEq({ tags: ['vue'] }, { tags: ['vue'] }) // true
```

## createQueryStateEngine <Badge type="info" text="@vuqs/core" />

The reactive engine behind `useQueryState` and `useQueryStates`: atomic
transactions, the adapter-scoped optimistic overlay, reconciliation, write
coalescing, and navigation.

```ts
function createQueryStateEngine<TSchema extends QueryStateSchema>(options: QueryStateEngineOptions<TSchema>): QueryStateEngine<TSchema>
```

**Parameters**

- `options: QueryStateEngineOptions<TSchema>`
  - The schema, adapter, and resolved navigation, coalescing, and default behavior.
    See [`QueryStateEngineOptions`](/api/types#engine-types).

**Returns**

- `engine: QueryStateEngine<TSchema>`
  - The reactive reads, defaults, transaction-based query I/O, resolved options,
    pipeline, and debug channel facets a [module](/modules/authoring#the-core) receives.

Bindings using the same adapter share the optimistic overlay, write queue, and
transaction-start registry. The engine is exposed for building higher layers and
must run inside a Vue effect scope. See
[`QueryStateEngineOptions`](/api/types#engine-types).

**Example**

```ts
import { codecs, createQueryStateEngine, defineQuerySchema } from '@vuqs/core'
import { createTestingAdapter } from '@vuqs/core/adapters/testing'
import { effectScope } from 'vue'

const scope = effectScope()
const engine = scope.run(() => createQueryStateEngine({
  id: 'search',
  schema: defineQuerySchema({ q: codecs.string }),
  adapter: createTestingAdapter(),
  clearOnDefault: true,
}))

scope.stop()
```
