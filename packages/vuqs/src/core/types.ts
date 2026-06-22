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

/**
 * Navigation options forwarded to the `navigate` adapter.
 *
 * @remarks
 * The adapter decides how to honor each option and may ignore ones it does not
 * support.
 */
export interface NavigateOptions {
  /** Replace the current history entry instead of pushing a new one. */
  history?: 'replace' | 'push'
  /** Whether the navigation should scroll. */
  scroll?: boolean
}

/**
 * The route adapter that applies a query to the URL.
 *
 * @remarks
 * Receives the next parsed query and the resolved navigation options. It is
 * responsible for stringifying the query, for example with `qs`, and performing
 * the navigation. It may complete synchronously or return a promise.
 *
 * @param query - The next parsed query to write to the URL.
 * @param options - The resolved navigation options for this write.
 */
export type QueryStateNavigate = (query: ParsedQueryRaw, options: NavigateOptions) => void | Promise<void>
