import type { QueryParamBuilder, QueryParamBuilderOptions, QueryParamTransform } from './builder-types'
import type { AnyDefinedQueryParam } from './definition'
import { resolveParamValue } from '../resolution'
import { createDefinedQueryParam, getParamStructure } from './definition'

/** @internal */
export function createQueryParamBuilder<T, TContribution = T, TGuaranteed extends boolean = boolean>(
  options: QueryParamBuilderOptions<T>,
): QueryParamBuilder<T, TContribution, TGuaranteed> {
  const defined = createDefinedQueryParam<T, T, TContribution, TGuaranteed>({
    paths: options.paths,
    read: options.read,
    write: options.write,
    eq: options.eq,
    resolve: options.resolve,
    defaultValue: options.defaultValue,
    clearOnDefault: options.clearOnDefault,
    presenceGated: options.presenceGated,
    structure: options.structure,
  })

  return {
    ...defined,
    withDefault(defaultValue: TContribution) {
      return createQueryParamBuilder<T, TContribution, true>({
        ...options,
        defaultValue,
        structure: undefined,
      })
    },
    withEquality(eq: (a: T, b: T) => boolean) {
      return createQueryParamBuilder<T, TContribution, TGuaranteed>({
        ...options,
        eq,
      })
    },
    keepOnDefault() {
      return createQueryParamBuilder<T, TContribution, TGuaranteed>({
        ...options,
        clearOnDefault: false,
      })
    },
    transform<TOutput>(transformer: QueryParamTransform<T, TOutput>) {
      return createTransformedQueryParam<TOutput>(defined, defined.eq, transformer)
    },
  }
}

/**
 * Wraps a param so its resolved value is mapped to a different public shape.
 *
 * A defined decoded input is resolved against the input's static candidate before
 * mapping; an absent decoded input skips mapping. The output is atomic. Its static
 * default is derived separately by mapping the input's absent-input resolution
 * when that resolution is defined.
 *
 * @internal
 */
export function createTransformedQueryParam<TOutput>(
  input: AnyDefinedQueryParam,
  inputEq: (a: any, b: any) => boolean,
  transformer: QueryParamTransform<any, TOutput, any>,
): QueryParamBuilder<TOutput> {
  const inputCandidate = getParamStructure(input)?.staticCandidate
  const derived = resolveParamValue(input, undefined, inputCandidate)

  return createQueryParamBuilder<TOutput, TOutput, false>({
    paths: input.paths,
    read(query, context) {
      const decoded = input.read(query, context)

      if (decoded === undefined) {
        return undefined
      }

      return transformer.read(resolveParamValue(input, decoded, inputCandidate))
    },
    write(value) {
      return input.write(transformer.write(value))
    },
    eq: transformer.eq ?? ((a, b) => inputEq(transformer.write(a), transformer.write(b))),
    defaultValue: derived === undefined ? undefined : transformer.read(derived),
    clearOnDefault: input.clearOnDefault,
  })
}
