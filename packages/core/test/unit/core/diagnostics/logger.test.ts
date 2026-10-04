import { afterEach, describe, expect, it, vi } from 'vitest'
import { addDebugReporter } from '../../../../src/core/diagnostics/bus'
import { createDebugLogger } from '../../../../src/core/diagnostics/logger'
import { enableDebug } from '../../../../src/debug'
import { resetDebugState, trackReporter } from '../../../helpers/debug'

afterEach(resetDebugState)

describe('createDebugLogger', () => {
  it('emits namespaced module events on the bus at the matching level', () => {
    const captured: Array<{ code: string, level: string, data: unknown }> = []
    trackReporter(addDebugReporter(event => captured.push({ code: event.code, level: event.level, data: event.data })))

    const log = createDebugLogger('my-module')
    log.debug('resolved %O', { a: 1 })
    log.warn('bad input %s', 'x')

    expect(captured).toContainEqual({ code: 'module:log', level: 'debug', data: { namespace: 'my-module', message: 'resolved %O', values: [{ a: 1 }] } })
    expect(captured).toContainEqual({ code: 'module:warn', level: 'warn', data: { namespace: 'my-module', message: 'bad input %s', values: ['x'] } })
  })

  it('is a no-op when nothing is armed', () => {
    const log = createDebugLogger('my-module')
    expect(() => log.debug('x')).not.toThrow()
    expect(() => log.warn('y')).not.toThrow()
  })

  it('renders a module message through the opt-in console reporter', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    enableDebug()
    createDebugLogger('my-module').debug('did a thing')

    expect(logSpy).toHaveBeenCalledWith('[vuqs my-module] did a thing')
  })
})
