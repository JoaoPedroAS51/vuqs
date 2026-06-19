const TRUNCATION_MARKER = /^\[\+(\d+) more\]$/

/** Quotes a dynamic console label without allowing control characters to alter the line. */
export function quoteDebugLabel(value: string): string {
  return JSON.stringify(value)
}

/** Formats a bounded, escaped list and understands the normalizer's final truncation marker. */
export function formatDebugLabelList(
  values: readonly string[],
  limit = 3,
  rawValues: readonly string[] = values,
): string {
  const labels = [...values]
  const marker = labels.at(-1)?.match(TRUNCATION_MARKER)
  const markerChanged = labels.length !== rawValues.length
    || labels.at(-1) !== rawValues[labels.length - 1]
  const isNormalizerMarker = markerChanged && marker !== null && marker !== undefined
  const normalizedOmitted = isNormalizerMarker ? Number(marker[1]) : Math.max(0, rawValues.length - labels.length)
  if (isNormalizerMarker) {
    labels.pop()
  }

  const visible = labels.slice(0, limit).map(quoteDebugLabel)
  const omitted = normalizedOmitted + labels.length - visible.length
  if (visible.length === 0) {
    return omitted === 0 ? 'no parameters' : `${omitted} ${omitted === 1 ? 'parameter' : 'parameters'}`
  }
  if (omitted > 0) {
    return `${visible.join(', ')}, and ${omitted} more ${omitted === 1 ? 'parameter' : 'parameters'}`
  }
  if (visible.length === 1) {
    return visible[0]!
  }
  if (visible.length === 2) {
    return `${visible[0]} and ${visible[1]}`
  }
  return `${visible.slice(0, -1).join(', ')}, and ${visible.at(-1)}`
}

/** Returns projected object keys without presenting the normalizer's sentinel as user data. */
export function projectedDebugObjectKeys(
  projected: Record<string, unknown>,
  raw: Record<string, unknown>,
): string[] {
  const keys = Object.keys(projected)
  const hasSyntheticMarker = projected['…'] === '[truncated]' && !Object.hasOwn(raw, '…')
  return hasSyntheticMarker ? keys.filter(key => key !== '…') : keys
}
