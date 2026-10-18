import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useQueryStates } from '../../../src/core/bindings/use-query-states'
import { codecs } from '../../../src/core/codecs/catalog'
import { queryParam } from '../../../src/core/schema/params/query-param'
import { withRuntimeDefaults } from '../../../src/modules/runtime-defaults'
import { withStorage } from '../../../src/modules/storage/storage'
import { withTestQuery as setup } from '../../helpers/adapter'
import { createMemoryStorage, snapshot } from '../../helpers/storage'

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
    expect(state.explicitValues).toEqual({})
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
    expect(state.explicitValues).toEqual({ page: 1 })
    expect(state.values.page).toBe(1)
    expect(memory.current()).toEqual(expect.objectContaining({ query: { page: '1' } }))
  })

  describe('nested explicit replay', () => {
    const record = () => queryParam.object('record', {
      a: queryParam('a', codecs.integer.withDefault(0)),
      b: queryParam('b', codecs.integer),
    })

    function mountNested(initial: unknown, storageFirst: boolean) {
      const memory = createMemoryStorage(initial)
      const test = setup()
      const state = test.build(() => {
        const query = useQueryStates({ record: record() })

        return storageFirst
          ? query
              .use(withStorage({ key: 'filters', storage: memory.storage }))
              .use(withRuntimeDefaults())
          : query
              .use(withRuntimeDefaults())
              .use(withStorage({ key: 'filters', storage: memory.storage }))
      })

      return { memory, test, state }
    }

    it.each(compositionOrders)('leaves defaults dynamic around a stored partial object (%s)', async (_label, storageFirst) => {
      const { memory, test, state } = mountNested(snapshot({ record: { b: '10' } }), storageFirst)

      await state.storage.ready
      await flushMicrotasks()

      expect(test.query.value).toEqual({ record: { b: '10' } })
      expect(state.explicitValues.record).toEqual({ b: 10 })
      expect(memory.current()).toEqual(expect.objectContaining({ query: { record: { b: '10' } } }))

      state.setDefaults({ record: { a: 5 } })
      expect(state.values.record).toEqual({ a: 5, b: 10 })

      state.setDefaults({ record: { a: 9 } })
      expect(state.values.record).toEqual({ a: 9, b: 10 })
      expect(state.explicitValues.record).toEqual({ b: 10 })
      expect(test.query.value).toEqual({ record: { b: '10' } })
    })

    it.each(compositionOrders)('keeps a stored explicit value equal to the current runtime default (%s)', async (_label, storageFirst) => {
      const { test, state } = mountNested(snapshot({ record: { a: '5' } }), storageFirst)

      state.setDefaults({ record: { a: 5 } })
      await state.storage.ready
      await flushMicrotasks()

      expect(test.query.value).toEqual({ record: { a: '5' } })
      expect(state.explicitValues.record).toEqual({ a: 5 })

      state.setDefaults({ record: { a: 9 } })
      expect(state.values.record).toEqual({ a: 5 })
    })
  })
})
