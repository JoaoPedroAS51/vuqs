import { createCodec } from '../codec'
import { fromQueryScalar, parseInteger } from './utils'

/** Reads an integer from a number or base-10 string. Invalid input parses as absent; serializing truncates toward zero. */
export const integerCodec = createCodec<number>({
  parse: fromQueryScalar(parseInteger),
  serialize: value => String(Math.trunc(value)),
})
