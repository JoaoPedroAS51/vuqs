import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { useQueryState } from '../../../../../src/core/bindings/use-query-state'
import { useQueryStates } from '../../../../../src/core/bindings/use-query-states'
import { codecs } from '../../../../../src/core/codecs/catalog'
import { defineQueryModule } from '../../../../../src/core/module-system/define-query-module'
import { queryParam } from '../../../../../src/core/schema/params/query-param'
import { withTestQuery as setup } from '../../../../helpers/adapter'

const schema = {
  q: queryParam('q', codecs.string),
  page: queryParam('page', codecs.integer.withDefault(1)),
}

describe('use() collision guard', () => {
  it('throws when two modules contribute the same key', () => {
    const { build } = setup()

    expect(() =>
      build(() =>
        useQueryStates(schema)
          .use(() => ({ api: { shared: 1 } }))
          .use(() => ({ api: { shared: 2 } })),
      ),
    ).toThrow(/module key "shared" is already provided/)
  })

  it('throws when a module overwrites a built-in key', () => {
    const { build } = setup()

    expect(() =>
      build(() => useQueryStates(schema).use(() => ({ api: { clear: () => {} } }))),
    ).toThrow(/module key "clear" is already provided/)
  })

  it('guards single-state module API collisions', () => {
    const { run } = setup()
    const module = defineQueryModule({
      states: () => ({ api: {} }),
      state: () => ({ api: { set: () => {} } }),
    })
    const q = run(() => useQueryState('q', codecs.string))

    expect(() => q.use(module())).toThrow(/module key "set" is already provided/)
  })
})

describe('module results', () => {
  it('throws when a module returns no API object', () => {
    const { build } = setup()
    const module = defineQueryModule({
      states: () => undefined as never,
    })

    expect(() => build(() => useQueryStates(schema).use(module() as never))).toThrow('[vuqs] module did not return an API object')
  })

  it('installs only the descriptors a module returns', () => {
    const { build } = setup({ q: 'x' })
    const hidden = vi.fn((values: object) => values)
    const used = vi.fn((values: object) => values)
    const q = build(() => useQueryStates(schema).use((core) => {
      core.pipeline.define('read', hidden, { projection: 'resolved' })

      return { api: {}, pipeline: [core.pipeline.define('read', used, { projection: 'resolved' })] }
    }))

    void q.values.q

    expect(used).toHaveBeenCalled()
    expect(hidden).not.toHaveBeenCalled()
  })

  it('installs a returned default source once and keeps updating that same contribution', () => {
    const { build } = setup()
    const q = build(() => useQueryStates(schema).use((core) => {
      const source = ref<{ q?: string }>({})

      return {
        api: { fill: (value: string) => { source.value = { q: value } }, candidates: core.defaults.candidates },
        defaults: [source],
      }
    }))

    expect(q.candidates.value.q).toBeUndefined()

    q.fill('loaded')

    expect(q.candidates.value.q).toBe('loaded')

    q.fill('reloaded')

    expect(q.candidates.value.q).toBe('reloaded')
    expect(q.values.q).toBe('reloaded')
  })
})

describe('module core view', () => {
  it('exposes descriptor creation without generic pipeline execution or installation', () => {
    const { build } = setup()
    let pipeline: object | undefined

    build(() => useQueryStates(schema).use((core) => {
      pipeline = core.pipeline

      return { api: {} }
    }))

    expect(Object.keys(pipeline!)).toEqual(['define'])
  })
})

describe('module declaration validation', () => {
  it('rejects a null default source before anything is published', () => {
    const { build } = setup()

    expect(() => build(() => useQueryStates(schema).use(() => ({ api: {}, defaults: [null as never] })))).toThrow(/invalid default source/)
  })

  it('rejects an invalid descriptor before publishing any of the module', () => {
    const { build } = setup()

    expect(() => build(() => useQueryStates(schema).use(core => ({
      api: {},
      defaults: [{ q: 'never' }],
      pipeline: [
        core.pipeline.define('read', values => values, { projection: 'resolved' }),
        { stage: 'read' } as never,
      ],
    })))).toThrow(/invalid pipeline registration/)
  })

  it('rejects a presence path outside the schema at installation', () => {
    const { build } = setup()

    expect(() => build(() => useQueryStates(schema).use(core => ({
      api: {},
      pipeline: [
        core.pipeline.define('read', values => values, { projection: 'resolved', presence: { optional: [['unknown'] as never] } }),
      ],
    })))).toThrow(/presence path/)
  })
})
