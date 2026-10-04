import { getQueryString } from '../../query/value'
import { createCodec } from '../codec'
import { fromQueryScalar } from './utils'

const HEX_PATTERN = /^[0-9a-f]+$/i

/**
 * Parses a non-negative hexadecimal integer, padding serialized values to even length.
 */
export const hexCodec = createCodec<number>({
  parse: fromQueryScalar((value) => {
    const text = typeof value === 'number' && Number.isFinite(value)
      ? String(value)
      : getQueryString(value)

    if (text === undefined || !HEX_PATTERN.test(text)) {
      return undefined
    }

    const parsed = Number.parseInt(text, 16)
    return Number.isFinite(parsed) ? parsed : undefined
  }),
  serialize: (value) => {
    const hex = value.toString(16)

    return hex.length % 2 === 0 ? hex : `0${hex}`
  },
})
