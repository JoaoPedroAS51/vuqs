import type { Codec, CodecWithDefault } from './codec'
import type { DefinedQueryParam, DefinedQueryParamWithDefault } from './defined-query-param'
import type { ParsedQuery, ParsedQueryRaw } from './types'
import { codecs } from './codec'
import { createDefinedQueryParam, defineCodecQueryParam } from './defined-query-param'
import { collectLeafPaths, getPath, setPath } from './path'
import { compactQuery, mergeQueries } from './query-object'

type Simplify<T> = { [Key in keyof T]: T[Key] } & {}
type AnyDefinedQueryParam = DefinedQueryParam<any>
type AnyObjectChildren = Record<string, AnyDefinedQueryParam>
type DefaultInput<T> = T

type DefinedValue<TParam> = TParam extends DefinedQueryParam<infer TValue> ? TValue : never

type RequiredObjectChildren<TChildren extends AnyObjectChildren> = {
  [Key in keyof TChildren as TChildren[Key] extends DefinedQueryParamWithDefault<any> ? Key : never]: DefinedValue<TChildren[Key]>
}

type OptionalObjectChildren<TChildren extends AnyObjectChildren> = {
  [Key in keyof TChildren as TChildren[Key] extends DefinedQueryParamWithDefault<any> ? never : Key]?: DefinedValue<TChildren[Key]>
}

type ObjectValue<TChildren extends AnyObjectChildren> = Simplify<
  RequiredObjectChildren<TChildren> & OptionalObjectChildren<TChildren>
>

type QueryParamObjectDefault<TValue> = TValue extends object ? Partial<TValue> : TValue

export interface QueryParamTransform<TInput, TOutput> {
  read: (value: TInput) => TOutput | undefined
  write: (value: TOutput) => TInput
  eq?: (a: TOutput, b: TOutput) => boolean
}

export interface QueryParamBuilder<T, TDefaultInput = DefaultInput<T>> extends DefinedQueryParam<T> {
  withDefault: (defaultValue: TDefaultInput) => QueryParamBuilderWithDefault<T, TDefaultInput>
  withEquality: (eq: (a: T, b: T) => boolean) => QueryParamBuilder<T, TDefaultInput>
  withDefaultsWhenPresent: () => QueryParamBuilder<T, TDefaultInput>
  keepOnDefault: () => QueryParamBuilder<T, TDefaultInput>
  transform: <TOutput>(transformer: QueryParamTransform<T, TOutput>) => QueryParamBuilder<TOutput>
}

export interface QueryParamBuilderWithDefault<T, TDefaultInput = DefaultInput<T>>
  extends DefinedQueryParamWithDefault<T> {
  withDefault: (defaultValue: TDefaultInput) => QueryParamBuilderWithDefault<T, TDefaultInput>
  withEquality: (eq: (a: T, b: T) => boolean) => QueryParamBuilderWithDefault<T, TDefaultInput>
  withDefaultsWhenPresent: () => QueryParamBuilderWithDefault<T, TDefaultInput>
  keepOnDefault: () => QueryParamBuilderWithDefault<T, TDefaultInput>
  transform: <TOutput>(transformer: QueryParamTransform<T, TOutput>) => QueryParamBuilder<TOutput>
}

interface QueryParamOptions<T> {
  defaultValue?: T
}

interface QueryParamBuilderOptions<T> {
  paths: readonly string[]
  read: (query: ParsedQuery) => T | undefined
  write: (value: T) => ParsedQueryRaw
  eq?: (a: T, b: T) => boolean
  defaultValue?: T
  clearOnDefault?: boolean
  withDefaultsWhenPresent?: boolean
}

interface ObjectBuilderOptions<TChildren extends AnyObjectChildren> {
  prefix?: string
  children: TChildren
  defaultValue?: Partial<ObjectValue<TChildren>>
  eq?: (a: ObjectValue<TChildren>, b: ObjectValue<TChildren>) => boolean
  clearOnDefault?: boolean
  defaultsWhenPresent?: boolean
}

interface QueryParamFactory {
  (path: string): QueryParamBuilder<string>
  (path: string, options: { defaultValue: string }): QueryParamBuilderWithDefault<string>
  <T>(path: string, codec: CodecWithDefault<T>): QueryParamBuilderWithDefault<T>
  <T>(path: string, codec: Codec<T>): QueryParamBuilder<T>
  object: {
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
}

function createQueryParamBuilder<T, TDefaultInput = DefaultInput<T>>(
  options: QueryParamBuilderOptions<T>,
): QueryParamBuilder<T, TDefaultInput> | QueryParamBuilderWithDefault<T, TDefaultInput> {
  const defined = createDefinedQueryParam({
    paths: options.paths,
    read: options.read,
    write: options.write,
    eq: options.eq,
    defaultValue: options.defaultValue,
    clearOnDefault: options.clearOnDefault,
  })

  const builder = {
    ...defined,
    withDefault(defaultValue: TDefaultInput) {
      return createQueryParamBuilder<T, TDefaultInput>({
        ...options,
        defaultValue: defaultValue as unknown as T,
      }) as QueryParamBuilderWithDefault<T, TDefaultInput>
    },
    withEquality(eq: (a: T, b: T) => boolean) {
      return createQueryParamBuilder<T, TDefaultInput>({
        ...options,
        eq,
      })
    },
    withDefaultsWhenPresent() {
      return createQueryParamBuilder<T, TDefaultInput>({
        ...options,
        withDefaultsWhenPresent: true,
      })
    },
    keepOnDefault() {
      return createQueryParamBuilder<T, TDefaultInput>({
        ...options,
        clearOnDefault: false,
      })
    },
    transform<TOutput>(transformer: QueryParamTransform<T, TOutput>) {
      return createQueryParamBuilder<TOutput>({
        paths: options.paths,
        read(query) {
          const value = options.read(query)

          return value === undefined ? undefined : transformer.read(value)
        },
        write(value) {
          return options.write(transformer.write(value))
        },
        eq: transformer.eq,
        clearOnDefault: options.clearOnDefault,
      })
    },
  }

  return builder as QueryParamBuilder<T, TDefaultInput> | QueryParamBuilderWithDefault<T, TDefaultInput>
}

function createObjectQueryParamBuilder<TChildren extends AnyObjectChildren>(
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
      return createObjectQueryParamBuilder({
        ...options,
        defaultValue: defaultValue as Partial<ObjectValue<TChildren>>,
      }) as QueryParamBuilderWithDefault<ObjectValue<TChildren>, QueryParamObjectDefault<ObjectValue<TChildren>>>
    },
    withEquality(eq) {
      return createObjectQueryParamBuilder({
        ...options,
        eq,
      })
    },
    withDefaultsWhenPresent() {
      return createObjectQueryParamBuilder({
        ...options,
        defaultsWhenPresent: true,
      })
    },
    keepOnDefault() {
      return createObjectQueryParamBuilder({
        ...options,
        clearOnDefault: false,
      })
    },
  }
}

function createPrefixedParam<TParam extends AnyDefinedQueryParam>(
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

function isDefinedQueryParam(value: unknown): value is AnyDefinedQueryParam {
  return value !== null
    && typeof value === 'object'
    && typeof (value as AnyDefinedQueryParam).read === 'function'
    && typeof (value as AnyDefinedQueryParam).write === 'function'
    && Array.isArray((value as AnyDefinedQueryParam).paths)
}

function prefixChildren<TChildren extends AnyObjectChildren>(
  prefix: string | undefined,
  children: TChildren,
): TChildren {
  if (!prefix) {
    return children
  }

  const prefixed: Record<string, AnyDefinedQueryParam> = {}

  for (const key of Object.keys(children)) {
    prefixed[key] = createPrefixedParam(prefix, children[key])
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

function unprefixQuery(query: ParsedQuery, prefix: string, paths: readonly string[]): ParsedQueryRaw {
  const result: ParsedQueryRaw = {}

  for (const path of paths) {
    const value = getPath(query, joinPath(prefix, path))

    if (value !== undefined) {
      setPath(result, path, value)
    }
  }

  return result
}

function prefixQuery(query: ParsedQueryRaw, prefix: string): ParsedQueryRaw {
  let result: ParsedQueryRaw = {}

  for (const path of collectLeafPaths(query)) {
    const value = getPath(query, path)

    if (value !== undefined) {
      result = setPath(result, joinPath(prefix, path), value)
    }
  }

  return result
}

function joinPath(prefix: string, path: string): string {
  return path ? `${prefix}.${path}` : prefix
}

function createScalarQueryParam<T>(
  path: string,
  codec: Codec<T>,
): QueryParamBuilder<T> | QueryParamBuilderWithDefault<T> {
  const defined = defineCodecQueryParam(path, codec)

  return createQueryParamBuilder({
    paths: defined.paths,
    read: defined.read,
    write: defined.write,
    eq: defined.eq,
    defaultValue: defined.defaultValue,
  })
}

function queryParamFactory<T>(
  path: string,
  codecOrOptions?: Codec<T> | QueryParamOptions<string>,
): QueryParamBuilder<string> | QueryParamBuilderWithDefault<string> | QueryParamBuilder<T> | QueryParamBuilderWithDefault<T> {
  if (isCodec(codecOrOptions)) {
    return createScalarQueryParam(path, codecOrOptions)
  }

  const codec = codecOrOptions?.defaultValue === undefined
    ? codecs.string
    : codecs.string.withDefault(codecOrOptions.defaultValue)

  return createScalarQueryParam(path, codec)
}

function objectFactory(
  prefixOrChildren: string | AnyObjectChildren,
  childrenOrParam?: AnyObjectChildren | AnyDefinedQueryParam,
): AnyDefinedQueryParam {
  if (typeof prefixOrChildren !== 'string') {
    return createObjectQueryParamBuilder({ children: prefixOrChildren })
  }

  if (childrenOrParam === undefined) {
    throw new Error('[vuqs] queryParam.object(prefix, children) requires children.')
  }

  return isDefinedQueryParam(childrenOrParam)
    ? createPrefixedParam(prefixOrChildren, childrenOrParam)
    : createObjectQueryParamBuilder({ prefix: prefixOrChildren, children: childrenOrParam })
}

function isCodec<T>(value: Codec<T> | QueryParamOptions<string> | undefined): value is Codec<T> {
  return value !== undefined
    && typeof (value as Codec<T>).parse === 'function'
    && typeof (value as Codec<T>).serialize === 'function'
}

export const queryParam = Object.assign(queryParamFactory, {
  object: objectFactory,
}) as QueryParamFactory

export type QueryParam<T> = QueryParamBuilder<T>
export type QueryParamWithDefault<T> = QueryParamBuilderWithDefault<T>
