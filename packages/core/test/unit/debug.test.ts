import type { ParsedQuery } from '../../src/core/types'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, effectScope, ref } from 'vue'
import { createTestingAdapter } from '../../src/adapters/testing'
import { installQueryAdapter } from '../../src/core/adapter'
import { codecs } from '../../src/core/codec'
import { createDebugLogger } from '../../src/core/debug/logger'
import { debugMessages, sprintf } from '../../src/core/debug/messages'
import { debug, isDebugFlagSet, setDebugSink, warn } from '../../src/core/debug/sink'
import { useQueryStates } from '../../src/core/use-query-states'
import { disableDebug, enableDebug } from '../../src/debug'
import { withContext } from '../../src/modules/context'
import { withRuntimeDefaults } from '../../src/modules/runtime-defaults'
import { withTestQuery } from '../helpers/adapter'

const flush = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0))

// Records the sequence of emitted codes so tests assert lifecycle order without
// coupling to the exact log strings.
function captureCodes(): string[] {
  const codes: string[] = []
  setDebugSink(code => codes.push(code))
  return codes
}

// Returns true when `seq` appears as an in-order subsequence of `codes`.
function inOrder(codes: string[], seq: string[]): boolean {
  let i = 0
  for (const code of codes) {
    if (code === seq[i]) {
      i++
    }
    if (i === seq.length) {
      return true
    }
  }
  return false
}

function fakeStorage(
  store: Record<string, string> = {},
  opts: { throwOnSet?: boolean, breakProbe?: boolean } = {},
): Storage {
  return {
    setItem(key: string, value: string) {
      if (opts.throwOnSet) {
        throw new Error('storage denied')
      }
      if (!opts.breakProbe) {
        store[key] = value
      }
    },
    getItem(key: string) {
      return key in store ? store[key] : null
    },
    removeItem(key: string) {
      delete store[key]
    },
  } as Storage
}

afterEach(() => {
  setDebugSink(null)
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe('sprintf', () => {
  it('coerces %s/%d/%f in placeholder order', () => {
    expect(sprintf('%s then %d and %f', 'a', 1, 2.5)).toBe('a then 1 and 2.5')
  })

  it('serializes a truthy %O and strips quotes from keys', () => {
    expect(sprintf('value %O', { a: 1, b: 'x' })).toBe('value {a:1,b:"x"}')
  })

  it('falls back to String() for a falsy %O', () => {
    expect(sprintf('value %O', null)).toBe('value null')
  })

  it('leaves a string without placeholders unchanged', () => {
    expect(sprintf('[vuqs gtq] Reset')).toBe('[vuqs gtq] Reset')
  })
})

describe('isDebugFlagSet', () => {
  it('reads the DEBUG env var on the server, matching as a substring', () => {
    vi.stubGlobal('window', undefined)
    vi.stubEnv('DEBUG', 'app:*,vuqs')
    expect(isDebugFlagSet()).toBe(true)
  })

  it('returns false on the server when DEBUG is unset', () => {
    vi.stubGlobal('window', undefined)
    vi.stubEnv('DEBUG', '')
    expect(isDebugFlagSet()).toBe(false)
  })

  it('returns false on the client when localStorage is undefined', () => {
    vi.stubGlobal('window', {})
    vi.stubGlobal('localStorage', undefined)
    expect(isDebugFlagSet()).toBe(false)
  })

  it('returns true on the client when localStorage.debug includes vuqs', () => {
    vi.stubGlobal('window', {})
    vi.stubGlobal('localStorage', fakeStorage({ debug: 'app,vuqs' }))
    expect(isDebugFlagSet()).toBe(true)
  })

  it('returns false on the client when the flag names another library', () => {
    vi.stubGlobal('window', {})
    vi.stubGlobal('localStorage', fakeStorage({ debug: 'nuqs' }))
    expect(isDebugFlagSet()).toBe(false)
  })

  it('returns false on the client when the debug key is unset', () => {
    vi.stubGlobal('window', {})
    vi.stubGlobal('localStorage', fakeStorage({}))
    expect(isDebugFlagSet()).toBe(false)
  })

  it('returns false when localStorage access throws', () => {
    vi.stubGlobal('window', {})
    vi.stubGlobal('localStorage', fakeStorage({}, { throwOnSet: true }))
    expect(isDebugFlagSet()).toBe(false)
  })

  it('returns false when the availability probe does not round-trip', () => {
    vi.stubGlobal('window', {})
    vi.stubGlobal('localStorage', fakeStorage({ debug: 'vuqs' }, { breakProbe: true }))
    expect(isDebugFlagSet()).toBe(false)
  })
})

describe('sink registry', () => {
  it('is a no-op when no sink is installed', () => {
    setDebugSink(null)
    expect(() => debug('gtq:reset')).not.toThrow()
    expect(() => warn('codec:json-error', 'x', new Error('e'))).not.toThrow()
  })

  it('forwards debug events as (code, args)', () => {
    const sink = vi.fn()
    setDebugSink(sink)

    debug('gtq:enqueue', { a: 1 }, { b: 2 })

    expect(sink).toHaveBeenCalledWith('gtq:enqueue', [{ a: 1 }, { b: 2 }])
  })

  it('marks warn events with the isWarn flag', () => {
    const sink = vi.fn()
    setDebugSink(sink)

    const error = new Error('bad json')
    warn('codec:json-error', '{', error)

    expect(sink).toHaveBeenCalledWith('codec:json-error', ['{', error], true)
  })
})

describe('createDebugLogger', () => {
  it('emits namespaced messages through the shared sink', () => {
    const sink = vi.fn()
    setDebugSink(sink)

    const log = createDebugLogger('my-module')
    log.debug('resolved %O', { a: 1 })
    log.warn('bad input %s', 'x')

    expect(sink).toHaveBeenNthCalledWith(1, '[vuqs my-module] resolved %O', [{ a: 1 }], undefined)
    expect(sink).toHaveBeenNthCalledWith(2, '[vuqs my-module] bad input %s', ['x'], true)
  })

  it('is a no-op when no sink is installed', () => {
    setDebugSink(null)
    const log = createDebugLogger('my-module')
    expect(() => log.debug('x')).not.toThrow()
    expect(() => log.warn('y')).not.toThrow()
  })

  it('renders a literal module message through the console sink', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    enableDebug()
    createDebugLogger('my-module').debug('did a thing')

    expect(logSpy).toHaveBeenCalledWith('[vuqs my-module] did a thing')
  })
})

describe('opt-in entry (@vuqs/core/debug)', () => {
  it('renders debug events via console.log and a performance mark', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const mark = vi.spyOn(performance, 'mark').mockImplementation(() => ({}) as PerformanceMark)

    enableDebug()
    debug('gtq:reset')

    expect(log).toHaveBeenCalledWith(debugMessages['gtq:reset'])
    expect(mark).toHaveBeenCalledWith('[vuqs gtq] Reset')
  })

  it('renders warnings via console.warn without a mark', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const mark = vi.spyOn(performance, 'mark').mockImplementation(() => ({}) as PerformanceMark)

    enableDebug()
    const error = new Error('bad json')
    warn('codec:json-error', '{', error)

    expect(warnSpy).toHaveBeenCalledWith(debugMessages['codec:json-error'], '{', error)
    expect(mark).not.toHaveBeenCalled()
  })

  it('stops rendering after disableDebug', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})

    enableDebug()
    disableDebug()
    debug('gtq:reset')

    expect(log).not.toHaveBeenCalled()
  })

  it('auto-enables on import when the flag is set', async () => {
    vi.resetModules()
    vi.stubGlobal('window', undefined)
    vi.stubEnv('DEBUG', 'vuqs')

    const entry = await import('../../src/debug')

    expect(entry.enableDebug).toBeTypeOf('function')
  })

  it('skips the performance mark when User Timing is unavailable', async () => {
    vi.resetModules()
    vi.stubGlobal('performance', { now: () => 0 })

    const sink = await import('../../src/core/debug/sink')
    const entry = await import('../../src/debug')
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})

    entry.enableDebug()
    sink.debug('gtq:reset')

    expect(log).toHaveBeenCalledWith('[vuqs gtq] Reset')
  })
})

describe('lifecycle tracing', () => {
  it('traces the write → coalesce → navigate → reconcile lifecycle', async () => {
    const codes = captureCodes()
    const { run } = withTestQuery({ q: 'a' })
    const { values } = run(() => useQueryStates({ q: codecs.string }))

    values.q = 'b'
    await flush()

    expect(inOrder(codes, ['gtq:enqueue', 'gtq:schedule', 'gtq:flush', 'engine:reconcile'])).toBe(true)
    expect(codes).toContain('binding:created')
    expect(codes).toContain('binding:set')
  })
})

describe('module tracing', () => {
  it('traces a context change resetting runtime defaults', async () => {
    const tab = ref('products')
    const { build } = withTestQuery({ q: 'phone' })
    const schema = {
      q: codecs.string,
      category: codecs.string,
    }
    const q = build(() =>
      useQueryStates(schema)
        .use(withRuntimeDefaults())
        .use(withContext({ active: tab, preserve: ['q'], only: { category: ['products'] } })),
    )
    q.setDefaults({ category: 'phones' })

    const codes = captureCodes()
    tab.value = 'reviews'
    await flush()

    expect(inOrder(codes, ['ctx:change', 'rd:reset'])).toBe(true)
  })

  it('traces default layer registration and disposal', () => {
    const events: Array<[string, unknown[]]> = []
    setDebugSink((code, args) => events.push([code, args]))

    const query = ref<ParsedQuery>({})
    const navigate = vi.fn()
    const app = createApp({})
    installQueryAdapter(app, { query, navigate })

    const scope = effectScope()
    app.runWithContext(() =>
      scope.run(() => useQueryStates({ q: codecs.string }).use(withRuntimeDefaults())),
    )
    scope.stop()

    expect(events).toContainEqual(['rd:register', ['registered']])
    expect(events).toContainEqual(['rd:register', ['disposed']])
  })
})

describe('parse visibility', () => {
  it('warns once when a present value fails to decode', () => {
    const events: Array<[string, unknown[]]> = []
    setDebugSink((code, args) => events.push([code, args]))

    const adapter = createTestingAdapter({ searchParams: { n: 'abc' }, hasMemory: true })
    const navigate = vi.fn(adapter.navigate)
    const app = createApp({})
    installQueryAdapter(app, { query: adapter.query, navigate })

    const { values } = app.runWithContext(() => useQueryStates({ n: codecs.integer }))
    // Touch the read model so the parse runs.
    void values.n

    const parseMisses = events.filter(([code]) => code === 'engine:parse-miss')
    expect(parseMisses.length).toBeGreaterThan(0)
    expect(parseMisses[0]).toEqual(['engine:parse-miss', ['n', 'abc']])
  })

  it('warns once for a persistently malformed json value', () => {
    const events: Array<[string, unknown[]]> = []
    setDebugSink((code, args) => events.push([code, args]))

    const codec = codecs.json()
    codec.parse('{bad')
    codec.parse('{bad') // same value, deduped across recomputes
    codec.parse('[also bad') // a different value warns again

    const jsonErrors = events.filter(([code]) => code === 'codec:json-error')
    expect(jsonErrors.length).toBe(2)
    expect(jsonErrors[0]?.[1]?.[0]).toBe('{bad')
  })
})
