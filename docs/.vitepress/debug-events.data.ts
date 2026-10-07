import type { DebugEventCode } from '../../packages/core/src/core/diagnostics/events'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { DEBUG_EVENT_ENTRIES } from '../../packages/core/src/debug/event-catalog'

interface PayloadField {
  name: string
  type: string
  optional: boolean
  description: string
}

interface EventReference {
  code: DebugEventCode
  level: 'debug' | 'warn'
  emittedWhen: string
  fields: PayloadField[]
}

export declare const data: EventReference[]

const descriptions: Record<string, string> = {
  keys: 'Logical param names managed by the binding.',
  managedPaths: 'Raw query paths owned by the binding.',
  touched: 'Logical param names included in this write.',
  touchedPaths: 'Raw query paths touched by this write.',
  values: 'Values supplied by the caller.',
  options: 'Resolved navigation options for this write.',
  paths: 'Raw query paths involved in the operation.',
  defaultValue: 'Resolved default used for the equality comparison.',
  path: 'Raw query path that could not be decoded.',
  raw: 'Value received from the parsed query.',
  deltas: 'Pending raw writes by path. A null delta removes the path.',
  pendingPathCount: 'Number of paths still pending in the write queue.',
  previous: 'Navigation options of the existing batch.',
  incoming: 'Navigation options of the incoming write.',
  resolved: 'Navigation options after merging the writes.',
  writeCount: 'Number of writes coalesced into the batch.',
  delayMs: 'Flush delay in milliseconds.',
  mechanism: 'Scheduling mechanism used for this flush.',
  reason: 'Reason the operation was skipped.',
  dropped: 'Raw paths removed from the optimistic overlay.',
  mode: 'Partial patch or whole-state replacement.',
  origin: 'Description of the producer origin symbol, when supplied.',
  adapter: 'Diagnostic name of the adapter.',
  source: 'Whether the committed change came from a managed write or an external update.',
  error: 'Error raised by the operation.',
  rolledBack: 'Raw paths whose pending changes were rolled back.',
  event: 'Name of the module signal.',
  args: 'Arguments passed to the signal handlers.',
  stages: 'Pipeline stages receiving the transform.',
  enforce: 'Ordering band of the transform within each stage.',
  defaults: 'Runtime default values supplied by the caller.',
  context: 'Context identifier associated with this change.',
  state: 'Whether the runtime default layer was registered or disposed.',
  to: 'Target context identifier.',
  valid: 'Logical params valid in the new context.',
  invalid: 'Logical params invalid in the new context.',
  policy: 'Configured storage restore policy.',
  outcome: 'Result of the initial restore or mirror decision.',
  revision: 'Revision of the selection being persisted.',
  operation: 'Storage lifecycle operation being attempted or reporting an error.',
  from: 'Revision replaced by a newer pending write.',
  namespace: 'Source tag supplied to the custom logger.',
  message: 'Message supplied by the module author.',
}

const overrides: Partial<Record<DebugEventCode, Record<string, string>>> = {
  'tx:start': { id: 'Transaction identifier assigned by the adapter runtime.' },
  'adapter:navigate': { mode: 'History operation requested from the adapter.' },
  'ctx:build': {
    kept: 'Logical params preserved in the target context.',
    dropped: 'Logical params removed when building the target query.',
  },
  'storage:write': { query: 'Serialized explicit selection being mirrored.' },
  'storage:coalesce': { to: 'Revision of the newer pending write.' },
  'module:log': { values: 'Structured console arguments supplied by the module author.' },
  'module:warn': { values: 'Structured console arguments supplied by the module author.' },
}

function describe(code: DebugEventCode, name: string): string {
  const description = overrides[code]?.[name]
    ?? (name === 'id' ? 'Binding identifier.' : undefined)
    ?? (name === 'key' ? (code.startsWith('storage:') ? 'Storage key of the selection mirror.' : 'Logical param name.') : undefined)
    ?? (name === 'query' ? (code === 'adapter:commit' ? 'Final committed parsed query.' : 'Serialized query prepared by the operation.') : undefined)
    ?? descriptions[name]

  if (!description) {
    throw new Error(`Missing debug payload description for ${code}.${name}`)
  }

  return description
}

const eventsFile = new URL('../../packages/core/src/core/diagnostics/events.ts', import.meta.url)
const overlayFile = new URL('../../packages/core/src/core/runtime/overlay.ts', import.meta.url)

export default {
  watch: ['../../packages/core/src/core/diagnostics/events.ts', '../../packages/core/src/core/runtime/overlay.ts'],
  load(): EventReference[] {
    const source = ts.createSourceFile(eventsFile.pathname, readFileSync(eventsFile, 'utf8'), ts.ScriptTarget.Latest, true)
    const eventMap = source.statements.find(statement => ts.isInterfaceDeclaration(statement) && statement.name.text === 'DebugEventMap')

    if (!eventMap || !ts.isInterfaceDeclaration(eventMap)) {
      throw new Error('DebugEventMap declaration was not found')
    }

    const overlaySource = ts.createSourceFile(overlayFile.pathname, readFileSync(overlayFile, 'utf8'), ts.ScriptTarget.Latest, true)
    const overlayTypes = new Map(overlaySource.statements.filter(ts.isTypeAliasDeclaration).map(alias => [alias.name.text, alias.type.getText(overlaySource)]))
    const overlayType = overlayTypes.get('Overlay')?.replace(/\bOverlayDelta\b/g, overlayTypes.get('OverlayDelta') ?? 'OverlayDelta')
    if (!overlayType) {
      throw new Error('Overlay declaration was not found')
    }

    const fieldsByCode = new Map<string, PayloadField[]>()

    for (const member of eventMap.members) {
      if (!ts.isPropertySignature(member) || !ts.isStringLiteral(member.name) || !member.type) {
        throw new Error('Unsupported DebugEventMap member')
      }

      const code = member.name.text as DebugEventCode
      const fields: PayloadField[] = []

      if (ts.isTypeLiteralNode(member.type)) {
        for (const field of member.type.members) {
          if (!ts.isPropertySignature(field) || !field.type) {
            throw new Error(`Unsupported payload declaration for ${code}`)
          }

          const name = field.name.getText(source)
          fields.push({
            name,
            type: field.type.getText(source).replace(/^Overlay$/, overlayType),
            optional: Boolean(field.questionToken),
            description: describe(code, name),
          })
        }
      }
      else if (member.type.kind !== ts.SyntaxKind.UndefinedKeyword) {
        throw new Error(`Unsupported payload type for ${code}`)
      }

      fieldsByCode.set(code, fields)
    }

    return DEBUG_EVENT_ENTRIES.map(([code, reference]) => {
      const fields = fieldsByCode.get(code)
      if (!fields || fields.length !== reference.payload.length || fields.some(field => !reference.payload.includes(field.name as never))) {
        throw new Error(`Debug payload fields do not match the catalog for ${code}`)
      }

      return { code, level: reference.level, emittedWhen: reference.emittedWhen.replace(/`/g, ''), fields }
    })
  },
}
