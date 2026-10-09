import type { ParsedQueryRaw } from '../../query/types'
import type { NormalizeQueryStateSchema, QueryStateSchemaInput } from '../schema'
import type {
  AnyDefinedQueryParam,
  AnyObjectChildren,
  ObjectValue,
  PrefixedQueryParamBuilder,
  QueryParamObjectBuilderFor,
  QueryParamObjectDefault,
} from './builder-types'
import { structuralClone } from '../../../shared/utils/object'
import { compactQuery, mergeQueries } from '../../query/object'
import { getPath } from '../../query/path'
import { normalizeQueryStateSchema } from '../schema'
import { createQueryParamBuilder } from './builder'
import { isDefinedQueryParam } from './definition'
import { createPrefixedQueryParam } from './prefix'

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
export function createObjectQueryParam<TChildren extends AnyObjectChildren>(
  options: ObjectBuilderOptions<TChildren>,
): QueryParamObjectBuilderFor<TChildren> {
  const children = prefixChildren(options.prefix, normalizeQueryStateSchema(options.children) as TChildren)
  const paths = Object.values(children).flatMap(child => child.paths)
  const mergedDefault = buildObjectDefault(children, options.defaultValue)
  // An explicit object default disables presence gating.
  const presenceGated = Boolean(options.defaultsWhenPresent) && options.defaultValue === undefined
  const defaultValue = presenceGated ? undefined : mergedDefault

  const childKeys = Object.keys(children) as Array<keyof ObjectValue<TChildren>>

  const builder = createQueryParamBuilder<ObjectValue<TChildren>, QueryParamObjectDefault<ObjectValue<TChildren>>>({
    paths,
    // Leave missing children absent so resolution can apply layered defaults.
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
    // Missing children fall back to layered defaults, then static defaults.
    // Present children resolve recursively; absent presence-gated children stay absent.
    //
    // Clone fallback values so consumers cannot mutate shared defaults.
    resolve(explicitValue, defaults) {
      const value: Record<string, unknown> = {}

      for (const key of childKeys) {
        const child = children[key]
        const explicitChildValue = explicitValue[key]
        const fallback = (defaults as Record<string, unknown> | undefined)?.[key as string] ?? mergedDefault?.[key]

        if (explicitChildValue !== undefined) {
          value[key] = child.resolve ? child.resolve(explicitChildValue, fallback) : explicitChildValue
          continue
        }

        if (!child.presenceGated && fallback !== undefined) {
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

// Child defaults take precedence over the object-level default.
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
