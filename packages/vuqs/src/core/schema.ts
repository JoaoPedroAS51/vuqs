import type { QueryStateDefinition, QueryStateDefinitionWithDefault } from './define-query-state'
import type { ParsedQuery, ParsedQueryRaw } from './types'
import { deletePath, pruneEmptyAncestors } from './path'
import { cloneQuery, compactQuery, mergeQueries } from './query-object'

/**
 * A map of field name to its {@link QueryStateDefinition}.
 *
 * @remarks
 * The keys are the logical names a consumer reads and writes. The query keys a
 * field owns live inside its definition, not in these map keys.
 */
export type QueryStateSchema = Record<string, QueryStateDefinition<any>>

/**
 * Extracts the decoded value type from a single {@link QueryStateDefinition}.
 *
 * @typeParam TDefinition - The definition to read the value type from.
 */
export type QueryStateValueOf<TDefinition>
  = TDefinition extends QueryStateDefinition<infer TValue> ? TValue : never

/**
 * The value a field's reactive ref exposes: `T` when the field declares a
 * default, otherwise `T | undefined`.
 *
 * @remarks
 * A defaulted field never reads back absent, so its ref drops `undefined`. This
 * mirrors the single-field {@link useQueryState} overloads at the schema level.
 *
 * @typeParam TDefinition - The field definition to read the ref value type from.
 */
export type QueryStateRefValue<TDefinition extends QueryStateDefinition<any>>
  = TDefinition extends QueryStateDefinitionWithDefault<any>
    ? QueryStateValueOf<TDefinition>
    : QueryStateValueOf<TDefinition> | undefined

/**
 * The value map for a schema, with every field optional.
 *
 * @remarks
 * Each field is optional because its value may be absent from the query.
 *
 * @typeParam TSchema - The schema whose fields determine the value types.
 */
export type QueryStateValues<TSchema extends QueryStateSchema> = {
  [Key in keyof TSchema]?: QueryStateValueOf<TSchema[Key]>
}

/**
 * Parses every field in a schema out of a parsed query object.
 *
 * @remarks
 * A field whose value is absent is omitted from the result rather than set to
 * `undefined`.
 *
 * @typeParam TSchema - The schema describing the fields to parse.
 * @param schema - The field definitions to parse with.
 * @param query - The parsed query object to read from.
 * @returns A value map holding only the fields present in `query`.
 */
export function parseQueryStates<TSchema extends QueryStateSchema>(
  schema: TSchema,
  query: ParsedQuery,
): QueryStateValues<TSchema> {
  const values: QueryStateValues<TSchema> = {}

  for (const key of keysOf(schema)) {
    const value = schema[key].parse(query)

    if (value !== undefined) {
      values[key] = value as QueryStateValues<TSchema>[typeof key]
    }
  }

  return values
}

/**
 * Serializes a value map into a nested query object.
 *
 * @remarks
 * Pass selected values only: a field equal to its default should be omitted so
 * the default does not reach the URL. Fields with an absent value are skipped,
 * and each remaining field's keys are merged into the result. The result is
 * compacted, so a field that serializes to a blank or empty value leaves no key.
 *
 * @typeParam TSchema - The schema describing the fields to serialize.
 * @param schema - The field definitions to serialize with.
 * @param values - The values to write, keyed by field name.
 * @returns A compacted query object combining the keys of every present field.
 */
export function serializeQueryStates<TSchema extends QueryStateSchema>(
  schema: TSchema,
  values: QueryStateValues<TSchema>,
): ParsedQueryRaw {
  let query: ParsedQueryRaw = {}

  for (const key of keysOf(schema)) {
    const value = values[key]

    if (value !== undefined) {
      query = mergeQueries(query, schema[key].serialize(value))
    }
  }

  return compactQuery(query)
}

/**
 * Returns every query key the schema manages, across all fields.
 *
 * @typeParam TSchema - The schema to inspect.
 * @param schema - The schema whose field paths are gathered.
 * @returns The managed query keys, gathered from each field's `paths` in
 * field-declaration order.
 */
export function getManagedKeys<TSchema extends QueryStateSchema>(schema: TSchema): string[] {
  return Object.values(schema).flatMap(definition => definition.paths)
}

/**
 * Removes every key the schema manages from a query, leaving unmanaged siblings
 * untouched.
 *
 * @remarks
 * Operates on a clone, so the input `query` is not mutated. Only ancestor
 * objects left empty by the removal are pruned; unmanaged params (including
 * empty ones) are preserved untouched.
 *
 * @typeParam TSchema - The schema describing which keys to remove.
 * @param schema - The schema whose managed keys are removed.
 * @param query - The query to remove managed keys from.
 * @returns A new query with managed keys removed and ancestor objects left empty
 * by the removal pruned.
 */
export function omitManagedKeys<TSchema extends QueryStateSchema>(
  schema: TSchema,
  query: ParsedQuery,
): ParsedQueryRaw {
  const next = cloneQuery(query)
  const managedKeys = getManagedKeys(schema)

  for (const key of managedKeys) {
    deletePath(next, key)
  }

  for (const key of managedKeys) {
    pruneEmptyAncestors(next, key)
  }

  return next
}

/**
 * Builds the next query after a schema's values change.
 *
 * @remarks
 * Strips every managed key from `currentQuery`, then writes `values` back.
 * Unmanaged params are preserved, and a managed key absent from `values` is
 * dropped.
 *
 * @typeParam TSchema - The schema describing the managed fields.
 * @param schema - The field definitions.
 * @param currentQuery - The query to update.
 * @param values - The new values for the schema's fields.
 * @returns A new query merging the preserved unmanaged params with the
 * serialized values.
 */
export function buildQuery<TSchema extends QueryStateSchema>(
  schema: TSchema,
  currentQuery: ParsedQuery,
  values: QueryStateValues<TSchema>,
): ParsedQueryRaw {
  return mergeQueries(omitManagedKeys(schema, currentQuery), serializeQueryStates(schema, values))
}

/**
 * Drops fields whose value equals their codec default, so a default never
 * reaches the URL.
 *
 * @remarks
 * Absent (`undefined`) fields are dropped too. A field with no default, or whose
 * value differs from its default, is kept. This is the `clearOnDefault` rule as a
 * reusable function, so a caller building a query without the reactive engine,
 * for example to render a link, applies it identically.
 *
 * @typeParam TSchema - The schema describing the fields.
 * @param schema - The field definitions, used for per-field equality and defaults.
 * @param values - The values to filter.
 * @returns A new value map without absent or default-valued fields.
 */
export function dropDefaults<TSchema extends QueryStateSchema>(
  schema: TSchema,
  values: QueryStateValues<TSchema>,
): QueryStateValues<TSchema> {
  const result: QueryStateValues<TSchema> = {}

  for (const key of keysOf(schema)) {
    const value = values[key]

    if (value === undefined) {
      continue
    }

    const definition = schema[key]

    if (definition.defaultValue !== undefined && definition.eq(value, definition.defaultValue)) {
      continue
    }

    result[key] = value
  }

  return result
}

/**
 * Returns a schema's field names typed as a string-key array.
 *
 * @internal
 */
function keysOf<TSchema extends QueryStateSchema>(schema: TSchema): Array<keyof TSchema & string> {
  return Object.keys(schema) as Array<keyof TSchema & string>
}

/**
 * Asserts that no query path is declared by more than one field.
 *
 * @remarks
 * Two fields sharing a path would let their reads and writes silently collide,
 * with the last write winning, so this fails loudly instead.
 *
 * @typeParam TSchema - The schema to validate.
 * @param schema - The schema to check.
 * @throws {Error} When a path is declared by more than one field.
 */
export function assertUniquePaths<TSchema extends QueryStateSchema>(schema: TSchema): void {
  const seen = new Set<string>()

  for (const key of Object.keys(schema)) {
    for (const path of schema[key].paths) {
      if (seen.has(path)) {
        throw new Error(`[vuqs] duplicate query path "${path}" declared by multiple fields.`)
      }

      seen.add(path)
    }
  }
}
