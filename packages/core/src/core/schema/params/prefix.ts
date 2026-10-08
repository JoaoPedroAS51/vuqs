import type { ParsedQuery, ParsedQueryRaw } from '../../query/types'
import type { AnyDefinedQueryParam, DefinedValue, PrefixedQueryParamBuilder, QueryParamBuilder, QueryParamObjectBuilder } from './builder-types'
import type { DefinedQueryParam } from './definition'
import { collectLeafPaths, getPath, setPath } from '../../query/path'
import { createQueryParamBuilder } from './builder'

function isQueryParamBuilder(value: DefinedQueryParam<any>): value is QueryParamBuilder<any, any> {
  return typeof (value as QueryParamBuilder<any, any>).withDefault === 'function'
    && typeof (value as QueryParamBuilder<any, any>).withEquality === 'function'
}

/** @internal */
export function joinPath(prefix: string, path: string): string {
  return path ? `${prefix}.${path}` : prefix
}

/**
 * Extracts the requested paths from a prefixed query.
 *
 * @returns A new query using unprefixed paths, omitting undefined values.
 *
 * @internal
 */
export function unprefixQuery(query: ParsedQuery, prefix: string, paths: readonly string[]): ParsedQueryRaw {
  const result: ParsedQueryRaw = {}

  for (const path of paths) {
    const value = getPath(query, joinPath(prefix, path))

    if (value !== undefined) {
      setPath(result, path, value)
    }
  }

  return result
}

/** @internal */
export function prefixQuery(query: ParsedQueryRaw, prefix: string): ParsedQueryRaw {
  let result: ParsedQueryRaw = {}

  for (const path of collectLeafPaths(query)) {
    const value = getPath(query, path)

    if (value !== undefined) {
      result = setPath(result, joinPath(prefix, path), value)
    }
  }

  return result
}

/**
 * Prefixes a param's query paths.
 *
 * @returns A new builder preserving the wrapped param's value and modifier semantics.
 *
 * @internal
 */
export function createPrefixedQueryParam<TParam extends AnyDefinedQueryParam>(
  prefix: string,
  param: TParam,
): PrefixedQueryParamBuilder<TParam> {
  const base = createQueryParamBuilder<DefinedValue<TParam>>({
    paths: param.paths.map(path => joinPath(prefix, path)),
    read(query, context) {
      const prefixedContext = context === undefined
        ? undefined
        : {
            onInvalid: (path: string, raw: unknown) => context.onInvalid(joinPath(prefix, path), raw),
          }
      return param.read(unprefixQuery(query, prefix, param.paths), prefixedContext)
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
  const { withDefaultsWhenPresent } = param as Partial<
    Pick<QueryParamObjectBuilder<unknown>, 'withDefaultsWhenPresent'>
  >

  const prefixed = {
    ...base,
    withDefault: (defaultValue: unknown) => createPrefixedQueryParam(prefix, param.withDefault(defaultValue)),
    withEquality: (eq: (a: unknown, b: unknown) => boolean) => createPrefixedQueryParam(prefix, param.withEquality(eq)),
    keepOnDefault: () => createPrefixedQueryParam(prefix, param.keepOnDefault()),
    ...(typeof withDefaultsWhenPresent === 'function'
      ? { withDefaultsWhenPresent: () => createPrefixedQueryParam(prefix, withDefaultsWhenPresent()) }
      : {}),
  }

  return prefixed as PrefixedQueryParamBuilder<TParam>
}
