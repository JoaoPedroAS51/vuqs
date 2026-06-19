import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { shallowRef } from 'vue'
import { codecs } from '../../../../src/core/codec'
import { useQueryStates } from '../../../../src/core/use-query-states'
import { withContext } from '../../../../src/modules/context'
import { withStorage } from '../../../../src/modules/storage'
import { withTestQuery as setup } from '../../../helpers/adapter'
import { createMemoryStorage, snapshot } from '../../../helpers/storage'

const compositionOrders = [
  ['context before storage', false],
  ['storage before context', true],
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

describe('withContext + withStorage', () => {
  it.each(compositionOrders)('keeps context-invalid URL params out of the stored mirror (%s)', async (_label, storageFirst) => {
    const schema = {
      category: codecs.string,
      status: codecs.string,
    }
    const active = shallowRef<'products' | 'orders'>('orders')
    const memory = createMemoryStorage()
    const test = setup({ category: 'gpu', status: 'open' })
    const state = test.build(() => {
      const query = useQueryStates(schema)

      return storageFirst
        ? query
            .use(withStorage({ key: 'filters', storage: memory.storage }))
            .use(withContext({
              active,
              only: { category: ['products'], status: ['orders'] },
            }))
        : query
            .use(withContext({
              active,
              only: { category: ['products'], status: ['orders'] },
            }))
            .use(withStorage({ key: 'filters', storage: memory.storage }))
    })

    await state.storage.ready
    await state.storage.flush()

    expect(state.values).toEqual({ status: 'open' })
    expect(test.query.value).toEqual({ category: 'gpu', status: 'open' })
    expect(memory.current()).toEqual(expect.objectContaining({ query: { status: 'open' } }))
  })

  it.each(compositionOrders)('filters context-invalid snapshot params before restoring the URL (%s)', async (_label, storageFirst) => {
    const schema = {
      category: codecs.string,
      status: codecs.string,
    }
    const active = shallowRef<'products' | 'orders'>('orders')
    const memory = createMemoryStorage(snapshot({ category: 'gpu', status: 'open' }))
    const test = setup()
    const state = test.build(() => {
      const query = useQueryStates(schema)

      return storageFirst
        ? query
            .use(withStorage({ key: 'filters', storage: memory.storage }))
            .use(withContext({
              active,
              only: { category: ['products'], status: ['orders'] },
            }))
        : query
            .use(withContext({
              active,
              only: { category: ['products'], status: ['orders'] },
            }))
            .use(withStorage({ key: 'filters', storage: memory.storage }))
    })

    await state.storage.ready
    await flushMicrotasks()

    expect(state.values).toEqual({ status: 'open' })
    expect(test.query.value).toEqual({ status: 'open' })
    expect(memory.current()).toEqual(expect.objectContaining({ query: { status: 'open' } }))
  })
})
