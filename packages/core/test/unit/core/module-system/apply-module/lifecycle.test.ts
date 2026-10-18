import type { EffectScope } from 'vue'
import type { QueryCore } from '../../../../../src/core/module-system/query-core'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { effectScope, getCurrentScope, onScopeDispose, ref, watch } from 'vue'
import { useQueryState } from '../../../../../src/core/bindings/use-query-state'
import { useQueryStates } from '../../../../../src/core/bindings/use-query-states'
import { codecs } from '../../../../../src/core/codecs/catalog'
import { applyQueryStatesModule } from '../../../../../src/core/module-system/apply-module'
import { defineQueryModule } from '../../../../../src/core/module-system/define-query-module'
import { queryParam } from '../../../../../src/core/schema/params/query-param'
import { withTestQuery as setup } from '../../../../helpers/adapter'

interface Facade {
  name: 'grouped' | 'single'
  /** The key a module addresses in its maps. */
  key: string
  create: (build: <T>(create: () => T) => T) => any
  read: (query: any) => unknown
}

const schema = {
  q: queryParam('q', codecs.string),
  page: queryParam('page', codecs.integer.withDefault(1)),
}

const facades: Facade[] = [
  { name: 'grouped', key: 'q', create: build => build(() => useQueryStates(schema)), read: query => query.values.q },
  { name: 'single', key: 'value', create: build => build(() => useQueryState('q', codecs.string)), read: query => query.value },
]

describe('installation guards', () => {
  it('refuses to install on a disposed binding', () => {
    const { build, dispose } = setup()
    const query = build(() => useQueryStates(schema))

    dispose()

    expect(() => query.use(() => ({ api: {} }))).toThrow(/disposed binding/)
  })

  it('releases the installation when its API cannot be attached', () => {
    const remove = vi.fn()
    const host = {
      createCore: () => ({}) as never,
      pipeline: { validate: () => {} },
      publish: vi.fn(),
      remove,
      scope: undefined,
      nextId: () => 1,
    }

    expect(() => applyQueryStatesModule(Object.freeze({}), host, () => ({ api: { tag: 1 } }))).toThrow(TypeError)

    expect(host.publish).not.toHaveBeenCalled()
    expect(remove).toHaveBeenCalledExactlyOnceWith(1)
  })

  it('keeps an installation whose notification failed after publication', () => {
    const remove = vi.fn()
    const host = {
      createCore: () => ({}) as never,
      pipeline: { validate: () => {} },
      publish: () => {
        throw new Error('observer failed')
      },
      remove,
      scope: undefined,
      nextId: (() => {
        let id = 0

        return () => ++id
      })(),
    }
    const target: Record<string, unknown> = {}
    let owned: EffectScope | undefined

    expect(() => applyQueryStatesModule(target, host, () => {
      owned = getCurrentScope()

      return { api: { tag: 1 } }
    })).toThrow('observer failed')

    // Published state is not rolled back; the armed cleanup still removes it with its scope.
    expect(target.tag).toBe(1)
    expect(remove).not.toHaveBeenCalled()
    owned?.stop()
    expect(remove).toHaveBeenCalledExactlyOnceWith(1)
  })
})

describe('installation failure', () => {
  it('leaves earlier modules and their resources intact', () => {
    const { build } = setup({ q: 'x' })
    const keep = vi.fn((values: object) => values)
    const q = build(() => {
      const query = useQueryStates(schema).use(core => ({
        api: { first: true },
        pipeline: [core.pipeline.define('read', keep, { projection: 'resolved' })],
      }))

      expect(() => query.use(() => ({ api: { first: false } }))).toThrow(/module key "first"/)

      return query
    })

    void q.values.q

    expect(keep).toHaveBeenCalled()
  })

  it('removes the sources, subscriptions and registrations of a module that fails to install', () => {
    const { build } = setup()
    const handler = vi.fn()
    const retained = vi.fn()
    const callback = vi.fn((values: object) => values)
    let teardown = 0

    const q = build(() => {
      const query = useQueryStates(schema).use((core) => {
        core.hooks.on('context:change', retained)

        return { api: { emit: () => core.hooks.emit('context:change', 'after-failure') } }
      })

      expect(() => query.use((core) => {
        core.hooks.on('context:change', handler)
        onScopeDispose(() => {
          teardown += 1
        })

        return {
          api: { clear: () => {} },
          defaults: [{ q: 'never' }],
          pipeline: [core.pipeline.define('read', callback, { projection: 'resolved' })],
        }
      })).toThrow(/module key "clear"/)

      return query
    })
    void q.values.q
    q.emit()

    expect(retained).toHaveBeenCalledExactlyOnceWith('after-failure')
    expect(teardown).toBe(1)
    expect(callback).not.toHaveBeenCalled()
    expect(handler).not.toHaveBeenCalled()
    expect(q.values.q).toBeUndefined()
  })

  it('does not show synchronous observers a module that fails to install', () => {
    const { build } = setup()
    const seen: unknown[] = []
    const q = build(() => {
      const query = useQueryStates(schema)
      watch(() => query.values.q, value => seen.push(value), { flush: 'sync' })

      expect(() => query.use(core => ({
        api: { clear: () => {} },
        defaults: [{ q: 'never' }],
        pipeline: [core.pipeline.define('read', values => ({ ...values, q: 'never' }), { projection: 'resolved' })],
      }))).toThrow(/module key "clear"/)

      return query
    })

    expect(seen).toEqual([])
    expect(q.values.q).toBeUndefined()
  })

  it('rolls back single-state module side effects when composition fails', () => {
    const { run } = setup()
    let disposed = 0
    const module = defineQueryModule({
      states: () => ({ api: {} }),
      state: () => {
        onScopeDispose(() => {
          disposed += 1
        })

        return { api: { set: () => {} } }
      },
    })
    const q = run(() => useQueryState('q', codecs.string))

    expect(() => q.use(module())).toThrow(/module key "set" is already provided/)
    expect(disposed).toBe(1)
  })
})

describe('installation publication', () => {
  it('lets an API read observe the installed source and pipeline', () => {
    const { build } = setup()
    const q = build(() => useQueryStates(schema).use((core) => {
      const source = ref({ q: 'from-source' })

      return {
        api: { lazy: () => core.state.values.value.q },
        defaults: [source],
        pipeline: [
          core.pipeline.define('read', values => ({ ...values, q: `${values.q}!` }), { projection: 'resolved' }),
        ],
      }
    }))

    expect(q.lazy()).toBe('from-source!')
  })

  it('shows synchronous observers a module only once all its contributions are installed', () => {
    const { build } = setup()
    const seen: unknown[] = []

    build(() => {
      const query = useQueryStates(schema)
      watch(() => query.values.q, value => seen.push(value), { flush: 'sync' })

      return query.use(core => ({
        api: {},
        defaults: [{ q: 'a' }],
        pipeline: [core.pipeline.define('read', values => ({ ...values, q: `${values.q}!` }), { projection: 'resolved' })],
      }))
    })

    expect(seen).toEqual(['a!'])
  })
})

describe.each(facades)('complete installation lifecycle ($name)', (facade) => {
  it('shows an external synchronous observer the complete contribution set and the API', () => {
    const { build } = setup()
    const query = facade.create(build)
    const probe = observe(() => `${String(facade.read(query))}|${'tag' in query}`)

    query.use(contributions(facade)())

    expect(probe.seen).toEqual(['a!?|true'])
  })

  it('removes every contribution together on disposal', () => {
    const { build, dispose } = setup()
    const query = facade.create(build)
    query.use(contributions(facade)())
    const probe = observe(() => String(facade.read(query)))

    dispose()

    expect(probe.seen).toEqual(['undefined'])
  })

  it('leaves no contribution, API addition or subscription when API preparation throws', () => {
    const { build } = setup()
    const handler = vi.fn()
    const teardown = vi.fn()
    const keep = defineQueryModule({
      states: core => ({ api: { emit: () => core.hooks.emit('context:change', 'x') }, defaults: [{ q: 'kept' }] }),
      state: core => ({ api: { emit: () => core.hooks.emit('context:change', 'x') }, defaults: [{ value: 'kept' }] }),
    })
    const query = facade.create(build)
    query.use(keep())
    const probe = observe(() => String(facade.read(query)))
    const failing = (core: QueryCore<any>) => {
      core.hooks.on('context:change', handler)
      onScopeDispose(teardown)

      return {
        api: {
          ok: 1,
          get boom(): number {
            throw new Error('getter failed')
          },
        },
        defaults: [{ [facade.key]: 'never' }],
        pipeline: [core.pipeline.define('read', (values: any) => ({ ...values, [facade.key]: 'never' }), { projection: 'resolved' })],
      }
    }

    expect(() => query.use(defineQueryModule({ states: failing, state: failing })())).toThrow('getter failed')

    expect(probe.seen).toEqual([])
    expect(facade.read(query)).toBe('kept')
    expect('ok' in query).toBe(false)
    expect(teardown).toHaveBeenCalledOnce()
    query.emit()
    expect(handler).not.toHaveBeenCalled()
  })

  it('removes the installation before author cleanup changes a source it returned', () => {
    const shared = ref<Record<string, string>>({ [facade.key]: 'shared' })
    const first = setup()
    const second = setup()
    const owner = defineQueryModule({
      states: () => ({ api: {}, defaults: [shared] }),
      state: () => ({ api: {}, defaults: [shared] }),
    })
    const cleaning = defineQueryModule({
      states: () => {
        onScopeDispose(() => {
          shared.value = { [facade.key]: 'cleanup' }
        })

        return { api: {}, defaults: [shared] }
      },
      state: () => {
        onScopeDispose(() => {
          shared.value = { [facade.key]: 'cleanup' }
        })

        return { api: {}, defaults: [shared] }
      },
    })
    const a = facade.create(first.build)
    const b = facade.create(second.build)
    a.use(cleaning())
    b.use(owner())
    const seenA = observe(() => String(facade.read(a)))
    const seenB = observe(() => String(facade.read(b)))

    first.dispose()

    expect(seenA.seen).toEqual(['undefined'])
    expect(seenB.seen).toEqual(['cleanup'])
  })

  it('cannot reactivate an installation whose scope is stopped during its publication', () => {
    const { build } = setup()
    const teardown = vi.fn()
    let owned: EffectScope | undefined
    const query = facade.create(build)
    observe(() => String(facade.read(query)), (value) => {
      if (value === 'a!?') {
        owned?.stop()
      }
    })
    const module = contributions(facade, {
      onSetup: () => {
        owned = getCurrentScope()
      },
      teardown,
    })

    expect(() => query.use(module())).not.toThrow()

    expect(facade.read(query)).toBeUndefined()
    expect(teardown).toHaveBeenCalledOnce()
    owned?.stop()
    expect(teardown).toHaveBeenCalledOnce()
  })

  it('publishes nothing of a module disposed while its setup runs', () => {
    const { build } = setup()
    const query = facade.create(build)
    const module = contributions(facade, {
      onSetup: () => {
        getCurrentScope()?.stop()
      },
    })

    expect(() => query.use(module())).not.toThrow()

    expect('tag' in query).toBe(false)
    expect(facade.read(query)).toBeUndefined()
  })

  it('keeps both complete installations when an observer installs another module while reacting', () => {
    const { build } = setup()
    const query = facade.create(build)
    const second = defineQueryModule({
      states: () => ({ api: { second: true }, defaults: [{ [facade.key]: 'second' }] }),
      state: () => ({ api: { second: true }, defaults: [{ [facade.key]: 'second' }] }),
    })
    let installed = false
    observe(() => String(facade.read(query)), (value) => {
      if (value === 'a!?' && !installed) {
        installed = true
        query.use(second())
      }
    })

    query.use(contributions(facade)())

    expect(facade.read(query)).toBe('second!?')
    expect('second' in query).toBe(true)
  })

  it('does not keep a subscription made through a disposed module-owned core', () => {
    const { build, dispose } = setup()
    const handler = vi.fn()
    const query = facade.create(build)
    const module = defineQueryModule({
      states: core => ({ api: { late: () => core.hooks.on('context:change', handler), emit: () => core.hooks.emit('context:change', 'x') } }),
      state: core => ({ api: { late: () => core.hooks.on('context:change', handler), emit: () => core.hooks.emit('context:change', 'x') } }),
    })
    query.use(module())

    dispose()
    dispose()
    const stop = query.late()
    stop()
    query.emit()

    expect(handler).not.toHaveBeenCalled()
  })
})

// The observer lives in a detached scope, so disposing the binding does not stop it.
function observe<T>(read: () => T, onChange?: (value: T) => void): { seen: T[], stop: () => void } {
  const scope = effectScope(true)
  const seen: T[] = []

  scope.run(() => watch(read, (value) => {
    seen.push(value)
    onChange?.(value)
  }, { flush: 'sync' }))
  onTestFinished(() => scope.stop())

  return { seen, stop: () => scope.stop() }
}

// A module addressing `key`: it contributes a default, two read descriptors and the API `tag`.
function contributions(facade: Facade, hooks: { onSetup?: (core: QueryCore<any>) => void, teardown?: () => void } = {}) {
  const key = facade.key
  const setupModule = (core: QueryCore<any>) => {
    hooks.onSetup?.(core)
    if (hooks.teardown) {
      onScopeDispose(hooks.teardown)
    }

    return {
      api: { tag: 1 },
      defaults: [{ [key]: 'a' }],
      pipeline: [
        core.pipeline.define('read', (values: any) => ({ ...values, [key]: `${values[key]}!` }), { projection: 'resolved' }),
        core.pipeline.define('read', (values: any) => ({ ...values, [key]: `${values[key]}?` }), { projection: 'resolved' }),
      ],
    }
  }

  return defineQueryModule({ states: setupModule, state: setupModule })
}
