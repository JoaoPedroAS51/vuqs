import { beforeEach, describe, expect, it } from 'vitest'
import { useQueryState } from '../../../../src/core/bindings/use-query-state'
import { useQueryStates } from '../../../../src/core/bindings/use-query-states'
import { withStorage } from '../../../../src/modules/storage/storage'
import { withTestQuery as setup } from '../../../helpers/adapter'
import { createMemoryStorage, snapshot } from '../../../helpers/storage'
import { schema, stubBrowserEnvironment } from './helpers'

describe('withStorage contract', () => {
  beforeEach(stubBrowserEnvironment)

  it.each([
    [undefined, 'options are required'],
    [null, 'options are required'],
    [{}, '`key` must be a non-empty string'],
    [{ key: '  ', storage: {} }, '`key` must be a non-empty string'],
    [{ key: 'query', storage: {}, restore: 'always' }, '`restore` must be "if-empty" or "never"'],
    [{ key: 'query', storage: {}, version: 1 }, '`version` must be a string'],
    [{ key: 'query' }, '`storage` must implement load(), save(), and remove()'],
    [{ key: 'query', storage: null }, '`storage` must implement load(), save(), and remove()'],
    [{ key: 'query', storage: 'invalid' }, '`storage` must implement load(), save(), and remove()'],
    [{ key: 'query', storage: { load: true, save: () => undefined, remove: () => undefined } }, '`storage` must implement load(), save(), and remove()'],
    [{ key: 'query', storage: { load: (): undefined => undefined } }, '`storage` must implement load(), save(), and remove()'],
    [{ key: 'query', storage: { load: (): undefined => undefined, save: (): undefined => undefined } }, '`storage` must implement load(), save(), and remove()'],
  ])('throws synchronously for invalid options %#', (options, message) => {
    const { build } = setup()

    expect(() => build(() => useQueryStates(schema).use(withStorage(options as never))))
      .toThrow(message)
  })

  it('supports grouped and single-param facades with one controls shape', async () => {
    const groupedMemory = createMemoryStorage(snapshot({ q: 'grouped' }))
    const groupedSetup = setup()
    const grouped = groupedSetup.build(() => useQueryStates(schema).use(withStorage({
      key: 'grouped',
      storage: groupedMemory.storage,
    })))

    const singleMemory = createMemoryStorage(snapshot({ q: 'single' }))
    const singleSetup = setup()
    const single = singleSetup.build(() => useQueryState('q').use(withStorage({
      key: 'single',
      storage: singleMemory.storage,
    })))

    await Promise.all([grouped.storage.ready, single.storage.ready])

    expect(grouped.values).toEqual({ q: 'grouped' })
    expect(single.value).toBe('single')
    expect(grouped.storage.status.value).toBe('ready')
    expect(single.storage.status.value).toBe('ready')
  })
})
