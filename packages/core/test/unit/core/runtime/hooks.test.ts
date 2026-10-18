import { describe, expect, it, vi } from 'vitest'
import { globalDebugChannel } from '../../../../src/core/diagnostics/bus'
import { createQueryHooks } from '../../../../src/core/runtime/hooks'

declare module '@vuqs/core' {
  interface QueryHooks {
    'test:ping': (value: number) => void
  }
}

describe('createQueryHooks', () => {
  it('calls subscribed handlers with the emitted arguments', () => {
    const hooks = createQueryHooks(globalDebugChannel)
    const handler = vi.fn()

    hooks.on('test:ping', handler)
    hooks.emit('test:ping', 42)

    expect(handler).toHaveBeenCalledWith(42)
  })

  it('calls handlers in subscription order', () => {
    const hooks = createQueryHooks(globalDebugChannel)
    const order: string[] = []

    hooks.on('test:ping', () => order.push('first'))
    hooks.on('test:ping', () => order.push('second'))
    hooks.on('test:ping', () => order.push('third'))
    hooks.emit('test:ping', 1)

    expect(order).toEqual(['first', 'second', 'third'])
  })

  it('stops calling a handler after its unsubscribe runs', () => {
    const hooks = createQueryHooks(globalDebugChannel)
    const handler = vi.fn()

    const off = hooks.on('test:ping', handler)
    off()
    hooks.emit('test:ping', 1)

    expect(handler).not.toHaveBeenCalled()
  })

  it('isolates a throwing handler so the rest still run', () => {
    const hooks = createQueryHooks(globalDebugChannel)
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const after = vi.fn()

    hooks.on('test:ping', () => {
      throw new Error('boom')
    })
    hooks.on('test:ping', after)

    expect(() => hooks.emit('test:ping', 1)).not.toThrow()
    expect(after).toHaveBeenCalledWith(1)
    expect(consoleError).toHaveBeenCalled()

    consoleError.mockRestore()
  })

  it('runs a handler removed during dispatch only in the current emit', () => {
    const hooks = createQueryHooks(globalDebugChannel)
    const order: string[] = []

    let offB: () => void

    hooks.on('test:ping', () => {
      order.push('a')
      offB()
    })
    offB = hooks.on('test:ping', () => {
      order.push('b')
    })

    hooks.emit('test:ping', 1)
    expect(order).toEqual(['a', 'b'])

    hooks.emit('test:ping', 2)
    expect(order).toEqual(['a', 'b', 'a'])
  })

  it('snapshots handlers, so subscribing during a dispatch waits for the next emit', () => {
    const hooks = createQueryHooks(globalDebugChannel)
    const late = vi.fn()

    hooks.on('test:ping', () => {
      hooks.on('test:ping', late)
    })

    hooks.emit('test:ping', 1)
    expect(late).not.toHaveBeenCalled()

    hooks.emit('test:ping', 2)
    expect(late).toHaveBeenCalledWith(2)
  })
})
