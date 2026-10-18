import type { ParsedQueryRaw } from '../../query/types'
import type { NormalizeQueryStateSchema, QueryStateSchemaInput } from '../schema'
import type {
  AnyObjectChildren,
  ObjectContribution,
  ObjectExplicitValue,
  ObjectGuaranteed,
  ObjectResolvedValue,
  PrefixedQueryParamBuilder,
  QueryParamObjectBuilder,
  QueryParamObjectBuilderFor,
} from './builder-types'
import type { AnyDefinedQueryParam } from './definition'
import { compactQuery, mergeQueries } from '../../query/object'
import { getPath } from '../../query/path'
import { composeStaticObjectDefaults } from '../resolution'
import { normalizeQueryStateSchema } from '../schema'
import { createTransformedQueryParam } from './builder'
import { createDefinedQueryParam, isDefinedQueryParam } from './definition'
import { createPrefixedQueryParam } from './prefix'

interface ObjectBuilderOptions<TChildren extends AnyObjectChildren> {
  prefix?: string
  children: TChildren
  ownDefault?: ObjectContribution<TChildren>
  eq?: (a: ObjectExplicitValue<TChildren>, b: ObjectExplicitValue<TChildren>) => boolean
  clearOnDefault?: boolean
  defaultsWhenPresent?: boolean
}

/**
 * Composes a multi-key param from child params, optionally under a prefix.
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

/** @internal */
export function createObjectQueryParam<
  TChildren extends AnyObjectChildren,
  THasOwnDefault extends boolean = false,
  TGated extends boolean = false,
>(
  options: ObjectBuilderOptions<TChildren>,
): QueryParamObjectBuilder<TChildren, THasOwnDefault, TGated> {
  const children = prefixChildren(options.prefix, normalizeQueryStateSchema(options.children) as TChildren)
  const paths = Object.values(children).flatMap(child => child.paths)
  const childKeys = Object.keys(children)
  const staticCandidate = composeStaticObjectDefaults(children, options.ownDefault)

  const defined = createDefinedQueryParam<
    ObjectExplicitValue<TChildren>,
    ObjectResolvedValue<TChildren>,
    ObjectContribution<TChildren>,
    ObjectGuaranteed<TChildren, THasOwnDefault, TGated>
  >({
    paths,
    read(query, context) {
      const hasUrlPresence = paths.some(path => getPath(query, path) !== undefined)

      if (!hasUrlPresence) {
        return undefined
      }

      const value: Record<string, unknown> = {}
      let hasValue = false

      for (const key of childKeys) {
        const childValue = children[key].read(query, context)

        if (childValue !== undefined) {
          value[key] = childValue
          hasValue = true
        }
      }

      return hasValue ? value as ObjectExplicitValue<TChildren> : undefined
    },
    write(value) {
      let query: ParsedQueryRaw = {}

      for (const key of childKeys) {
        const childValue = (value as Record<string, unknown>)[key]

        if (childValue !== undefined) {
          query = mergeQueries(query, children[key].write(childValue))
        }
      }

      return compactQuery(query)
    },
    eq: options.eq,
    clearOnDefault: options.clearOnDefault,
    presenceGated: options.defaultsWhenPresent === true,
    structure: { children, staticCandidate },
  })

  return {
    ...defined,
    withDefault(defaultValue) {
      return createObjectQueryParam<TChildren, true, TGated>({ ...options, ownDefault: defaultValue })
    },
    withEquality(eq) {
      return createObjectQueryParam<TChildren, THasOwnDefault, TGated>({ ...options, eq })
    },
    withDefaultsWhenPresent() {
      return createObjectQueryParam<TChildren, THasOwnDefault, true>({ ...options, defaultsWhenPresent: true })
    },
    keepOnDefault() {
      return createObjectQueryParam<TChildren, THasOwnDefault, TGated>({ ...options, clearOnDefault: false })
    },
    transform(transformer) {
      return createTransformedQueryParam(defined, defined.eq, transformer)
    },
  }
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
