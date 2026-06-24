import { describe, expect, it, vi } from 'vitest'
import { createQueryHooks } from '../../src/core/hooks'

declare module 'vuqs' {
  interface QueryHooks {
    'test:ping': (value: number) => void
  }
}

describe('createQueryHooks', () => {
  it('calls subscribed handlers with the emitted arguments', () => {
    const hooks = createQueryHooks()
    const handler = vi.fn()

    hooks.on('test:ping', handler)
    hooks.emit('test:ping', 42)

    expect(handler).toHaveBeenCalledWith(42)
  })

  it('stops calling a handler after its unsubscribe runs', () => {
    const hooks = createQueryHooks()
    const handler = vi.fn()

    const off = hooks.on('test:ping', handler)
    off()
    hooks.emit('test:ping', 1)

    expect(handler).not.toHaveBeenCalled()
  })

  it('isolates a throwing handler so the rest still run', () => {
    const hooks = createQueryHooks()
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

  it('snapshots handlers, so a handler unsubscribing mid-dispatch still runs this emit', () => {
    const hooks = createQueryHooks()
    const order: string[] = []
    let off: () => void = () => {}

    off = hooks.on('test:ping', () => {
      order.push('a')
      off()
    })
    hooks.on('test:ping', () => {
      order.push('b')
    })

    hooks.emit('test:ping', 1)
    expect(order).toEqual(['a', 'b'])

    hooks.emit('test:ping', 2)
    expect(order).toEqual(['a', 'b', 'b'])
  })

  it('snapshots handlers, so subscribing during a dispatch waits for the next emit', () => {
    const hooks = createQueryHooks()
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
