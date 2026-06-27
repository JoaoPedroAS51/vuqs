import type { DefinedQueryParam } from './defined-query-param'
import type { ParsedQuery, ParsedQueryRaw } from './types'
import { collectLeafPaths, getPath, setPath } from './path'

export function isDefinedQueryParam(value: unknown): value is DefinedQueryParam<any> {
  return value !== null
    && typeof value === 'object'
    && typeof (value as DefinedQueryParam<any>).read === 'function'
    && typeof (value as DefinedQueryParam<any>).write === 'function'
    && Array.isArray((value as DefinedQueryParam<any>).paths)
}

export function joinPath(prefix: string, path: string): string {
  return path ? `${prefix}.${path}` : prefix
}

export function unprefixQuery(query: ParsedQuery, prefix: string, paths: readonly string[]): ParsedQueryRaw {
  const result: ParsedQueryRaw = {}

  for (const path of paths) {
    const value = getPath(query, joinPath(prefix, path))

    if (value !== undefined) {
      setPath(result, path, value)
    }
  }

  return result
}

export function prefixQuery(query: ParsedQueryRaw, prefix: string): ParsedQueryRaw {
  let result: ParsedQueryRaw = {}

  for (const path of collectLeafPaths(query)) {
    const value = getPath(query, path)

    if (value !== undefined) {
      result = setPath(result, joinPath(prefix, path), value)
    }
  }

  return result
}
