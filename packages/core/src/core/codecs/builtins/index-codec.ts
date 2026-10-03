import { createCodec } from '../codec'
import { fromQueryScalar, parseInteger } from './utils'

/** Parses a 1-based index from the URL into a 0-based value. Non-integer input parses as absent. */
export const indexCodec = createCodec<number>({
  parse: fromQueryScalar((raw) => {
    const value = parseInteger(raw)

    if (value === undefined) {
      return undefined
    }

    return value - 1
  }),
  serialize: value => String(value + 1),
})
