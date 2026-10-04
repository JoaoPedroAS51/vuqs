import { describe, expect, it, vi } from 'vitest'
import { createWebStorage } from '../../../../src/modules/storage/web-storage'
import { snapshot } from '../../../helpers/storage'

describe('createWebStorage', () => {
  it('loads, saves, and removes JSON snapshots through a lazy resolver', () => {
    const values = new Map<string, string>()
    const web: Storage = {
      get length() {
        return values.size
      },
      clear: () => values.clear(),
      getItem: (key: string) => values.get(key) ?? null,
      key: index => [...values.keys()][index] ?? null,
      setItem: (key: string, value: string) => {
        values.set(key, value)
      },
      removeItem: (key: string) => {
        values.delete(key)
      },
    }
    const resolve = vi.fn(() => web)
    const storage = createWebStorage(resolve)
    const stored = snapshot({ q: 'saved' })

    expect(storage.load('filters')).toBeUndefined()
    storage.save('filters', stored)
    expect(storage.load('filters')).toEqual(stored)
    storage.remove('filters')
    expect(storage.load('filters')).toBeUndefined()
    expect(resolve).toHaveBeenCalledTimes(5)
  })

  it('throws synchronously for an invalid resolver and operation-time Web Storage failures', () => {
    expect(() => createWebStorage(undefined as never)).toThrow('expected a storage resolver function')

    const unavailable = createWebStorage(() => undefined)
    expect(() => unavailable.load('filters')).toThrow('web storage is unavailable')

    const malformed = createWebStorage(() => ({
      ...({} as Storage),
      getItem: () => '{',
    }))
    expect(() => malformed.load('filters')).toThrow(SyntaxError)
  })
})
