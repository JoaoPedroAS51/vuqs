import type { StandardSchemaV1 } from '@standard-schema/spec'
import type { Codec, QueryStateSchema, QueryStateValues } from '@vuqs/core'
import type { DebugEventCode, DebugEventMap, KnownDebugEvent } from '@vuqs/core/debug-protocol'
import type { StoredDebugConfigV1 } from '@vuqs/core/debug/console'
import { codecs, defineQueryModule, defineQuerySchema, useQueryState, useQueryStates } from '@vuqs/core'
import { createConsoleReporter, createPerformanceReporter, VUQS_DEBUG_STORAGE_KEY } from '@vuqs/core/debug/console'
import { withActiveParams, withRuntimeDefaults } from '@vuqs/core/modules'
import { expectTypeOf } from 'vitest'

declare module '@vuqs/core' {
  interface QueryModuleRegistry<TSchema extends QueryStateSchema, TParam extends string> {
    'consumer:explicit-value': {
      states: {
        options: { tag?: TParam }
        api: { explicitSnapshot: QueryStateValues<TSchema> }
      }
    }
  }
}

const withExplicitValue = defineQueryModule({
  name: 'consumer:explicit-value',
  queryStates: core => ({ explicitSnapshot: core.state.explicitValues.value }),
})

const schema = defineQuerySchema({ page: codecs.integer.withDefault(1), q: codecs.string })
const grouped = useQueryStates(schema).use(withActiveParams()).use(withRuntimeDefaults()).use(withExplicitValue())
const single = useQueryState('page', codecs.integer.withDefault(1)).use(withActiveParams()).use(withRuntimeDefaults())

expectTypeOf(grouped.activeKeys.value).toEqualTypeOf<readonly ('page' | 'q')[]>()
expectTypeOf(grouped.values.page).toEqualTypeOf<number>()
expectTypeOf(single.value).toEqualTypeOf<number>()
expectTypeOf(single.defaultValue.value).toEqualTypeOf<number | undefined>()
expectTypeOf(single.isActive.value).toEqualTypeOf<boolean>()
expectTypeOf(grouped.explicitSnapshot).toEqualTypeOf<{ readonly page?: number, readonly q?: string }>()
expectTypeOf(grouped.isActive).parameter(0).toEqualTypeOf<'page' | 'q'>()
expectTypeOf(single.setDefault).parameter(0).toEqualTypeOf<number>()
expectTypeOf<{ page: string }>().not.toExtend<typeof grouped.explicitSnapshot>()

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

expectTypeOf(codecs.json({ validate: validator })).toEqualTypeOf<Codec<Payload>>()
expectTypeOf(codecs.json({ validate: callback })).toEqualTypeOf<Codec<Payload>>()
expectTypeOf(codecs.json({ validate: validation })).toEqualTypeOf<Codec<Payload>>()
expectTypeOf(codecs.json<Payload>()).toEqualTypeOf<Codec<Payload>>()
expectTypeOf<'gtq:flush'>().toExtend<DebugEventCode>()
expectTypeOf<KnownDebugEvent>().extract<{ code: 'gtq:flush' }>().toHaveProperty('data').toEqualTypeOf<DebugEventMap['gtq:flush']>()
expectTypeOf(createConsoleReporter).toBeFunction()
expectTypeOf(createPerformanceReporter).toBeFunction()
expectTypeOf(VUQS_DEBUG_STORAGE_KEY).toBeString()
expectTypeOf<{ version: 1, console: { enabled: true, preset: 'trace' } }>().toExtend<StoredDebugConfigV1>()
