import type { Codec } from '../codec'
import { getQueryString } from '../../query/value'
import { createCodec } from '../codec'
import { fromQueryScalar } from './utils'

// Numeric enums also expose a reverse mapping (value to key) at runtime, so
// filter those entries out and keep only the forward members.
function enumValues(enumObject: Record<string, string | number>): (string | number)[] {
  const values: (string | number)[] = []

  for (const key of Object.keys(enumObject)) {
    if (typeof enumObject[enumObject[key] as string] !== 'number') {
      values.push(enumObject[key])
    }
  }

  return values
}

/**
 * Builds a codec for a TypeScript `enum`, accepting any of its members.
 *
 * @remarks
 * Where {@link codecs.literal} takes an explicit array, this reads the accepted
 * values from the enum object itself. It supports string, numeric, and
 * heterogeneous enums, and skips the reverse-mapping entries a numeric enum
 * exposes at runtime, so a numeric member round-trips through its number rather
 * than its key. Any value outside the enum parses as absent (`undefined`).
 *
 * @example
 * ```ts
 * enum Status {
 *   Active = 'active',
 *   Archived = 'archived',
 * }
 *
 * const status = useQueryState('status', codecs.enum(Status))
 * //    ^? QueryStateRef<Status | undefined>
 * ```
 */
export function enumCodec<const T extends Record<string, string | number>>(enumObject: T): Codec<T[keyof T]> {
  const byString = new Map<string, T[keyof T]>()
  const byNumber = new Map<number, T[keyof T]>()

  for (const value of enumValues(enumObject)) {
    const member = value as T[keyof T]
    byString.set(String(value), member)

    if (typeof value === 'number') {
      byNumber.set(value, member)
    }
  }

  return createCodec<T[keyof T]>({
    parse: fromQueryScalar((value) => {
      if (typeof value === 'number') {
        return byNumber.get(value)
      }

      const text = getQueryString(value)
      return text === undefined ? undefined : byString.get(text)
    }),
    serialize: value => String(value),
  })
}
