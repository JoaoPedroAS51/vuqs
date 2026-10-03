import { getQueryString } from '../../query/value'
import { createCodec } from '../codec'

/** Reads a non-empty query string. Empty or whitespace-only values parse as absent. */
export const stringCodec = createCodec<string>({
  parse: raw => getQueryString(raw),
  serialize: value => value,
})
