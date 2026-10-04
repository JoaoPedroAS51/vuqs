import type { DefinedQueryModule } from '../../../../src/core/module-system/contract'
import { describe, expect, it } from 'vitest'
import { onScopeDispose } from 'vue'
import { useQueryState } from '../../../../src/core/bindings/use-query-state'
import { useQueryStates } from '../../../../src/core/bindings/use-query-states'
import { codecs } from '../../../../src/core/codecs/catalog'
import { defineQueryModule } from '../../../../src/core/module-system/define-query-module'
import { queryParam } from '../../../../src/core/schema/params/query-param'
import { withTestQuery as setup } from '../../../helpers/adapter'

describe('use() collision guard', () => {
  const schema = { q: queryParam('q', codecs.string) }

  it('throws when two modules contribute the same key', () => {
    const { build } = setup()

    expect(() =>
      build(() =>
        useQueryStates(schema)
          .use(() => ({ shared: 1 }))
          .use(() => ({ shared: 2 })),
      ),
    ).toThrow(/module key "shared" is already provided/)
  })

  it('throws when a module overwrites a built-in key', () => {
    const { build } = setup()

    expect(() =>
      build(() => useQueryStates(schema).use(() => ({ clear: () => {} }))),
    ).toThrow(/module key "clear" is already provided/)
  })
})

describe('useQueryState', () => {
  it('guards single-state module API collisions', () => {
    const { run } = setup()
    const module = defineQueryModule({
      queryStates: () => ({}),
      queryState: () => ({ set: () => {} }),
    })
    const q = run(() => useQueryState('q', codecs.string))

    expect(() => q.use(module())).toThrow(/module key "set" is already provided/)
  })

  it('rolls back single-state module side effects when composition fails', () => {
    const { run } = setup()
    let disposed = 0
    const module = defineQueryModule({
      queryStates: () => ({}),
      queryState: () => {
        onScopeDispose(() => {
          disposed += 1
        })

        return { set: () => {} }
      },
    })
    const q = run(() => useQueryState('q', codecs.string))

    expect(() => q.use(module())).toThrow(/module key "set" is already provided/)
    expect(disposed).toBe(1)
  })

  it('throws when a grouped-only module is forced onto useQueryState', () => {
    const { run } = setup()
    const groupedOnly = (() => ({})) as unknown as DefinedQueryModule<any, object, object>
    const q = run(() => useQueryState('q', codecs.string))

    expect(() => q.use(groupedOnly)).toThrow(/does not support useQueryState/)
  })
})

describe('defineQueryModule targeted call form', () => {
  it('throws when a module returns no API object', () => {
    const { build } = setup()
    const module = defineQueryModule({
      queryStates: () => undefined as unknown as object,
    })

    expect(() =>
      build(() => useQueryStates({ q: queryParam('q', codecs.string) }).use(module())),
    ).toThrow('[vuqs] module did not return an API object')
  })
})
