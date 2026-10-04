import type { DebugEventCode, DebugEventMap, DebugScope, LogDebugCode, WarnDebugCode } from '../../../../src/debug-protocol'
import { describe, expectTypeOf, it } from 'vitest'
import { createDebugChannel } from '../../../../src/core/diagnostics/bus'

describe('debug protocol codes', () => {
  it('derives the code set from the event map', () => {
    expectTypeOf<DebugEventCode>().toEqualTypeOf<keyof DebugEventMap>()
  })

  it('partitions warn codes from log codes', () => {
    expectTypeOf<WarnDebugCode>().toEqualTypeOf<'engine:parse-miss' | 'adapter:error' | 'storage:error' | 'module:warn'>()
    expectTypeOf<Extract<LogDebugCode, WarnDebugCode>>().toEqualTypeOf<never>()
    expectTypeOf<'gtq:flush'>().toMatchTypeOf<LogDebugCode>()
  })

  it('derives scope from the code prefix', () => {
    expectTypeOf<'gtq'>().toMatchTypeOf<DebugScope>()
    expectTypeOf<'storage'>().toMatchTypeOf<DebugScope>()
  })
})

describe('debug protocol payloads', () => {
  it('types a structured payload', () => {
    expectTypeOf<DebugEventMap['storage:restore']['outcome']>().toEqualTypeOf<
      'mirror-only' | 'load-error' | 'url-won' | 'empty' | 'invalid' | 'restored' | 'failed' | 'server-skip' | 'disposed'
    >()
    expectTypeOf<DebugEventMap['tx:start']['mode']>().toEqualTypeOf<'patch' | 'replace'>()
    expectTypeOf<DebugEventMap['adapter:commit']['paths']>().toEqualTypeOf<readonly string[]>()
    expectTypeOf<DebugEventMap['binding:set']['touchedPaths']>().toEqualTypeOf<readonly string[]>()
    expectTypeOf<DebugEventMap['engine:clear-on-default']['defaultValue']>().toEqualTypeOf<unknown>()
  })

  it('maps occurrence-only events to undefined', () => {
    expectTypeOf<DebugEventMap['gtq:reset']>().toEqualTypeOf<undefined>()
  })
})

describe('debug emission level partition', () => {
  it('accepts a log code on debug and a warn code on warn', () => {
    const channel = createDebugChannel('types')

    channel.debug('gtq:flush', { paths: ['q'], query: {}, options: {} })
    channel.debug('gtq:reset')
    channel.warn('engine:parse-miss', { path: 'q', raw: '' })
  })

  it('rejects a mismatched level or payload', () => {
    const channel = createDebugChannel('types')

    expectTypeOf<'engine:parse-miss'>().not.toExtend<Parameters<typeof channel.debug>[0]>()
    expectTypeOf<'gtq:reset'>().not.toExtend<Parameters<typeof channel.warn>[0]>()
    expectTypeOf(channel.debug<'gtq:flush'>).parameter(1).toEqualTypeOf<DebugEventMap['gtq:flush']>()
    expectTypeOf<{ runtimeId: string }>().not.toExtend<NonNullable<Parameters<typeof channel.debug<'gtq:reset'>>[1]>>()
  })
})
