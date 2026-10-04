import type { Codec } from '../codecs/codec'
import type { DefinedQueryParam, DefinedQueryParamWithDefault } from './params/definition'
import { defineCodecQueryParam, isDefinedQueryParam } from './params/definition'

/**
 * A map of param name to its {@link DefinedQueryParam}.
 */
export type QueryStateSchema = Record<string, DefinedQueryParam<any>>

/**
 * A schema accepted by public APIs before normalization.
 */
export type QueryStateSchemaInput = Record<string, Codec<any> | DefinedQueryParam<any>>

/**
 * Normalizes a public schema input into executable defined query params.
 *
 * @typeParam TSchema - The input schema to normalize.
 * @param schema - The schema input.
 * @returns A schema whose values are all defined query params.
 */
export function normalizeQueryStateSchema<TSchema extends QueryStateSchemaInput>(
  schema: TSchema,
): NormalizeQueryStateSchema<TSchema> {
  const normalized: QueryStateSchema = {}

  for (const key of Object.keys(schema)) {
    const value = schema[key]

    normalized[key] = isDefinedQueryParam(value)
      ? value
      : defineCodecQueryParam(key, value)
  }

  return normalized as NormalizeQueryStateSchema<TSchema>
}

/**
 * Defines a reusable query-state schema, normalized to its canonical form.
 *
 * @typeParam TSchema - The schema input, keyed by logical param name.
 * @param schema - The params, each a `queryParam` definition or a bare {@link Codec}.
 * @returns The schema, normalized to {@link DefinedQueryParam} entries.
 * @example
 * ```ts
 * export const filters = defineQuerySchema({
 *   q: codecs.string,
 *   status: queryParam('status', codecs.literal(['open', 'closed'] as const)),
 * })
 *
 * const { values } = useQueryStates(filters)
 * type Filters = QueryStateValues<typeof filters>
 * ```
 */
export function defineQuerySchema<const TSchema extends QueryStateSchemaInput>(
  schema: TSchema,
): NormalizeQueryStateSchema<TSchema> {
  return normalizeQueryStateSchema(schema)
}

/**
 * The normalized schema type produced from a public schema input.
 */
export type NormalizeQueryStateSchema<TSchema extends QueryStateSchemaInput> = {
  [Key in keyof TSchema]: TSchema[Key] extends DefinedQueryParam<any>
    ? TSchema[Key]
    : TSchema[Key] extends Codec<infer TValue>
      ? TSchema[Key] extends { readonly defaultValue: infer TDefault }
        ? DefinedQueryParamWithDefault<TDefault>
        : DefinedQueryParam<TValue>
      : never
}

/**
 * Extracts the decoded value type from a single {@link DefinedQueryParam}.
 *
 * @typeParam TDefinition - The definition to read the value type from.
 */
export type QueryStateValueOf<TDefinition>
  = TDefinition extends DefinedQueryParam<infer TValue> ? TValue : never

/**
 * Extracts the decoded value type of one param in a schema, by key.
 *
 * @typeParam TSchema - The schema holding the param.
 * @typeParam TKey - The param key to read the value type from.
 */
export type QueryStateValueAt<TSchema extends QueryStateSchema, TKey extends string>
  = TSchema extends { [Key in TKey]: infer TDefinition }
    ? QueryStateValueOf<TDefinition>
    : never

/**
 * The value a param's reactive ref exposes: `T` when the param declares a
 * default, otherwise `T | undefined`.
 *
 * @typeParam TDefinition - The param definition to read the ref value type from.
 */
export type QueryStateRefValue<TDefinition extends DefinedQueryParam<any>>
  = TDefinition extends DefinedQueryParamWithDefault<any>
    ? QueryStateValueOf<TDefinition>
    : QueryStateValueOf<TDefinition> | undefined

/**
 * The value map for a schema, with every param optional.
 *
 * @typeParam TSchema - The schema whose params determine the value types.
 */
export type QueryStateValues<TSchema extends QueryStateSchema> = {
  [Key in keyof TSchema]?: QueryStateValueOf<TSchema[Key]> | undefined
}

/**
 * The partial write map for a schema: omit a param to preserve it, pass
 * `undefined` to clear it from the URL, or a value to set it.
 *
 * @typeParam TSchema - The schema whose params determine the value types.
 */
export type QueryStateWriteValues<TSchema extends QueryStateSchema> = {
  [Key in keyof TSchema]?: QueryStateValueOf<TSchema[Key]> | undefined
}

/**
 * Returns every query key the schema manages, across all params.
 *
 * @typeParam TSchema - The schema to inspect.
 * @param schema - The schema whose param paths are gathered.
 * @returns The managed query keys, gathered from each param's `paths` in
 * declaration order.
 */
export function getManagedKeys<TSchema extends QueryStateSchema>(schema: TSchema): string[] {
  return Object.values(schema).flatMap(definition => definition.paths)
}

/**
 * Asserts that no query path is declared by more than one param.
 *
 * @typeParam TSchema - The schema to validate.
 * @param schema - The schema to check.
 * @throws {Error} When a path is declared by more than one param.
 */
export function assertUniquePaths<TSchema extends QueryStateSchema>(schema: TSchema): void {
  const seen = new Set<string>()

  for (const key of Object.keys(schema)) {
    for (const path of schema[key].paths) {
      if (seen.has(path)) {
        throw new Error(`[vuqs] duplicate query path "${path}" declared by multiple params.`)
      }

      seen.add(path)
    }
  }
}
