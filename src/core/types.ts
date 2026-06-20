/**
 * A single value as it appears in a parsed query object, for example the output
 * of `qs.parse()`.
 *
 * @remarks
 * The core operates on parsed values only. Converting to and from a raw query
 * string lives at the route adapter boundary.
 */
export type ParsedQueryValue
  = | string
    | number
    | boolean
    | null
    | undefined
    | ParsedQueryValue[]
    | { [key: string]: ParsedQueryValue }

/**
 * A parsed query object read from the URL.
 *
 * @remarks
 * The input side: the shape codecs and definitions parse values out of.
 */
export type ParsedQuery = Record<string, ParsedQueryValue>

/**
 * A parsed query object produced for the URL.
 *
 * @remarks
 * The output side: the shape definitions serialize values into before the
 * adapter stringifies it.
 */
export type ParsedQueryRaw = Record<string, ParsedQueryValue>
