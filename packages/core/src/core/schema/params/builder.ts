import type { QueryParamBuilder, QueryParamBuilderOptions, QueryParamBuilderWithDefault, QueryParamTransform } from './builder-types'
import { structuralEq } from '../../../shared/utils/object'
import { createDefinedQueryParam } from './definition'

/** @internal */
export function createQueryParamBuilder<T, TDefaultInput = T>(
  options: QueryParamBuilderOptions<T>,
): QueryParamBuilder<T, TDefaultInput> | QueryParamBuilderWithDefault<T, TDefaultInput> {
  const defined = createDefinedQueryParam({
    paths: options.paths,
    read: options.read,
    write: options.write,
    eq: options.eq,
    resolve: options.resolve,
    defaultValue: options.defaultValue,
    clearOnDefault: options.clearOnDefault,
    presenceGated: options.presenceGated,
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
        read(query, context) {
          // Preserve absence so the transformed param can resolve its own default.
          // Present objects need static defaults before the transform reads them.
          const selection = options.read(query, context)

          if (selection === undefined) {
            return undefined
          }

          const resolved = options.resolve ? options.resolve(selection, options.defaultValue) : selection

          return transformer.read(resolved)
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
