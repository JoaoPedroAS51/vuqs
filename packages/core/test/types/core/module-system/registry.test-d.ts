import type { ComputedRef } from 'vue'
import type { QueryStateSchema, QueryStateValueAt, QueryStateWriteValues } from '../../../../src/core/schema/schema'
import { describe, expectTypeOf, it } from 'vitest'
import { computed } from 'vue'
import { useQueryState } from '../../../../src/core/bindings/use-query-state'
import { useQueryStates } from '../../../../src/core/bindings/use-query-states'
import { codecs } from '../../../../src/core/codecs/catalog'
import { defineQueryModule } from '../../../../src/core/module-system/define-query-module'
import { queryParam } from '../../../../src/core/schema/params/query-param'

interface ExplicitValueApi<TValue> {
  explicitValue: ComputedRef<TValue | undefined>
  resetTo: (value: TValue) => void
}

declare module '@vuqs/core' {
  // eslint-disable-next-line unused-imports/no-unused-vars -- TParam must match the base registry signature
  interface QueryModuleRegistry<TSchema extends QueryStateSchema, TParam extends string> {
    'test:explicit-value': {
      state: { api: ExplicitValueApi<QueryStateValueAt<TSchema, 'value'>> }
    }
  }
}

const schema = {
  q: queryParam('q', codecs.string),
  category: queryParam('category', codecs.literal(['cpu', 'gpu'] as const)),
}

describe('registry-based single-state authoring', () => {
  const withExplicitValue = defineQueryModule({
    name: 'test:explicit-value',
    queryState: (core, key) => ({
      explicitValue: computed(() => core.state.explicitValues.value[key]),
      resetTo: value => core.query.transact({
        mode: 'patch',
        values: { [key]: value } as QueryStateWriteValues<typeof core.schema>,
      }),
    }),
  })

  it('resolves the contributed API against the bound param value type', () => {
    const page = useQueryState('page', codecs.integer.withDefault(1)).use(withExplicitValue())

    expectTypeOf(page.value).toEqualTypeOf<number>()
    expectTypeOf(page.explicitValue.value).toEqualTypeOf<number | undefined>()
    expectTypeOf(page.resetTo).parameter(0).toEqualTypeOf<number>()
  })

  it('resolves the value type for the implicit string param', () => {
    const q = useQueryState('q').use(withExplicitValue())

    expectTypeOf(q.explicitValue.value).toEqualTypeOf<string | undefined>()
    expectTypeOf(q.resetTo).parameter(0).toEqualTypeOf<string>()
  })

  it('enforces the value type against the param the single form binds', () => {
    const category = useQueryState('category', codecs.literal(['cpu', 'gpu'] as const)).use(withExplicitValue())

    expectTypeOf(category.explicitValue.value).toEqualTypeOf<'cpu' | 'gpu' | undefined>()
    expectTypeOf(category.resetTo).parameter(0).toEqualTypeOf<'cpu' | 'gpu'>()
  })

  it('rejects the single-only registry module on useQueryStates', () => {
    const grouped = useQueryStates(schema)

    expectTypeOf(grouped.use).toBeFunction()
    expectTypeOf(withExplicitValue()).not.toExtend<Parameters<typeof grouped.use>[0]>()
  })
})
