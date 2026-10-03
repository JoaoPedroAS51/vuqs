import type { ParsedQueryValue } from '../../query/types'
import type { Codec } from '../codec'
import { createCodec } from '../codec'

/**
 * Builds a codec for an array whose items are each handled by `codec`.
 *
 * @remarks
 * A scalar query value is treated as a single-item array. Items that `codec`
 * rejects are dropped, and an empty result parses as absent (`undefined`).
 * Equality compares element-wise.
 */
export function arrayOfCodec<T>(codec: Codec<T>): Codec<T[]> {
  return createCodec<T[]>({
    parse: (raw) => {
      let items: ParsedQueryValue[]

      if (Array.isArray(raw)) {
        items = raw
      }
      else if (raw === undefined || raw === null) {
        items = []
      }
      else {
        items = [raw]
      }

      const parsed = items
        .map(item => codec.parse(item))
        .filter((item): item is T => item !== undefined)

      return parsed.length ? parsed : undefined
    },
    serialize: value => value.map(item => codec.serialize(item)),
    eq: (a, b) => a.length === b.length && a.every((item, index) => codec.eq(item, b[index])),
  })
}
