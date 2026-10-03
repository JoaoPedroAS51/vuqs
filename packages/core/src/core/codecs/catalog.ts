import { arrayOfCodec } from './builtins/array-of'
import { booleanCodec } from './builtins/boolean'
import { enumCodec } from './builtins/enum'
import { floatCodec } from './builtins/float'
import { hexCodec } from './builtins/hex'
import { indexCodec } from './builtins/index-codec'
import { integerCodec } from './builtins/integer'
import { isoDateCodec } from './builtins/iso-date'
import { isoDateTimeCodec } from './builtins/iso-date-time'
import { createJsonCodec } from './builtins/json'
import { literalCodec } from './builtins/literal'
import { numberLiteralCodec } from './builtins/number-literal'
import { stringCodec } from './builtins/string'
import { timestampCodec } from './builtins/timestamp'

/**
 * Built-in codecs for common value shapes.
 *
 * @remarks
 * `string`, `integer`, `float`, and `boolean` are ready-made codecs. `arrayOf`,
 * `literal`, `enum`, and `json` are factories that build a codec for a given shape.
 */
export const codecs = {
  string: stringCodec,
  integer: integerCodec,
  index: indexCodec,
  hex: hexCodec,
  float: floatCodec,
  boolean: booleanCodec,
  timestamp: timestampCodec,
  isoDateTime: isoDateTimeCodec,
  isoDate: isoDateCodec,
  arrayOf: arrayOfCodec,
  literal: literalCodec,
  numberLiteral: numberLiteralCodec,
  enum: enumCodec,
  json: createJsonCodec,
}
