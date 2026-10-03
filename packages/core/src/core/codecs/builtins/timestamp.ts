import { createCodec } from '../codec'
import { dateEq, fromQueryScalar, parseInteger } from './utils'

/** Parses a `Date` from milliseconds since the epoch. Non-integer or invalid input parses as absent. */
export const timestampCodec = createCodec<Date>({
  parse: fromQueryScalar((raw) => {
    const value = parseInteger(raw)

    if (value === undefined) {
      return undefined
    }

    const date = new Date(value)

    if (Number.isNaN(date.valueOf())) {
      return undefined
    }

    return date
  }),
  serialize: value => String(value.valueOf()),
  eq: dateEq,
})
