import type { AnyDefinedQueryParam } from '../../../src/core/schema/params/definition'
import { describe, expect, it } from 'vitest'
import { useQueryStates } from '../../../src/core/bindings/use-query-states'
import { codecs } from '../../../src/core/codecs/catalog'
import { queryParam } from '../../../src/core/schema/params/query-param'
import { withActiveParams } from '../../../src/modules/active-params'
import { withRuntimeDefaults } from '../../../src/modules/runtime-defaults'
import { withTestQuery as setup } from '../../helpers/adapter'

describe('withActiveParams module interactions', () => {
  it('reacts to runtime-default layers registered after activity is composed', () => {
    const { build } = setup({ status: 'open' })
    const q = build(() => useQueryStates({
      status: codecs.string.withDefault('all'),
    })
      .use(withActiveParams())
      .use(withRuntimeDefaults()))

    expect(q.activeKeys.value).toEqual(['status'])

    q.setDefaults({ status: 'open' })
    expect(q.activeKeys.value).toEqual([])

    q.setDefaults({ status: 'closed' })
    expect(q.activeKeys.value).toEqual(['status'])
  })
})

describe('withActiveParams composed activity', () => {
  const orders = [
    ['activity before runtime defaults', false],
    ['runtime defaults before activity', true],
  ] as const

  const record = () => queryParam.object('record', {
    a: queryParam('a', codecs.integer.withDefault(0)),
    b: queryParam('b', codecs.integer.withDefault(100)),
  })

  function mount(initial: Parameters<typeof setup>[0], param: AnyDefinedQueryParam, runtimeFirst: boolean) {
    return setup(initial).build(() => {
      const query = useQueryStates({ record: param })

      return runtimeFirst
        ? query.use(withRuntimeDefaults()).use(withActiveParams())
        : query.use(withActiveParams()).use(withRuntimeDefaults())
    })
  }

  it.each(orders)('treats defaults without an explicit value as inactive (%s)', (_label, runtimeFirst) => {
    const q = mount({}, record(), runtimeFirst)

    expect(q.values.record).toEqual({ a: 0, b: 100 })
    expect(q.isActive('record')).toBe(false)
  })

  it.each(orders)('keeps a partial explicit value active even when it resolves to the default (%s)', (_label, runtimeFirst) => {
    const q = mount({ record: { b: '100' } }, record(), runtimeFirst)

    expect(q.values.record).toEqual({ a: 0, b: 100 })
    expect(q.isActive('record')).toBe(true)
  })

  it.each(orders)('treats a complete explicit default as inactive and a changed one as active (%s)', (_label, runtimeFirst) => {
    const equal = mount({ record: { a: '0', b: '100' } }, record(), runtimeFirst)
    const changed = mount({ record: { a: '0', b: '10' } }, record(), runtimeFirst)

    expect(equal.isActive('record')).toBe(false)
    expect(changed.isActive('record')).toBe(true)
  })

  it.each(orders)('treats a complete explicit default of a gated object as inactive while it stays resolved (%s)', (_label, runtimeFirst) => {
    const q = mount({ record: { a: '0', b: '100' } }, record().withDefaultsWhenPresent(), runtimeFirst)

    expect(q.isActive('record')).toBe(false)
    expect(q.values.record).toEqual({ a: 0, b: 100 })
  })

  it.each(orders)('does not make a kept default active (%s)', (_label, runtimeFirst) => {
    const q = mount({ record: { a: '0', b: '100' } }, record().keepOnDefault(), runtimeFirst)

    expect(q.isActive('record')).toBe(false)
  })

  it.each(orders)('compares against the composed runtime candidate (%s)', (_label, runtimeFirst) => {
    const q = mount({ record: { a: '5', b: '100' } }, record(), runtimeFirst)

    expect(q.isActive('record')).toBe(true)

    q.setDefaults({ record: { a: 5 } })
    expect(q.isActive('record')).toBe(false)
  })

  it('uses an equality that accepts partial explicit values without filling them', () => {
    const lenient = record().withEquality((x, y) => (x.b ?? 100) === (y.b ?? 100))
    const q = mount({ record: { b: '100' } }, lenient, false)

    expect(q.isActive('record')).toBe(false)
  })
})
