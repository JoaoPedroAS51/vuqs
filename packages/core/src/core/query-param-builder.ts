import type {
  DefaultInput,
  QueryParamBuilder,
  QueryParamBuilderOptions,
  QueryParamBuilderWithDefault,
  QueryParamTransform,
} from './query-param-types'
import { createDefinedQueryParam } from './defined-query-param'
import { structuralEq } from './equality'

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
    keepOnDefault() {
      return createQueryParamBuilder<T, TDefaultInput>({
        ...options,
        clearOnDefault: false,
      })
    },
    transform<TOutput>(transformer: QueryParamTransform<T, TOutput>) {
      const inputEq = options.eq ?? structuralEq

      return createQueryParamBuilder<TOutput>({
        paths: options.paths,
        read(query) {
          // Read the raw input (undefined when absent), so the transformed
          // param's own default resolves in the single default layer instead of
          // being shadowed by the input's default.
          const value = options.read(query)

          return value === undefined ? undefined : transformer.read(value)
        },
        write(value) {
          return options.write(transformer.write(value))
        },
        eq: transformer.eq ?? ((a, b) => inputEq(transformer.write(a), transformer.write(b))),
        defaultValue: options.defaultValue === undefined
          ? undefined
          : transformer.read(options.defaultValue),
        clearOnDefault: options.clearOnDefault,
      })
    },
  }

  return builder as QueryParamBuilder<T, TDefaultInput> | QueryParamBuilderWithDefault<T, TDefaultInput>
}
