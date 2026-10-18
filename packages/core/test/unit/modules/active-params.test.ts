import { describe, expect, it } from 'vitest'
import { useQueryState } from '../../../src/core/bindings/use-query-state'
import { useQueryStates } from '../../../src/core/bindings/use-query-states'
import { codecs } from '../../../src/core/codecs/catalog'
import { queryParam } from '../../../src/core/schema/params/query-param'
import { withActiveParams } from '../../../src/modules/active-params'
import { withTestQuery as setup } from '../../helpers/adapter'

describe('withActiveParams grouped', () => {
  it('exposes empty activity when no param is explicitly present', () => {
    const { build } = setup()
    const q = build(() => useQueryStates({
      q: codecs.string,
      page: codecs.integer.withDefault(1),
    }).use(withActiveParams()))

    expect(q.activeKeys.value).toEqual([])
    expect(q.activeCount.value).toBe(0)
    expect(q.hasActive.value).toBe(false)
    expect(q.isActive('q')).toBe(false)
    expect(q.isActive('page')).toBe(false)
  })

  it('does not activate a malformed URL value rejected by its codec', () => {
    const { build } = setup({ page: 'not-an-integer' })
    const q = build(() => useQueryStates({
      page: codecs.integer,
    }).use(withActiveParams()))

    expect(q.activeKeys.value).toEqual([])
    expect(q.isActive('page')).toBe(false)
  })

  it('keeps non-default values in schema order and handles falsy values', () => {
    const { build } = setup({ archived: 'false', enabled: 'false', count: '0', q: 'phone', page: '1' })
    const q = build(() => useQueryStates({
      q: codecs.string,
      page: codecs.integer.withDefault(1),
      count: codecs.integer,
      enabled: codecs.boolean,
      archived: codecs.boolean.withDefault(false),
    }).use(withActiveParams()))

    expect(q.activeKeys.value).toEqual(['q', 'count', 'enabled'])
    expect(q.activeCount.value).toBe(3)
    expect(q.hasActive.value).toBe(true)
    expect(q.isActive('q')).toBe(true)
    expect(q.isActive('page')).toBe(false)
    expect(q.isActive('count')).toBe(true)
    expect(q.isActive('enabled')).toBe(true)
    expect(q.isActive('archived')).toBe(false)
  })

  it('uses the param equality function when comparing with a default', () => {
    const status = queryParam('status', codecs.string)
      .withDefault('ALL')
      .withEquality((a, b) => a.toLowerCase() === b.toLowerCase())
      .keepOnDefault()
    const { build } = setup({ status: 'all' })
    const q = build(() => useQueryStates({ status }).use(withActiveParams()))

    expect(q.activeKeys.value).toEqual([])
    expect(q.isActive('status')).toBe(false)
  })

  it('omits excluded params from every grouped view', () => {
    const { build } = setup({ q: 'phone', category: 'cpu', page: '3' })
    const q = build(() => useQueryStates({
      q: codecs.string,
      category: codecs.string,
      page: codecs.integer.withDefault(1),
    }).use(withActiveParams({ exclude: ['page'] })))

    expect(q.activeKeys.value).toEqual(['q', 'category'])
    expect(q.activeCount.value).toBe(2)
    expect(q.hasActive.value).toBe(true)
    expect(q.isActive('page')).toBe(false)
  })

  it('tracks optimistic writes before the adapter commits them', () => {
    const { build } = setup()
    const q = build(() => useQueryStates({ q: codecs.string }).use(withActiveParams()))

    q.values.q = 'phone'

    expect(q.activeKeys.value).toEqual(['q'])
    expect(q.isActive('q')).toBe(true)

    q.values.q = undefined

    expect(q.activeKeys.value).toEqual([])
    expect(q.isActive('q')).toBe(false)
  })
})

describe('withActiveParams single', () => {
  it('exposes activity for an explicit param without a default', () => {
    const { build } = setup({ status: 'open' })
    const status = build(() => useQueryState('status').use(withActiveParams()))

    expect(status.isActive.value).toBe(true)

    status.clear()

    expect(status.isActive.value).toBe(false)
  })

  it('compares a single explicit value with its resolved default', () => {
    const { build } = setup({ enabled: 'false' })
    const enabled = build(() => useQueryState('enabled', codecs.boolean.withDefault(false)).use(withActiveParams()))

    expect(enabled.isActive.value).toBe(false)

    enabled.value = true

    expect(enabled.isActive.value).toBe(true)
  })
})

describe('withActiveParams projected comparison', () => {
  it('compares the projected explicit value with the projected candidate', () => {
    const { build } = setup({ status: 'ALL' })
    const q = build(() => useQueryStates({ status: codecs.string.withDefault('all') })
      .use((core) => {
        const upper = (values: { readonly status?: string }): { status?: string } => ({
          ...values,
          status: values.status?.toUpperCase(),
        })

        return {
          api: {},
          pipeline: [
            core.pipeline.define('read', upper, { projection: 'explicit' }),
            core.pipeline.define('read', upper, { projection: 'defaults' }),
            core.pipeline.define('read', upper, { projection: 'resolved' }),
          ],
        }
      })
      .use(withActiveParams()))

    expect(q.isActive('status')).toBe(false)
  })

  it('treats an explicit value hidden by a projection as inactive', () => {
    const { build } = setup({ status: 'open' })
    const q = build(() => useQueryStates({ status: codecs.string.withDefault('all') })
      .use(core => ({
        api: {},
        pipeline: [
          core.pipeline.define('read', ({ status: _status, ...rest }) => rest, {
            projection: 'explicit',
            presence: { optional: [['status']] },
          }),
        ],
      }))
      .use(withActiveParams()))

    expect(q.isActive('status')).toBe(false)
  })
})
