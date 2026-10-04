/**
 * A single value as it appears in a parsed query object, for example the output
 * of `qs.parse()`.
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
 */
export type ParsedQuery = Record<string, ParsedQueryValue>

/**
 * A parsed query object produced for the URL.
 */
export type ParsedQueryRaw = Record<string, ParsedQueryValue>
