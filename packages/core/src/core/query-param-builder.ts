import type {
  DefaultInput,
  QueryParamBuilder,
  QueryParamBuilderOptions,
  QueryParamBuilderWithDefault,
  QueryParamTransform,
} from './query-param-types'
import { createDefinedQueryParam } from './defined-query-param'

export function createQueryParamBuilder<T, TDefaultInput = DefaultInput<T>>(
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
      return createQueryParamBuilder<T, TDefaultInput>(options)
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
