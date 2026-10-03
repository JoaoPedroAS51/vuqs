import type { Codec } from '../codec'
import { createCodec } from '../codec'
import { fromQueryScalar, parseNumber } from './utils'

/**
 * Builds a codec for a number constrained to one of `values`.
 *
 * @remarks
 * Any value outside `values` parses as absent (`undefined`).
 */
export function numberLiteralCodec<const T extends number>(values: readonly T[]): Codec<T> {
  const allowed = new Set<number>(values)

  return createCodec<T>({
    parse: fromQueryScalar((value) => {
      const parsed = parseNumber(value)

      if (parsed === undefined || !allowed.has(parsed)) {
        return undefined
      }

      return parsed as T
    }),
    serialize: value => String(value),
  })
}
