import { createCodec } from '../codec'
import { fromQueryScalar, parseNumber } from './utils'

/** Reads a finite number from a number or numeric string. Invalid input parses as absent. */
export const floatCodec = createCodec<number>({
  parse: fromQueryScalar(parseNumber),
  serialize: value => String(value),
})
