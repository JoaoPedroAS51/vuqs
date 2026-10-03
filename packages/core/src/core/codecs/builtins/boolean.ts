import { createCodec } from '../codec'
import { fromQueryScalar } from './utils'

/** Reads a boolean or the strings `'true'` and `'false'`. Any other value parses as absent. */
export const booleanCodec = createCodec<boolean>({
  parse: fromQueryScalar((value) => {
    if (typeof value === 'boolean') {
      return value
    }

    if (value === 'true') {
      return true
    }

    if (value === 'false') {
      return false
    }

    return undefined
  }),
  serialize: value => (value ? 'true' : 'false'),
})
