import type { Codec } from '../codecs/codec'
import type { ContributionOf, ExplicitValueOf, GuaranteedOf, ResolvedValueOf } from './params/builder-types'
import type { AnyDefinedQueryParam, DefinedQueryParam } from './params/definition'
import { defineCodecQueryParam, isDefinedQueryParam } from './params/definition'

/**
 * A map of param name to its {@link DefinedQueryParam}.
 */
export type QueryStateSchema = Record<string, AnyDefinedQueryParam>

/**
 * A schema accepted by public APIs before normalization.
 */
export type QueryStateSchemaInput = Record<string, Codec<any> | AnyDefinedQueryParam>

/**
 * The normalized schema type produced from a public schema input.
 */
export type NormalizeQueryStateSchema<TSchema extends QueryStateSchemaInput> = {
  [Key in keyof TSchema]: TSchema[Key] extends AnyDefinedQueryParam
    ? TSchema[Key]
    : TSchema[Key] extends Codec<infer TValue>
      ? TSchema[Key] extends { readonly defaultValue: TValue }
        ? DefinedQueryParam<TValue, TValue, TValue, true>
        : DefinedQueryParam<TValue, TValue, TValue, false>
      : never
}

/**
 * Extracts the explicit value type from a single {@link DefinedQueryParam}: the
 * decoded value before default resolution.
 *
 * @typeParam TDefinition - The definition to read the value type from.
 */
export type QueryStateValueOf<TDefinition> = ExplicitValueOf<TDefinition>

/**
 * Extracts the explicit value type of one param in a schema, by key.
 *
 * @typeParam TSchema - The schema holding the param.
 * @typeParam TKey - The param key to read the value type from.
 */
export type QueryStateValueAt<TSchema extends QueryStateSchema, TKey extends string>
  = TSchema extends { [Key in TKey]: infer TDefinition }
    ? QueryStateValueOf<TDefinition>
    : never

/**
 * Extracts the default contribution type of one param in a schema, by key.
 *
 * @typeParam TSchema - The schema holding the param.
 * @typeParam TKey - The param key to read the contribution type from.
 */
export type QueryStateContributionAt<TSchema extends QueryStateSchema, TKey extends string>
  = TSchema extends { [Key in TKey]: infer TDefinition }
    ? ContributionOf<TDefinition>
    : never

/**
 * The value a param's reactive read exposes: the resolved value, which also
 * permits `undefined` unless an applicable static default guarantees presence.
 *
 * @typeParam TDefinition - The param definition to read the value type from.
 */
export type QueryStateRefValue<TDefinition extends AnyDefinedQueryParam>
  = [GuaranteedOf<TDefinition>] extends [true]
    ? ResolvedValueOf<TDefinition>
    : ResolvedValueOf<TDefinition> | undefined

/**
 * The value type a param's reactive write accepts: the explicit value, which also
 * permits `undefined` exactly when the param's base read type does, before module effects.
 *
 * @typeParam TDefinition - The param definition to read the value type from.
 */
export type QueryStateRefInput<TDefinition extends AnyDefinedQueryParam>
  = [GuaranteedOf<TDefinition>] extends [true]
    ? ExplicitValueOf<TDefinition>
    : ExplicitValueOf<TDefinition> | undefined

/**
 * The explicit value map for a schema, with every param optional. Composed params
 * keep their defaulted children optional.
 *
 * @typeParam TSchema - The schema whose params determine the value types.
 */
export type QueryStateValues<TSchema extends QueryStateSchema> = {
  [Key in keyof TSchema]?: ExplicitValueOf<TSchema[Key]> | undefined
}

/**
 * The resolved value map for a schema: values after applicable defaults, with
 * every param optional.
 *
 * @typeParam TSchema - The schema whose params determine the value types.
 */
export type QueryStateResolvedValues<TSchema extends QueryStateSchema> = {
  [Key in keyof TSchema]?: ResolvedValueOf<TSchema[Key]> | undefined
}

/**
 * The default contribution map for a schema: recursively partial through declared
 * object children, with whole values for atomic params.
 *
 * @typeParam TSchema - The schema whose params determine the contribution types.
 */
export type QueryStateContributions<TSchema extends QueryStateSchema> = {
  [Key in keyof TSchema]?: ContributionOf<TSchema[Key]> | undefined
}

/**
 * An explicit write-value map with optional schema params. The writer determines
 * whether omitted params are preserved or cleared; `undefined` clears a param.
 *
 * @typeParam TSchema - The schema whose params determine the value types.
 */
export type QueryStateWriteValues<TSchema extends QueryStateSchema> = QueryStateValues<TSchema>

/**
 * Defines a reusable query-state schema, normalized to its canonical form.
 *
 * @typeParam TSchema - The schema input, keyed by logical param name.
 * @param schema - The params, each a `queryParam` definition or a bare {@link Codec}.
 * @returns The schema, normalized to {@link DefinedQueryParam} entries.
 *
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
