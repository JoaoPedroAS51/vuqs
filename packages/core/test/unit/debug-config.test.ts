import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  parseStoredDebugConfig,
  readStoredConsoleDebugConfig,
  VUQS_DEBUG_STORAGE_KEY,
} from '../../src/debug/config'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('stored debug configuration', () => {
  it('parses the complete safe console configuration', () => {
    expect(parseStoredDebugConfig(JSON.stringify({
      version: 1,
      console: {
        enabled: true,
        preset: 'trace',
        payload: 'preview',
        filter: {
          include: {
            levels: ['debug', 'warn'],
            scopes: ['gtq', 'adapter'],
            codes: ['gtq:flush', 'adapter:error'],
          },
          exclude: {
            levels: [],
            scopes: [],
            codes: ['gtq:schedule'],
          },
        },
      },
    }))).toEqual({
      status: 'enabled',
      options: {
        preset: 'trace',
        payload: 'preview',
        filter: {
          include: {
            levels: ['debug', 'warn'],
            scopes: ['gtq', 'adapter'],
            codes: ['gtq:flush', 'adapter:error'],
          },
          exclude: {
            levels: [],
            scopes: [],
            codes: ['gtq:schedule'],
          },
        },
      },
    })
  })

  it('uses reporter defaults when optional console settings are absent', () => {
    expect(parseStoredDebugConfig(JSON.stringify({
      version: 1,
      console: { enabled: true },
    }))).toEqual({ status: 'enabled', options: {} })

    expect(parseStoredDebugConfig(JSON.stringify({
      version: 1,
      console: { enabled: true, preset: 'summary', payload: 'hidden', filter: {} },
    }))).toEqual({
      status: 'enabled',
      options: { preset: 'summary', payload: 'hidden', filter: {} },
    })
  })

  it('keeps a present configuration disabled without discarding its valid settings', () => {
    expect(parseStoredDebugConfig(JSON.stringify({ version: 1 }))).toEqual({ status: 'disabled' })
    expect(parseStoredDebugConfig(JSON.stringify({
      version: 1,
      console: { enabled: false, preset: 'trace' },
    }))).toEqual({ status: 'disabled' })
  })

  it.each([
    ['malformed JSON', '{', 'the stored value must be valid JSON'],
    ['null root', 'null', 'configuration must be an object'],
    ['primitive root', '1', 'configuration must be an object'],
    ['array root', '[]', 'configuration must be an object'],
    ['unknown root property', '{"version":1,"secret":"x"}', 'configuration contains an unsupported property'],
    ['unknown version', '{"version":2}', 'version must be 1'],
    ['non-object console', '{"version":1,"console":[]}', 'console must be an object'],
    ['unknown console property', '{"version":1,"console":{"enabled":true,"secret":"x"}}', 'console contains an unsupported property'],
    ['missing enabled', '{"version":1,"console":{}}', 'console.enabled must be a boolean'],
    ['invalid enabled', '{"version":1,"console":{"enabled":"yes"}}', 'console.enabled must be a boolean'],
    ['invalid preset', '{"version":1,"console":{"enabled":true,"preset":"verbose"}}', 'console.preset must be "summary" or "trace"'],
    ['unsafe payload', '{"version":1,"console":{"enabled":true,"payload":"full"}}', 'console.payload must be "preview" or "hidden"'],
    ['non-object filter', '{"version":1,"console":{"enabled":true,"filter":[]}}', 'console.filter must be an object'],
    ['unknown filter property', '{"version":1,"console":{"enabled":true,"filter":{"secret":true}}}', 'console.filter contains an unsupported property'],
    ['non-object selector', '{"version":1,"console":{"enabled":true,"filter":{"include":[]}}}', 'console.filter.include must be an object'],
    ['unknown selector property', '{"version":1,"console":{"enabled":true,"filter":{"exclude":{"secret":[]}}}}', 'console.filter.exclude contains an unsupported property'],
    ['non-array levels', '{"version":1,"console":{"enabled":true,"filter":{"include":{"levels":"debug"}}}}', 'console.filter.include.levels must be an array'],
    ['unknown level', '{"version":1,"console":{"enabled":true,"filter":{"include":{"levels":["info"]}}}}', 'console.filter.include.levels contains an unsupported value'],
    ['non-array scopes', '{"version":1,"console":{"enabled":true,"filter":{"include":{"scopes":"gtq"}}}}', 'console.filter.include.scopes must be an array'],
    ['unknown scope', '{"version":1,"console":{"enabled":true,"filter":{"include":{"scopes":["unknown"]}}}}', 'console.filter.include.scopes contains an unsupported value'],
    ['non-array codes', '{"version":1,"console":{"enabled":true,"filter":{"include":{"codes":"gtq:flush"}}}}', 'console.filter.include.codes must be an array'],
    ['unknown code', '{"version":1,"console":{"enabled":true,"filter":{"include":{"codes":["gtq:unknown"]}}}}', 'console.filter.include.codes contains an unsupported value'],
  ])('rejects %s', (_label, raw, reason) => {
    const result = parseStoredDebugConfig(raw)

    expect(result).toEqual({
      status: 'invalid',
      message: `[vuqs] Ignored invalid "${VUQS_DEBUG_STORAGE_KEY}" configuration: ${reason}.`,
    })
    expect(result.status === 'invalid' ? result.message : '').not.toContain('secret":"x')
  })

  it('reads the browser key without mutating storage', () => {
    const getItem = vi.fn(() => JSON.stringify({ version: 1, console: { enabled: true } }))
    const setItem = vi.fn()
    vi.stubGlobal('window', {})
    vi.stubGlobal('localStorage', { getItem, setItem })

    expect(readStoredConsoleDebugConfig()).toEqual({ status: 'enabled', options: {} })
    expect(getItem).toHaveBeenCalledWith(VUQS_DEBUG_STORAGE_KEY)
    expect(setItem).not.toHaveBeenCalled()
  })

  it('distinguishes absent and unavailable storage without throwing', () => {
    vi.stubGlobal('window', {})
    vi.stubGlobal('localStorage', { getItem: () => null })
    expect(readStoredConsoleDebugConfig()).toEqual({ status: 'absent' })

    vi.stubGlobal('localStorage', undefined)
    expect(readStoredConsoleDebugConfig()).toEqual({ status: 'unavailable' })

    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('denied')
      },
    })
    expect(readStoredConsoleDebugConfig()).toEqual({ status: 'unavailable' })

    vi.stubGlobal('window', undefined)
    expect(readStoredConsoleDebugConfig()).toEqual({ status: 'unavailable' })
  })
})
