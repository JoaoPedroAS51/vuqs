import type { ParsedQuery, ParsedQueryRaw } from '../../query/types'
import type { PrefixedQueryParamBuilder } from './builder-types'
import type { AnyDefinedQueryParam } from './definition'
import { collectLeafPaths, getPath, setPath } from '../../query/path'
import { createQueryParamBuilder } from './builder'
import { getParamStructure } from './definition'

interface ModifierSurface {
  withDefault: (defaultValue: unknown) => AnyDefinedQueryParam
  withEquality: (eq: (a: unknown, b: unknown) => boolean) => AnyDefinedQueryParam
  keepOnDefault: () => AnyDefinedQueryParam
  withDefaultsWhenPresent?: () => AnyDefinedQueryParam
}

function hasModifiers(value: AnyDefinedQueryParam): value is AnyDefinedQueryParam & ModifierSurface {
  return typeof (value as Partial<ModifierSurface>).withDefault === 'function'
    && typeof (value as Partial<ModifierSurface>).withEquality === 'function'
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
 * A prefix rewrites paths only. The wrapped param's declared structure, default
 * candidate and presence gate carry over unchanged.
 *
 * @returns A new builder preserving the wrapped param's value and modifier semantics.
 *
 * @internal
 */
export function createPrefixedQueryParam<TParam extends AnyDefinedQueryParam>(
  prefix: string,
  param: TParam,
): PrefixedQueryParamBuilder<TParam>
export function createPrefixedQueryParam(prefix: string, param: AnyDefinedQueryParam): AnyDefinedQueryParam {
  const base = createQueryParamBuilder<unknown, unknown, boolean>({
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
    resolve: param.resolve,
    defaultValue: param.defaultValue,
    clearOnDefault: param.clearOnDefault,
    presenceGated: param.presenceGated,
    structure: getParamStructure(param),
  })

  if (!hasModifiers(param)) {
    return base
  }

  // Modifiers delegate to the wrapped builder and re-prefix, so its own semantics
  // (an object's contribution, its presence gate) survive prefixing.
  const prefixed: AnyDefinedQueryParam & ModifierSurface = {
    ...base,
    withDefault: (defaultValue: unknown) => createPrefixedQueryParam(prefix, param.withDefault(defaultValue)),
    withEquality: (eq: (a: unknown, b: unknown) => boolean) => createPrefixedQueryParam(prefix, param.withEquality(eq)),
    keepOnDefault: () => createPrefixedQueryParam(prefix, param.keepOnDefault()),
    ...(typeof param.withDefaultsWhenPresent === 'function'
      ? { withDefaultsWhenPresent: () => createPrefixedQueryParam(prefix, param.withDefaultsWhenPresent!()) }
      : {}),
  }

  return prefixed
}
