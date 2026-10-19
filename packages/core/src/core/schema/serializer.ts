import type { ParsedQuery, ParsedQueryRaw } from '../query/types'
import type { NormalizeQueryStateSchema, QueryStateSchema, QueryStateSchemaInput, QueryStateWriteValues } from './schema'
import { emitDebug, globalDebugChannel, isDebugArmed } from '../diagnostics/bus'
import { cloneQuery, compactQuery, mergeQueries } from '../query/object'
import { deletePath, pruneEmptyAncestors } from '../query/path'
import { createStaticOmissionEvaluator, prepareDefaultOmission } from './default-elision'
import { normalizeQueryStateSchema } from './schema'

/**
 * Options for {@link createSerializer}.
 */
export interface CreateSerializerOptions {
  /**
   * Allows values equal to their static defaults to omit their URL representation
   * when the complete static read is preserved. Overrides the param setting.
   *
   * @default The param setting, or `true`.
   */
  clearOnDefault?: boolean
  /**
   * Formats the built query as a string.
   *
   * @example
   * ```ts
   * stringify: query => qs.stringify(query)
   * ```
   */
  stringify?: (query: ParsedQueryRaw) => string
  /**
   * Parses a base query string.
   *
   * @example
   * ```ts
   * parse: search => qs.parse(search)
   * ```
   */
  parse?: (search: string) => ParsedQuery
}

type SerializerSchema<TSchema extends QueryStateSchemaInput> = NormalizeQueryStateSchema<TSchema>

/** Formats a built query object as a string. */
export type SerializerStringify = (query: ParsedQueryRaw) => string

/** Parses a base query string into an object. */
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
  /**
   * Serializes `values`.
   *
   * @returns A new query object, or its string representation when `stringify` is configured.
   */
  (values: QueryStateWriteValues<TSchema>): TOutput
  /**
   * Merges `values` over `base`, preserving untouched params.
   *
   * @returns A new merged query object, or its string representation when `stringify` is configured.
   * @throws {Error} When a string base is passed but no `parse` option was provided.
   */
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
 *
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
 *
 * @see https://vuqs.dev/guide/query-state/building-urls
 */
export function createSerializer<TSchema extends QueryStateSchemaInput>(
  schema: TSchema,
  options: CreateSerializerOptions & { stringify: SerializerStringify, parse: SerializerParse },
): Serializer<SerializerSchema<TSchema>, ParsedQuery | string, string>

/**
 * Creates a schema-bound serializer with string output and object bases.
 *
 * @returns A serializer that uses static defaults and the supplied `stringify` function.
 */
export function createSerializer<TSchema extends QueryStateSchemaInput>(
  schema: TSchema,
  options: CreateSerializerOptions & { stringify: SerializerStringify },
): Serializer<SerializerSchema<TSchema>, ParsedQuery, string>

/**
 * Creates a schema-bound serializer accepting object or string bases.
 *
 * @returns A serializer that uses static defaults and produces query objects.
 */
export function createSerializer<TSchema extends QueryStateSchemaInput>(
  schema: TSchema,
  options: CreateSerializerOptions & { parse: SerializerParse },
): Serializer<SerializerSchema<TSchema>, ParsedQuery | string, ParsedQueryRaw>

/**
 * Creates a schema-bound serializer with query-object output.
 *
 * @returns A serializer that uses static defaults and preserves omitted params in its base.
 */
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
  const staticEvaluator = createStaticOmissionEvaluator(normalizedSchema)

  const serialize = (
    ...args:
      | [QueryStateWriteValues<SerializerSchema<TSchema>>]
      | [ParsedQuery | string, QueryStateWriteValues<SerializerSchema<TSchema>>]
  ): ParsedQueryRaw | string => {
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
    const requested: Array<keyof SerializerSchema<TSchema> & string> = []

    for (const key of Object.keys(values) as Array<keyof SerializerSchema<TSchema> & string>) {
      const value = (values as Record<string, unknown>)[key]
      const definition = normalizedSchema[key]

      for (const path of definition.paths) {
        deletePath(query, path)
      }

      for (const path of definition.paths) {
        pruneEmptyAncestors(query, path)
      }

      if (value === undefined) {
        continue
      }

      query = mergeQueries(query, compactQuery(definition.write(value)))

      if (clearOnDefault ?? definition.clearOnDefault ?? true) {
        requested.push(key)
      }
    }

    const omission = prepareDefaultOmission(normalizedSchema, requested, query, staticEvaluator)

    if (omission !== undefined) {
      for (const key of omission.keys) {
        emitDebug(globalDebugChannel, 'serializer:clear-on-default', { key })
      }
      query = omission.query
    }

    if (isDebugArmed(globalDebugChannel)) {
      emitDebug(globalDebugChannel, 'serializer:build', { query: cloneQuery(query) })
    }

    return stringify ? stringify(query) : query
  }

  return serialize as Serializer<SerializerSchema<TSchema>, ParsedQuery, ParsedQueryRaw | string>
}
