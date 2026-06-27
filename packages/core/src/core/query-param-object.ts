import type {
  DefinedQueryParamWithDefault,
} from './defined-query-param'
import type {
  AnyDefinedQueryParam,
  AnyObjectChildren,
  DefinedValue,
  ObjectValue,
  QueryParamBuilder,
  QueryParamBuilderWithDefault,
  QueryParamObjectDefault,
} from './query-param-types'
import type { ParsedQueryRaw } from './types'
import { getPath } from './path'
import { compactQuery, mergeQueries } from './query-object'
import { createQueryParamBuilder } from './query-param-builder'
import { isDefinedQueryParam, joinPath, prefixQuery, unprefixQuery } from './query-param-utils'

interface ObjectBuilderOptions<TChildren extends AnyObjectChildren> {
  prefix?: string
  children: TChildren
  defaultValue?: Partial<ObjectValue<TChildren>>
  eq?: (a: ObjectValue<TChildren>, b: ObjectValue<TChildren>) => boolean
  clearOnDefault?: boolean
  defaultsWhenPresent?: boolean
}

export interface QueryParamObjectFactory {
  <TChildren extends AnyObjectChildren>(
    children: TChildren,
  ): QueryParamBuilder<ObjectValue<TChildren>, QueryParamObjectDefault<ObjectValue<TChildren>>>
  <TChildren extends AnyObjectChildren>(
    prefix: string,
    children: TChildren,
  ): QueryParamBuilder<ObjectValue<TChildren>, QueryParamObjectDefault<ObjectValue<TChildren>>>
  <TParam extends AnyDefinedQueryParam>(
    prefix: string,
    param: TParam,
  ): TParam extends DefinedQueryParamWithDefault<infer TValue>
    ? QueryParamBuilderWithDefault<TValue>
    : QueryParamBuilder<DefinedValue<TParam>>
}

export function createObjectQueryParam<TChildren extends AnyObjectChildren>(
  options: ObjectBuilderOptions<TChildren>,
): QueryParamBuilder<ObjectValue<TChildren>, QueryParamObjectDefault<ObjectValue<TChildren>>> {
  const children = prefixChildren(options.prefix, options.children)
  const paths = Object.values(children).flatMap(child => child.paths)

  const builder = createQueryParamBuilder<ObjectValue<TChildren>, QueryParamObjectDefault<ObjectValue<TChildren>>>({
    paths,
    read(query) {
      const hasUrlPresence = paths.some(path => getPath(query, path) !== undefined)

      if (options.defaultsWhenPresent && !hasUrlPresence && options.defaultValue === undefined) {
        return undefined
      }

      const value: Record<string, unknown> = {}
      let hasValue = false

      for (const key of Object.keys(children)) {
        const child = children[key]
        const childValue = child.read(query)

        if (childValue !== undefined) {
          value[key] = childValue
          hasValue = true
          continue
        }

        const childDefault = child.defaultValue

        if (childDefault !== undefined) {
          value[key] = childDefault
          hasValue = true
          continue
        }

        const defaultValue = options.defaultValue?.[key as keyof ObjectValue<TChildren>]

        if (defaultValue !== undefined) {
          value[key] = defaultValue
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
    defaultValue: options.defaultValue === undefined
      ? undefined
      : buildObjectDefault(children, options.defaultValue) as ObjectValue<TChildren>,
    clearOnDefault: options.clearOnDefault,
  }) as QueryParamBuilder<ObjectValue<TChildren>, QueryParamObjectDefault<ObjectValue<TChildren>>>

  return {
    ...builder,
    withDefault(defaultValue) {
      return createObjectQueryParam({
        ...options,
        defaultValue: defaultValue as Partial<ObjectValue<TChildren>>,
      }) as QueryParamBuilderWithDefault<ObjectValue<TChildren>, QueryParamObjectDefault<ObjectValue<TChildren>>>
    },
    withEquality(eq) {
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
  }
}

export function createPrefixedQueryParam<TParam extends AnyDefinedQueryParam>(
  prefix: string,
  param: TParam,
): QueryParamBuilder<DefinedValue<TParam>> | QueryParamBuilderWithDefault<DefinedValue<TParam>> {
  return createQueryParamBuilder<DefinedValue<TParam>>({
    paths: param.paths.map(path => joinPath(prefix, path)),
    read(query) {
      return param.read(unprefixQuery(query, prefix, param.paths))
    },
    write(value) {
      return prefixQuery(param.write(value), prefix)
    },
    eq: param.eq,
    defaultValue: param.defaultValue,
    clearOnDefault: param.clearOnDefault,
  })
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

function buildObjectDefault<TChildren extends AnyObjectChildren>(
  children: TChildren,
  defaultValue: Partial<ObjectValue<TChildren>>,
): Partial<ObjectValue<TChildren>> {
  const result: Record<string, unknown> = {}

  for (const key of Object.keys(children)) {
    const childDefault = children[key].defaultValue

    if (childDefault !== undefined) {
      result[key] = childDefault
    }
  }

  return { ...defaultValue, ...result } as Partial<ObjectValue<TChildren>>
}
