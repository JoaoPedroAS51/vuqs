import type { EffectScope } from 'vue'
import type { QueryCore } from '../../../../../src/core/module-system/query-core'
import type { QueryStateSchema } from '../../../../../src/core/schema/schema'
import { describe, expect, it, vi } from 'vitest'
import { getCurrentScope, ref } from 'vue'
import { useQueryState } from '../../../../../src/core/bindings/use-query-state'
import { useQueryStates } from '../../../../../src/core/bindings/use-query-states'
import { codecs } from '../../../../../src/core/codecs/catalog'
import { defineQueryModule } from '../../../../../src/core/module-system/define-query-module'
import { queryParam } from '../../../../../src/core/schema/params/query-param'
import { withTestQuery as setup } from '../../../../helpers/adapter'

declare module '@vuqs/core' {
  // eslint-disable-next-line unused-imports/no-unused-vars -- the params must match the base registry signature
  interface QueryModuleRegistry<TSchema extends QueryStateSchema, TOptions, TInference = unknown> {
    'test:attributed': {
      states: () => typeof withAttributed.definition.states<TSchema>
    }
  }
}

const schema = {
  q: queryParam('q', codecs.string),
  page: queryParam('page', codecs.integer.withDefault(1)),
}

const withAttributed = defineQueryModule({
  name: 'test:attributed',
  states: <TSchema extends QueryStateSchema>(core: QueryCore<TSchema>) => ({
    api: {},
    pipeline: [core.pipeline.define('read', () => ({}) as never, { projection: 'resolved' })] as const,
  }),
})

const flush = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0))

describe('registration identity and ownership', () => {
  it('removes only the disposed installation when registrations share a source', () => {
    const { build } = setup()
    const shared = ref({ q: 'shared' })
    const first = build(() => useQueryStates(schema))
    const second = build(() => useQueryStates(schema))
    let firstScope!: EffectScope
    first.use(() => {
      firstScope = getCurrentScope()!

      return { api: {}, defaults: [shared, shared] }
    })
    second.use(() => ({ api: {}, defaults: [shared] }))

    shared.value = { q: 'updated' }

    expect(first.values.q).toBe('updated')
    expect(second.values.q).toBe('updated')

    firstScope.stop()
    firstScope.stop()

    expect(first.values.q).toBeUndefined()
    expect(second.values.q).toBe('updated')

    shared.value = { q: 'after-disposal' }

    expect(first.values.q).toBeUndefined()
    expect(second.values.q).toBe('after-disposal')
  })

  it('keeps a registration position when its source updates', () => {
    const { build } = setup()
    const a = ref<{ q?: string }>({ q: 'a' })
    const b = ref<{ q?: string }>({ q: 'b' })
    const q = build(() => useQueryStates(schema)
      .use(() => ({ api: {}, defaults: [a] }))
      .use(() => ({ api: {}, defaults: [b] })))

    expect(q.values.q).toBe('b')

    a.value = { q: 'a2' }
    expect(q.values.q).toBe('b')

    b.value = {}
    expect(q.values.q).toBe('a2')
  })

  it('identifies the owning module, installation and registration in a contract error', () => {
    const { build } = setup()
    const named = defineQueryModule({
      states: core => ({
        api: {},
        pipeline: [
          core.pipeline.define('read', values => values, { projection: 'resolved' }),
          core.pipeline.define('read', ({ page: _page, ...rest }) => rest, { projection: 'resolved' }),
        ],
      }),
    })
    const q = build(() => useQueryStates(schema).use(named()))

    expect(() => q.values.page).toThrow(/installation #\d+, registration #\d+/)
  })

  it('keeps independent identities for the same module installed in two bindings', () => {
    const { build } = setup()
    const make = () => build(() => useQueryStates(schema).use(core => ({
      api: {},
      pipeline: [core.pipeline.define('read', ({ page: _page, ...rest }) => rest, { projection: 'resolved' })],
    })))
    const first = make()
    const second = make()
    const message = (binding: typeof first): string => {
      try {
        void binding.values.page
        return ''
      }
      catch (error) {
        return (error as Error).message
      }
    }

    expect(message(first)).toMatch(/installation #1/)
    expect(message(second)).toMatch(/installation #1/)
  })

  it('names the declared module in a contract error and keeps unnamed modules anonymous', () => {
    const { build } = setup()
    const named = build(() => useQueryStates(schema).use(withAttributed()))
    const unnamed = build(() => useQueryStates(schema).use(core => ({
      api: {},
      pipeline: [core.pipeline.define('read', ({ page: _page, ...rest }) => rest, { projection: 'resolved' })],
    })))

    expect(() => named.values.page).toThrow(/pipeline read\/resolved descriptor #1 \(module "test:attributed", installation #1, registration #2\).*\["page"\]/)
    expect(() => unnamed.values.page).toThrow(/installation #1, registration #2/)
    expect(() => unnamed.values.page).not.toThrow(/module "/)
  })

  it('keeps attribution and cleanup local to each binding for the same named module', async () => {
    const first = setup()
    const second = setup()
    const a = first.build(() => useQueryStates(schema).use(withAttributed()))
    const b = second.build(() => useQueryStates(schema).use(withAttributed()))

    expect(() => a.values.page).toThrow(/module "test:attributed", installation #1/)
    expect(() => b.values.page).toThrow(/module "test:attributed", installation #1/)

    first.dispose()
    await flush()

    expect(a.values.page).toBe(1)
    expect(() => b.values.page).toThrow(/module "test:attributed", installation #1/)
  })

  it('releases a module-owned subscription automatically, and an early disposer is idempotent', () => {
    const { build, dispose } = setup()
    const handler = vi.fn()
    const early = vi.fn()
    let stopEarly = (): void => {}
    const q = build(() => useQueryStates(schema).use((core) => {
      core.hooks.on('context:change', handler)
      stopEarly = core.hooks.on('context:change', early)

      return { api: { emit: () => core.hooks.emit('context:change', 'a') } }
    }))

    q.emit()
    stopEarly()
    stopEarly()
    q.emit()

    expect(handler).toHaveBeenCalledTimes(2)
    expect(early).toHaveBeenCalledTimes(1)

    dispose()
    stopEarly()
    q.emit()

    expect(handler).toHaveBeenCalledTimes(2)
    expect(early).toHaveBeenCalledTimes(1)
  })

  it('releases a module installed outside the creation scope with its binding', async () => {
    const { build, dispose } = setup()
    const handler = vi.fn()
    const q = build(() => useQueryStates(schema).use(core => ({
      api: { emit: () => core.hooks.emit('context:change', 'a') },
    })))

    q.use((core) => {
      core.hooks.on('context:change', handler)

      return { api: {} }
    })
    q.emit()
    expect(handler).toHaveBeenCalledTimes(1)

    dispose()
    await flush()
    q.emit()
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('isolates a throwing module subscriber from the others', () => {
    const { build } = setup()
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const after = vi.fn()
    const q = build(() => useQueryStates(schema)
      .use((core) => {
        core.hooks.on('context:change', () => {
          throw new Error('boom')
        })

        return { api: { emit: () => core.hooks.emit('context:change', 'a') } }
      })
      .use((core) => {
        core.hooks.on('context:change', after)

        return { api: {} }
      }))

    expect(() => q.emit()).not.toThrow()
    expect(after).toHaveBeenCalledWith('a')
    expect(consoleError).toHaveBeenCalled()

    consoleError.mockRestore()
  })

  it('releases transaction observers with the module that registered them', () => {
    const { build, run } = setup()
    const started = vi.fn()
    const q = build(() => useQueryStates(schema))

    expect(() => q.use((core) => {
      core.query.transactions.observe({ start: started })

      return { api: { clear: () => {} } }
    })).toThrow(/module key "clear"/)

    q.use((core) => {
      core.query.transactions.observe({ start: started })

      return { api: {} }
    })
    run(() => q.patch({ q: 'a' }))

    expect(started).toHaveBeenCalledTimes(1)
  })

  it('releases subscriptions made after setup, outside the creation scope', async () => {
    const { run, build, dispose } = setup()
    const handler = vi.fn()
    let subscribeLater = (): void => {}
    const q = build(() => useQueryStates(schema).use((core) => {
      subscribeLater = () => {
        core.hooks.on('context:change', handler)
      }

      return { api: { emit: () => core.hooks.emit('context:change', 'a') } }
    }))
    const outside = run(() => useQueryState('q', codecs.string))

    subscribeLater()
    q.emit()
    expect(handler).toHaveBeenCalledTimes(1)

    dispose()
    await flush()
    expect(outside).toBeDefined()
    q.emit()
    expect(handler).toHaveBeenCalledTimes(1)
  })
})
