import { createCodec } from '../codec'
import { dateEq, fromQueryString } from './utils'

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}/

/** Parses a `Date` from a date-only `YYYY-MM-DD` string at midnight UTC. Invalid input parses as absent. */
export const isoDateCodec = createCodec<Date>({
  parse: fromQueryString((text) => {
    if (!ISO_DATE_PATTERN.test(text)) {
      return undefined
    }

    const date = new Date(text.slice(0, 10))

    if (Number.isNaN(date.valueOf())) {
      return undefined
    }

    return date
  }),
  serialize: value => value.toISOString().slice(0, 10),
  eq: dateEq,
})
