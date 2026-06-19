import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { codecs } from '../../../../src/core/codec'
import { useQueryStates } from '../../../../src/core/use-query-states'
import { withRuntimeDefaults } from '../../../../src/modules/runtime-defaults'
import { withStorage } from '../../../../src/modules/storage'
import { withTestQuery as setup } from '../../../helpers/adapter'
import { createMemoryStorage, snapshot } from '../../../helpers/storage'

const compositionOrders = [
  ['runtime defaults before storage', false],
  ['storage before runtime defaults', true],
] as const

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
}

beforeEach(() => {
  vi.stubGlobal('window', {})
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('withRuntimeDefaults + withStorage', () => {
  it.each(compositionOrders)('does not persist runtime defaults (%s)', async (_label, storageFirst) => {
    const schema = {
      q: codecs.string,
      page: codecs.integer.withDefault(1),
    }
    const memory = createMemoryStorage()
    const { build } = setup()
    const state = build(() => {
      const query = useQueryStates(schema)

      return storageFirst
        ? query
            .use(withStorage({ key: 'filters', storage: memory.storage }))
            .use(withRuntimeDefaults())
        : query
            .use(withRuntimeDefaults())
            .use(withStorage({ key: 'filters', storage: memory.storage }))
    })

    state.setDefaults({ q: 'preset', page: 2 })
    await state.storage.ready
    await state.storage.flush()

    expect(state.values).toEqual({ q: 'preset', page: 2 })
    expect(state.selected).toEqual({})
    expect(memory.save).not.toHaveBeenCalled()
    expect(memory.remove).not.toHaveBeenCalled()
  })

  it.each(compositionOrders)('preserves an explicitly stored default when runtime defaults change (%s)', async (_label, storageFirst) => {
    const schema = {
      page: codecs.integer.withDefault(1),
    }
    const memory = createMemoryStorage(snapshot({ page: '1' }))
    const test = setup()
    const state = test.build(() => {
      const query = useQueryStates(schema)

      return storageFirst
        ? query
            .use(withStorage({ key: 'filters', storage: memory.storage }))
            .use(withRuntimeDefaults())
        : query
            .use(withRuntimeDefaults())
            .use(withStorage({ key: 'filters', storage: memory.storage }))
    })

    await state.storage.ready
    await flushMicrotasks()
    state.setDefaults({ page: 2 })

    expect(test.query.value).toEqual({ page: '1' })
    expect(state.selected).toEqual({ page: 1 })
    expect(state.values.page).toBe(1)
    expect(memory.current()).toEqual(expect.objectContaining({ query: { page: '1' } }))
  })
})
