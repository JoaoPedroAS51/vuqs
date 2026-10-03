import { createCodec } from '../codec'
import { dateEq, fromQueryString } from './utils'

/** Parses a `Date` from a full ISO-8601 string. Invalid input parses as absent. */
export const isoDateTimeCodec = createCodec<Date>({
  parse: fromQueryString((text) => {
    const date = new Date(text)

    if (Number.isNaN(date.valueOf())) {
      return undefined
    }

    return date
  }),
  serialize: value => value.toISOString(),
  eq: dateEq,
})
