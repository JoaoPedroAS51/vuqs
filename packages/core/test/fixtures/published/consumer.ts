import type { StandardSchemaV1 } from '@standard-schema/spec'
import type { Codec, QueryStateSchema, QueryStateValues } from '@vuqs/core'
import type { DebugEventCode, DebugEventMap, DebugScope, EngineSnapshot, KnownDebugEvent } from '@vuqs/core/debug-protocol'
import type { StoredDebugConfigV1 } from '@vuqs/core/debug/console'
import { codecs, defineQueryModule, defineQuerySchema, useQueryState, useQueryStates } from '@vuqs/core'
import { createConsoleReporter, createPerformanceReporter, VUQS_DEBUG_STORAGE_KEY } from '@vuqs/core/debug/console'
import { withActiveParams, withRuntimeDefaults } from '@vuqs/core/modules'

type IsAny<T> = 0 extends (1 & T) ? true : false
type Equal<A, B> = IsAny<A> extends true
  ? false
  : (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2)
      ? (<T>() => T extends B ? 1 : 2) extends (<T>() => T extends A ? 1 : 2) ? true : false
      : false
type Assert<T extends true> = T

declare module '@vuqs/core' {
  interface QueryModuleRegistry<TSchema extends QueryStateSchema, TParam extends string> {
    'consumer:selection': {
      states: {
        options: { tag?: TParam }
        api: { selectionSnapshot: QueryStateValues<TSchema> }
      }
    }
  }
}

const withSelection = defineQueryModule({
  name: 'consumer:selection',
  queryStates: core => ({ selectionSnapshot: core.state.selected.value }),
})

const schema = defineQuerySchema({ page: codecs.integer.withDefault(1), q: codecs.string })
const grouped = useQueryStates(schema).use(withActiveParams()).use(withRuntimeDefaults()).use(withSelection())
const single = useQueryState('page', codecs.integer.withDefault(1)).use(withActiveParams()).use(withRuntimeDefaults())

export type GroupedKeys = Assert<Equal<typeof grouped.activeKeys.value, readonly ('page' | 'q')[]>>
export type GroupedPage = Assert<Equal<typeof grouped.values.page, number>>
export type SingleValue = Assert<Equal<typeof single.value, number>>
export type SingleDefault = Assert<Equal<typeof single.defaultValue.value, number | undefined>>
export type SingleActive = Assert<Equal<typeof single.isActive.value, boolean>>
export type CustomSelection = Assert<Equal<typeof grouped.selectionSnapshot, { readonly page?: number | undefined, readonly q?: string | undefined }>>

// @ts-expect-error The key must belong to the schema.
grouped.isActive('missing')
// @ts-expect-error The single-param default must match its codec.
single.setDefault('invalid')
// @ts-expect-error The custom module retains the schema's value types.
export const invalidSelection: typeof grouped.selectionSnapshot = { page: 'invalid' }

interface Payload { id: string }
const validator: StandardSchemaV1<unknown, Payload> = {
  '~standard': {
    version: 1,
    vendor: 'consumer',
    validate: value => ({ value: { id: String(value) } }),
  },
}
const callback = (value: unknown): Payload => ({ id: String(value) })
declare const validation: typeof validator | typeof callback

export const schemaJson = codecs.json({ validate: validator })
export const callbackJson = codecs.json({ validate: callback })
export const unionJson = codecs.json({ validate: validation })
export const explicitJson = codecs.json<Payload>()

export type SchemaJson = Assert<Equal<typeof schemaJson, Codec<Payload>>>
export type CallbackJson = Assert<Equal<typeof callbackJson, Codec<Payload>>>
export type UnionJson = Assert<Equal<typeof unionJson, Codec<Payload>>>
export type ExplicitJson = Assert<Equal<typeof explicitJson, Codec<Payload>>>

export const code = 'gtq:flush' satisfies DebugEventCode
export type Events = DebugEventMap
export type Scope = DebugScope
export type Event = KnownDebugEvent
export type Snapshot = EngineSnapshot
export const consoleReporter = createConsoleReporter({ preset: 'summary' })
export const performanceReporter = createPerformanceReporter({ limit: 10 })
export const storageKey = VUQS_DEBUG_STORAGE_KEY
export const storedConfig = { version: 1, console: { enabled: true, preset: 'trace' } } satisfies StoredDebugConfigV1
