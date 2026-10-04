import type { Codec } from '../codec'
import { createCodec } from '../codec'
import { fromQueryString } from './utils'

/**
 * Builds a codec for a string constrained to one of `values`.
 */
export function literalCodec<const T extends string>(values: readonly T[]): Codec<T> {
  const allowed = new Set<string>(values)

  return createCodec<T>({
    parse: fromQueryString((text) => {
      if (!allowed.has(text)) {
        return undefined
      }

      return text as T
    }),
    serialize: value => value,
  })
}
