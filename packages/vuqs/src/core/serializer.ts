import type { QueryStateSchema, QueryStateWriteValues } from './schema'
import type { ParsedQuery, ParsedQueryRaw } from './types'
import { deletePath, pruneEmptyAncestors } from './path'
import { cloneQuery, compactQuery, mergeQueries } from './query-object'

/**
 * Options for {@link createSerializer}.
 *
 * @remarks
 * `stringify` and `parse` are symmetric opt-ins: provide `stringify` to get a
 * string result instead of a query object, and provide `parse` to accept a
 * string base in addition to an object. The core stays agnostic of the wire
 * format, so the `qs`/`URLSearchParams` choice lives in these two hooks.
 */
export interface CreateSerializerOptions {
  /** Drop a value equal to its codec default. Defaults to `true`. */
  clearOnDefault?: boolean
  /** Turns the built query object into a string, for example `q => qs.stringify(q)`. Enables string output. */
  stringify?: (query: ParsedQueryRaw) => string
  /** Parses a base query string into an object, for example `s => qs.parse(s)`. Enables a string base. */
  parse?: (search: string) => ParsedQuery
}

/** Renders a built query object into a string, for example via `qs.stringify`. */
export type SerializerStringify = (query: ParsedQueryRaw) => string

/** Parses a base query string into an object, for example via `qs.parse`. */
export type SerializerParse = (search: string) => ParsedQuery

/**
 * A schema-bound serializer: turn values into a query, optionally merged over a
 * base and optionally rendered to a string.
 *
 * @typeParam TSchema - The schema describing the managed fields.
 * @typeParam TBase - The accepted base type: `ParsedQuery`, or `ParsedQuery | string` when `parse` is set.
 * @typeParam TOutput - The returned type: `ParsedQueryRaw`, or `string` when `stringify` is set.
 */
export interface Serializer<TSchema extends QueryStateSchema, TBase, TOutput> {
  /** Serializes `values` into a fresh query. */
  (values: QueryStateWriteValues<TSchema>): TOutput
  /** Merges `values` over `base`: untouched fields and unmanaged params are kept. */
  (base: TBase, values: QueryStateWriteValues<TSchema>): TOutput
}

/**
 * Creates a reusable serializer bound to a schema, for building URLs without
 * navigating, for example links, redirects, or SSR loaders.
 *
 * @remarks
 * Write semantics mirror the reactive writers: a field omitted from `values` (or
 * set to `undefined`) is left untouched, `null` clears it, and a value sets it.
 * Unmanaged params on the base are always preserved. With `clearOnDefault` (the
 * default), a written value equal to its codec default is dropped from the
 * result, while an untouched base field is kept even when it equals its default.
 *
 * Returns a query object by default; pass `stringify` to render a string. Accepts
 * an object base by default; pass `parse` to also accept a string base.
 *
 * @typeParam TSchema - The schema describing the managed fields.
 * @param schema - The fields to serialize, keyed by logical name.
 * @param options - Optional `clearOnDefault`, `stringify`, and `parse` hooks.
 * @returns A {@link Serializer} for the schema.
 * @throws {Error} When a string base is passed but no `parse` option was provided.
 *
 * @example
 * ```ts
 * const serialize = createSerializer(schema)
 * serialize({ q: 'lease' })                       // { q: 'lease' }
 * serialize(route.query, { page: 2 })             // patch over the current query
 * serialize(route.query, { currency: null })      // clear a field
 *
 * const toUrl = createSerializer(schema, { stringify: q => qs.stringify(q, { addQueryPrefix: true }) })
 * toUrl({ q: 'lease', page: 2 })                   // '?q=lease&page=2'
 * ```
 */
export function createSerializer<TSchema extends QueryStateSchema>(
  schema: TSchema,
  options: CreateSerializerOptions & { stringify: SerializerStringify, parse: SerializerParse },
): Serializer<TSchema, ParsedQuery | string, string>
export function createSerializer<TSchema extends QueryStateSchema>(
  schema: TSchema,
  options: CreateSerializerOptions & { stringify: SerializerStringify },
): Serializer<TSchema, ParsedQuery, string>
export function createSerializer<TSchema extends QueryStateSchema>(
  schema: TSchema,
  options: CreateSerializerOptions & { parse: SerializerParse },
): Serializer<TSchema, ParsedQuery | string, ParsedQueryRaw>
export function createSerializer<TSchema extends QueryStateSchema>(
  schema: TSchema,
  options?: CreateSerializerOptions,
): Serializer<TSchema, ParsedQuery, ParsedQueryRaw>
export function createSerializer<TSchema extends QueryStateSchema>(
  schema: TSchema,
  options: CreateSerializerOptions = {},
): Serializer<TSchema, ParsedQuery, ParsedQueryRaw | string> {
  const { clearOnDefault = true, stringify, parse } = options

  function serialize(
    ...args: [QueryStateWriteValues<TSchema>] | [ParsedQuery | string, QueryStateWriteValues<TSchema>]
  ): ParsedQueryRaw | string {
    const hasBase = args.length === 2
    const rawBase = hasBase ? args[0] : undefined
    const values = (hasBase ? args[1] : args[0]) as QueryStateWriteValues<TSchema>

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

      if (value === undefined) {
        continue
      }

      const definition = schema[key as keyof TSchema & string]

      for (const path of definition.paths) {
        deletePath(query, path)
      }

      for (const path of definition.paths) {
        pruneEmptyAncestors(query, path)
      }

      if (value === null) {
        continue
      }

      if (clearOnDefault && definition.defaultValue !== undefined && definition.eq(value, definition.defaultValue)) {
        continue
      }

      query = mergeQueries(query, compactQuery(definition.serialize(value)))
    }

    return stringify ? stringify(query) : query
  }

  return serialize as Serializer<TSchema, ParsedQuery, ParsedQueryRaw | string>
}
