import { describe, expectTypeOf, it } from 'vitest'
import { useQueryState } from '../../../src/core/bindings/use-query-state'
import { codecs } from '../../../src/core/codecs/catalog'
import { queryParam } from '../../../src/core/schema/params/query-param'
import { withRuntimeDefaults } from '../../../src/modules/runtime-defaults'

describe('withRuntimeDefaults inference', () => {
  it('adds single runtime-default APIs to useQueryState', () => {
    const q = useQueryState('q').use(withRuntimeDefaults())

    expectTypeOf(q.value).toEqualTypeOf<string | undefined>()
    expectTypeOf(q.selectedValue.value).toEqualTypeOf<string | undefined>()
    expectTypeOf(q.defaultValue.value).toEqualTypeOf<string | undefined>()
    expectTypeOf(q.setDefault).parameter(0).toEqualTypeOf<string>()
    expectTypeOf(q.clearDefault).toBeFunction()
    expectTypeOf(q).not.toHaveProperty('setDefaults')
  })

  it('types single runtime defaults for defaulted and composite params', () => {
    const page = useQueryState('page', codecs.integer.withDefault(1)).use(withRuntimeDefaults())

    expectTypeOf(page.value).toEqualTypeOf<number>()
    expectTypeOf(page.defaultValue.value).toEqualTypeOf<number | undefined>()
    expectTypeOf(page.setDefault).parameter(0).toEqualTypeOf<number>()

    const rangeParam = queryParam.object({
      from: queryParam('from', codecs.string),
      to: queryParam('to', codecs.string),
    }).transform({
      read(value): { from: string, to: string } | undefined {
        return value.from && value.to ? { from: value.from, to: value.to } : undefined
      },
      write: value => value,
    })
    const range = useQueryState(rangeParam).use(withRuntimeDefaults())

    expectTypeOf(range.value).toEqualTypeOf<{ from: string, to: string } | undefined>()
    expectTypeOf(range.selectedValue.value).toEqualTypeOf<{ from: string, to: string } | undefined>()
    expectTypeOf(range.setDefault).parameter(0).toEqualTypeOf<{ from: string, to: string }>()
  })
})
