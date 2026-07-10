import type {
  AnyDefinedQueryParam,
  AnyObjectChildren,
  DefinedValue,
  ObjectValue,
  PrefixedQueryParamBuilder,
  QueryParamObjectBuilder,
  QueryParamObjectBuilderFor,
  QueryParamObjectDefault,
} from './query-param-types'
import type { NormalizeQueryStateSchema, QueryStateSchemaInput } from './schema'
import type { ParsedQueryRaw } from './types'
import { structuralClone } from './equality'
import { getPath } from './path'
import { compactQuery, mergeQueries } from './query-object'
import { createQueryParamBuilder } from './query-param-builder'
import { isDefinedQueryParam, isQueryParamBuilder, joinPath, prefixQuery, unprefixQuery } from './query-param-utils'
import { normalizeQueryStateSchema } from './schema'

interface ObjectBuilderOptions<TChildren extends AnyObjectChildren> {
  prefix?: string
  children: TChildren
  defaultValue?: Partial<ObjectValue<TChildren>>
  eq?: (a: ObjectValue<TChildren>, b: ObjectValue<TChildren>) => boolean
  clearOnDefault?: boolean
  defaultsWhenPresent?: boolean
}

/**
 * Composes a multi-key param from child params, optionally under a prefix.
 *
 * @remarks
 * Passing a child map builds an object param whose value merges the children.
 * Passing a `prefix` with a child map prefixes every child key. Passing a
 * `prefix` with an existing param or object reuses it under the prefix,
 * preserving its default and presence semantics.
 */
export interface QueryParamObjectFactory {
  /** Builds an object param from a child map. */
  <TChildren extends QueryStateSchemaInput>(
    children: TChildren,
  ): QueryParamObjectBuilderFor<NormalizeQueryStateSchema<TChildren>>
  /** Builds an object param, prefixing every child key with `prefix`. */
  <TChildren extends QueryStateSchemaInput>(
    prefix: string,
    children: TChildren,
  ): QueryParamObjectBuilderFor<NormalizeQueryStateSchema<TChildren>>
  /** Reuses an existing param or object under `prefix`. */
  <TParam extends AnyDefinedQueryParam>(
    prefix: string,
    param: TParam,
  ): PrefixedQueryParamBuilder<TParam>
}

export function createObjectQueryParam<TChildren extends AnyObjectChildren>(
  options: ObjectBuilderOptions<TChildren>,
): QueryParamObjectBuilderFor<TChildren> {
  const children = prefixChildren(options.prefix, normalizeQueryStateSchema(options.children) as TChildren)
  const paths = Object.values(children).flatMap(child => child.paths)
  const mergedDefault = buildObjectDefault(children, options.defaultValue)
  // With defaultsWhenPresent and no object-level default, the object is presence
  // gated: it materializes only while present in the URL, so an absent object stays
  // absent even under a default layer (codec or a registered runtime default),
  // instead of resolving to its child defaults.
  const presenceGated = Boolean(options.defaultsWhenPresent) && options.defaultValue === undefined
  const defaultValue = presenceGated ? undefined : mergedDefault

  const childKeys = Object.keys(children) as Array<keyof ObjectValue<TChildren>>

  const builder = createQueryParamBuilder<ObjectValue<TChildren>, QueryParamObjectDefault<ObjectValue<TChildren>>>({
    paths,
    // A pure selection: only the URL-present children, no default fill. Defaults
    // resolve in `resolve`, in the engine's default layer.
    read(query) {
      const hasUrlPresence = paths.some(path => getPath(query, path) !== undefined)

      if (!hasUrlPresence) {
        return undefined
      }

      const value: Record<string, unknown> = {}
      let hasValue = false

      for (const key of childKeys) {
        const childValue = children[key].read(query)

        if (childValue !== undefined) {
          value[key] = childValue
          hasValue = true
        }
      }

      return hasValue ? value as ObjectValue<TChildren> : undefined
    },
    write(value) {
      let query: ParsedQueryRaw = {}

      for (const key of Object.keys(children) as Array<keyof TChildren & string>) {
        const childValue = value[key as keyof ObjectValue<TChildren>]

        if (childValue !== undefined) {
          query = mergeQueries(query, children[key].write(childValue))
        }
      }

      return compactQuery(query)
    },
    eq: options.eq,
    // Composes a present object over its resolved default: each child takes its
    // selection, else the layered default (a runtime default reaches the gap), else
    // the object's own static child/object-level default, cloned so a mutation cannot
    // corrupt the shared default. Absence is handled by the engine.
    resolve(selection, defaults) {
      const value: Record<string, unknown> = {}

      for (const key of childKeys) {
        const childSelection = selection[key]

        if (childSelection !== undefined) {
          value[key] = childSelection
          continue
        }

        const fallback = (defaults as Record<string, unknown> | undefined)?.[key as string] ?? mergedDefault?.[key]

        if (fallback !== undefined) {
          value[key] = structuralClone(fallback)
        }
      }

      return value as ObjectValue<TChildren>
    },
    defaultValue: defaultValue as ObjectValue<TChildren> | undefined,
    clearOnDefault: options.clearOnDefault,
    presenceGated,
  })

  return {
    ...builder,
    withDefault(defaultValue: QueryParamObjectDefault<ObjectValue<TChildren>>) {
      return createObjectQueryParam({
        ...options,
        defaultValue: defaultValue as Partial<ObjectValue<TChildren>>,
      })
    },
    withEquality(eq: (a: ObjectValue<TChildren>, b: ObjectValue<TChildren>) => boolean) {
      return createObjectQueryParam({
        ...options,
        eq,
      })
    },
    withDefaultsWhenPresent() {
      return createObjectQueryParam({
        ...options,
        defaultsWhenPresent: true,
      })
    },
    keepOnDefault() {
      return createObjectQueryParam({
        ...options,
        clearOnDefault: false,
      })
    },
  } as QueryParamObjectBuilderFor<TChildren>
}

export function createPrefixedQueryParam<TParam extends AnyDefinedQueryParam>(
  prefix: string,
  param: TParam,
): PrefixedQueryParamBuilder<TParam> {
  const base = createQueryParamBuilder<DefinedValue<TParam>>({
    paths: param.paths.map(path => joinPath(prefix, path)),
    read(query) {
      return param.read(unprefixQuery(query, prefix, param.paths))
    },
    write(value) {
      return prefixQuery(param.write(value), prefix)
    },
    eq: param.eq,
    // A prefix only rewrites paths, not the value; delegate value-space composition
    // to the wrapped param.
    resolve: param.resolve,
    defaultValue: param.defaultValue,
    clearOnDefault: param.clearOnDefault,
    presenceGated: param.presenceGated,
  })

  if (!isQueryParamBuilder(param)) {
    return base as PrefixedQueryParamBuilder<TParam>
  }

  // Modifiers delegate to the wrapped builder and re-prefix, so the wrapped
  // param's own semantics (an object's partial default merge, its presence
  // gating) survive prefixing instead of degrading to plain replacement.
  const prefixed: Record<string, unknown> = {
    ...base,
    withDefault: (defaultValue: unknown) => createPrefixedQueryParam(prefix, param.withDefault(defaultValue)),
    withEquality: (eq: (a: unknown, b: unknown) => boolean) => createPrefixedQueryParam(prefix, param.withEquality(eq)),
    keepOnDefault: () => createPrefixedQueryParam(prefix, param.keepOnDefault()),
  }
  const withDefaultsWhenPresent = (param as unknown as Partial<QueryParamObjectBuilder<unknown>>).withDefaultsWhenPresent

  if (typeof withDefaultsWhenPresent === 'function') {
    prefixed.withDefaultsWhenPresent = () => createPrefixedQueryParam(prefix, withDefaultsWhenPresent())
  }

  return prefixed as unknown as PrefixedQueryParamBuilder<TParam>
}

export const createObjectQueryParamFromArgs: QueryParamObjectFactory = ((
  prefixOrChildren: string | AnyObjectChildren,
  childrenOrParam?: AnyObjectChildren | AnyDefinedQueryParam,
): AnyDefinedQueryParam => {
  if (typeof prefixOrChildren !== 'string') {
    return createObjectQueryParam({ children: prefixOrChildren })
  }

  if (childrenOrParam === undefined) {
    throw new Error('[vuqs] queryParam.object(prefix, children) requires children.')
  }

  return isDefinedQueryParam(childrenOrParam)
    ? createPrefixedQueryParam(prefixOrChildren, childrenOrParam)
    : createObjectQueryParam({ prefix: prefixOrChildren, children: childrenOrParam })
}) as QueryParamObjectFactory

function prefixChildren<TChildren extends AnyObjectChildren>(
  prefix: string | undefined,
  children: TChildren,
): TChildren {
  if (!prefix) {
    return children
  }

  const prefixed: Record<string, AnyDefinedQueryParam> = {}

  for (const key of Object.keys(children)) {
    prefixed[key] = createPrefixedQueryParam(prefix, children[key])
  }

  return prefixed as TChildren
}

// Child defaults win over the object-level default, so the merged result is the
// same object `read` resolves when the URL holds no child key.
function buildObjectDefault<TChildren extends AnyObjectChildren>(
  children: TChildren,
  defaultValue: Partial<ObjectValue<TChildren>> | undefined,
): Partial<ObjectValue<TChildren>> | undefined {
  const result: Record<string, unknown> = { ...defaultValue }
  let hasDefault = defaultValue !== undefined

  for (const key of Object.keys(children)) {
    const childDefault = children[key].defaultValue

    if (childDefault !== undefined) {
      result[key] = childDefault
      hasDefault = true
    }
  }

  return hasDefault ? result as Partial<ObjectValue<TChildren>> : undefined
}
