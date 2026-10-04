import { beforeEach, describe, expect, it } from 'vitest'
import { useQueryStates } from '../../../../src/core/bindings/use-query-states'
import { createCodec } from '../../../../src/core/codecs/codec'
import { queryParam } from '../../../../src/core/schema/params/query-param'
import { withStorage } from '../../../../src/modules/storage/storage'
import { withTestQuery as setup } from '../../../helpers/adapter'
import { createMemoryStorage, snapshot } from '../../../helpers/storage'
import { schema, stubBrowserEnvironment } from './helpers'

describe('withStorage operational errors', () => {
  beforeEach(stubBrowserEnvironment)

  it('resolves ready and exposes a rejected load through status and error', async () => {
    const failure = new Error('load failed')
    const memory = createMemoryStorage()
    memory.load.mockRejectedValue(failure)
    const { build } = setup()
    const state = build(() => useQueryStates(schema).use(withStorage({
      key: 'filters',
      storage: memory.storage,
    })))

    const flushing = state.storage.flush()

    await expect(state.storage.ready).resolves.toBeUndefined()
    await expect(flushing).resolves.toBeUndefined()
    expect(state.storage.status.value).toBe('error')
    expect(state.storage.error.value).toBe(failure)
  })

  it.each([
    [null, 'stored snapshot is invalid'],
    [[], 'stored snapshot is invalid'],
    [{ format: 2, savedAt: 1, query: {} }, 'stored snapshot is invalid'],
    [{ format: 1, savedAt: 'now', query: {} }, 'stored snapshot is invalid'],
    [{ format: 1, savedAt: Number.POSITIVE_INFINITY, query: {} }, 'stored snapshot is invalid'],
    [{ format: 1, savedAt: 1, query: null }, 'stored snapshot is invalid'],
    [{ format: 1, savedAt: 1, query: [] }, 'stored snapshot is invalid'],
    [{ format: 1, savedAt: 1, query: {}, version: 2 }, 'stored snapshot is invalid'],
    [snapshot({}, 'old'), 'stored snapshot version is incompatible'],
  ])('settles an invalid or incompatible snapshot as an operational error %#', async (stored, message) => {
    const memory = createMemoryStorage(stored)
    const { build } = setup()
    const state = build(() => useQueryStates(schema).use(withStorage({
      key: 'filters',
      storage: memory.storage,
      version: 'current',
    })))

    await expect(state.storage.ready).resolves.toBeUndefined()

    expect(state.storage.status.value).toBe('error')
    expect(state.storage.error.value).toBeInstanceOf(Error)
    expect((state.storage.error.value as Error).message).toContain(message)
    expect(memory.save).not.toHaveBeenCalled()
    expect(memory.remove).not.toHaveBeenCalled()
  })

  it('resolves ready on save failure and recovers after a later successful write', async () => {
    const failure = new Error('save failed')
    const memory = createMemoryStorage()
    memory.save.mockRejectedValue(failure)
    const { build } = setup({ q: 'initial' })
    const state = build(() => useQueryStates(schema).use(withStorage({
      key: 'filters',
      storage: memory.storage,
    })))

    await expect(state.storage.ready).resolves.toBeUndefined()
    expect(state.storage.status.value).toBe('error')
    expect(state.storage.error.value).toBe(failure)

    memory.save.mockResolvedValue(undefined)
    state.patch({ q: 'recovered' })
    await expect(state.storage.flush()).resolves.toBeUndefined()

    expect(state.storage.status.value).toBe('ready')
    expect(state.storage.error.value).toBeUndefined()
  })

  it('resolves flush on remove failure and recovers on a later remove', async () => {
    const failure = new Error('remove failed')
    const memory = createMemoryStorage(snapshot({ q: 'selected' }))
    const { build } = setup({ q: 'selected' })
    const state = build(() => useQueryStates(schema).use(withStorage({
      key: 'filters',
      storage: memory.storage,
    })))

    await state.storage.ready
    memory.remove.mockRejectedValueOnce(failure)
    state.clear()

    await expect(state.storage.flush()).resolves.toBeUndefined()
    expect(state.storage.status.value).toBe('error')
    expect(state.storage.error.value).toBe(failure)

    state.clear()
    await expect(state.storage.flush()).resolves.toBeUndefined()
    expect(state.storage.status.value).toBe('ready')
    expect(state.storage.error.value).toBeUndefined()
  })

  it('captures serialization and write-pipeline failures without rejecting', async () => {
    const brokenSchema = {
      q: queryParam('q', createCodec<string>({
        parse: value => typeof value === 'string' ? value : undefined,
        serialize: () => {
          throw new Error('serialize failed')
        },
        eq: (left, right) => left === right,
      })),
    }
    const memory = createMemoryStorage()
    const first = setup({ q: 'selected' })
    const serialization = first.build(() => useQueryStates(brokenSchema).use(withStorage({
      key: 'broken',
      storage: memory.storage,
    })))

    await expect(serialization.storage.ready).resolves.toBeUndefined()
    expect((serialization.storage.error.value as Error).message).toBe('serialize failed')

    const stored = createMemoryStorage(snapshot({ q: 'stored' }))
    const second = setup()
    const writePipeline = second.build(() => useQueryStates(schema)
      .use((core) => {
        core.pipeline.tap('write', () => {
          throw new Error('write failed')
        })
        return {}
      })
      .use(withStorage({ key: 'broken', storage: stored.storage })))

    await expect(writePipeline.storage.ready).resolves.toBeUndefined()
    expect((writePipeline.storage.error.value as Error).message).toBe('write failed')
  })
})
