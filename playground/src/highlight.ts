const TOKEN = /("(?:\\u[a-z0-9]{4}|\\[^u]|[^\\"])*"(?:\s*:)?|\b(?:true|false)\b|\bnull\b|-?\d+(?:\.\d+)?(?:e[+-]?\d+)?)/gi

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/**
 * Renders a value as syntax-highlighted JSON HTML. The input is escaped before
 * tokens are wrapped, so query-derived strings are safe to pass to `v-html`.
 */
export function highlightJson(value: unknown): string {
  const json = JSON.stringify(value, null, 2)

  if (json === undefined) {
    return '<span class="tok-null">undefined</span>'
  }

  return escapeHtml(json).replace(TOKEN, (match) => {
    let cls = 'tok-num'

    if (match.startsWith('"')) {
      cls = /:\s*$/.test(match) ? 'tok-key' : 'tok-str'
    }
    else if (match === 'true' || match === 'false') {
      cls = 'tok-bool'
    }
    else if (match === 'null') {
      cls = 'tok-null'
    }

    return `<span class="${cls}">${match}</span>`
  })
}
