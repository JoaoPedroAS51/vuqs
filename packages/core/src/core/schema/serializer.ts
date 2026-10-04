import type { ParsedQuery, ParsedQueryRaw } from '../query/types'
import type { NormalizeQueryStateSchema, QueryStateSchema, QueryStateSchemaInput, QueryStateWriteValues } from './schema'
import { emitDebug, globalDebugChannel, isDebugArmed } from '../diagnostics/bus'
import { cloneQuery, compactQuery, mergeQueries } from '../query/object'
import { deletePath, pruneEmptyAncestors } from '../query/path'
import { normalizeQueryStateSchema } from './schema'

/**
 * Options for {@link createSerializer}.
 */
export interface CreateSerializerOptions {
  /** Drop a value equal to its codec default. Defaults to `true`. */
  clearOnDefault?: boolean
  /** Turns the built query object into a string, for example `q => qs.stringify(q)`. Enables string output. */
  stringify?: (query: ParsedQueryRaw) => string
  /** Parses a base query string into an object, for example `s => qs.parse(s)`. Enables a string base. */
  parse?: (search: string) => ParsedQuery
}

type SerializerSchema<TSchema extends QueryStateSchemaInput> = NormalizeQueryStateSchema<TSchema>

/** Renders a built query object into a string, for example via `qs.stringify`. */
export type SerializerStringify = (query: ParsedQueryRaw) => string

/** Parses a base query string into an object, for example via `qs.parse`. */
export type SerializerParse = (search: string) => ParsedQuery

/**
 * A schema-bound serializer: turn values into a query, optionally merged over a
 * base and optionally rendered to a string.
 *
 * @typeParam TSchema - The schema describing the managed params.
 * @typeParam TBase - The accepted base type: `ParsedQuery`, or `ParsedQuery | string` when `parse` is set.
 * @typeParam TOutput - The returned type: `ParsedQueryRaw`, or `string` when `stringify` is set.
 */
export interface Serializer<TSchema extends QueryStateSchema, TBase, TOutput> {
  /** Serializes `values` into a fresh query. */
  (values: QueryStateWriteValues<TSchema>): TOutput
  /** Merges `values` over `base`: untouched managed params and unmanaged params are kept. */
  (base: TBase, values: QueryStateWriteValues<TSchema>): TOutput
}

/**
 * Creates a reusable serializer bound to a schema, for building URLs without
 * navigating, for example links, redirects, or SSR loaders.
 *
 * @typeParam TSchema - The schema describing the managed params.
 * @param schema - The params to serialize, keyed by logical name.
 * @param options - Optional `clearOnDefault`, `stringify`, and `parse` hooks.
 * @returns A {@link Serializer} for the schema.
 * @throws {Error} When a string base is passed but no `parse` option was provided.
 *
 * @see https://vuqs.dev/guide/going-further/serializer
 * @example
 * ```ts
 * const serialize = createSerializer(schema)
 * serialize({ q: 'phone' })                       // { q: 'phone' }
 * serialize(route.query, { page: 2 })             // patch over the current query
 * serialize(route.query, { currency: undefined }) // clear a param
 *
 * const toUrl = createSerializer(schema, { stringify: q => qs.stringify(q, { addQueryPrefix: true }) })
 * toUrl({ q: 'phone', page: 2 })                   // '?q=phone&page=2'
 * ```
 */
export function createSerializer<TSchema extends QueryStateSchemaInput>(
  schema: TSchema,
  options: CreateSerializerOptions & { stringify: SerializerStringify, parse: SerializerParse },
): Serializer<SerializerSchema<TSchema>, ParsedQuery | string, string>

export function createSerializer<TSchema extends QueryStateSchemaInput>(
  schema: TSchema,
  options: CreateSerializerOptions & { stringify: SerializerStringify },
): Serializer<SerializerSchema<TSchema>, ParsedQuery, string>

export function createSerializer<TSchema extends QueryStateSchemaInput>(
  schema: TSchema,
  options: CreateSerializerOptions & { parse: SerializerParse },
): Serializer<SerializerSchema<TSchema>, ParsedQuery | string, ParsedQueryRaw>

export function createSerializer<TSchema extends QueryStateSchemaInput>(
  schema: TSchema,
  options?: CreateSerializerOptions,
): Serializer<SerializerSchema<TSchema>, ParsedQuery, ParsedQueryRaw>

export function createSerializer<TSchema extends QueryStateSchemaInput>(
  schema: TSchema,
  options: CreateSerializerOptions = {},
): Serializer<SerializerSchema<TSchema>, ParsedQuery, ParsedQueryRaw | string> {
  const { clearOnDefault, stringify, parse } = options
  const normalizedSchema = normalizeQueryStateSchema(schema)

  function serialize(
    ...args:
      | [QueryStateWriteValues<SerializerSchema<TSchema>>]
      | [ParsedQuery | string, QueryStateWriteValues<SerializerSchema<TSchema>>]
  ): ParsedQueryRaw | string {
    const hasBase = args.length === 2
    const rawBase = hasBase ? args[0] : undefined
    const values = (hasBase ? args[1] : args[0]) as QueryStateWriteValues<SerializerSchema<TSchema>>

    let base: ParsedQuery
    if (rawBase === undefined) {
      base = {}
    }
    else if (typeof rawBase === 'string') {
      if (!parse) {
        throw new Error('[vuqs] createSerializer: a string base requires the `parse` option.')
      }

      base = parse(rawBase)
    }
    else {
      base = rawBase
    }

    let query = cloneQuery(base) as ParsedQueryRaw

    for (const key of Object.keys(values)) {
      const value = (values as Record<string, unknown>)[key]

      const definition = normalizedSchema[key as keyof SerializerSchema<TSchema> & string]

      for (const path of definition.paths) {
        deletePath(query, path)
      }

      for (const path of definition.paths) {
        pruneEmptyAncestors(query, path)
      }

      if (value === undefined) {
        continue
      }

      const shouldClearOnDefault = clearOnDefault ?? definition.clearOnDefault ?? true

      if (shouldClearOnDefault && definition.defaultValue !== undefined && definition.eq(value, definition.defaultValue)) {
        emitDebug(globalDebugChannel, 'serializer:clear-on-default', { key })
        continue
      }

      query = mergeQueries(query, compactQuery(definition.write(value)))
    }

    if (isDebugArmed(globalDebugChannel)) {
      emitDebug(globalDebugChannel, 'serializer:build', { query: cloneQuery(query) })
    }

    return stringify ? stringify(query) : query
  }

  return serialize as Serializer<SerializerSchema<TSchema>, ParsedQuery, ParsedQueryRaw | string>
}
