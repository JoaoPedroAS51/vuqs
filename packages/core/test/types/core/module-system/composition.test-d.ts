import type { QueryCore } from '../../../../src/core/module-system/query-core'
import type { QueryStateSchema } from '../../../../src/core/schema/schema'
import { describe, expectTypeOf, it } from 'vitest'
import { useQueryState } from '../../../../src/core/bindings/use-query-state'
import { useQueryStates } from '../../../../src/core/bindings/use-query-states'
import { codecs } from '../../../../src/core/codecs/catalog'
import { defineQueryModule } from '../../../../src/core/module-system/define-query-module'
import { queryParam } from '../../../../src/core/schema/params/query-param'

const schema = {
  q: queryParam('q', codecs.string),
  category: queryParam('category', codecs.literal(['cpu', 'gpu'] as const)),
}

describe('single-state module composition', () => {
  const dualMode = defineQueryModule({
    queryStates: () => ({ grouped: true as const }),
    queryState: (_core, key) => ({ single: true as const, key }),
  })

  const functionOnly = <TSchema extends QueryStateSchema>(_core: QueryCore<TSchema>): { grouped: true } => ({ grouped: true })

  it('accumulates single module API on useQueryState', () => {
    const q = useQueryState('q').use(dualMode())

    expectTypeOf(q.value).toEqualTypeOf<string | undefined>()
    expectTypeOf(q.single).toEqualTypeOf<true>()
    expectTypeOf(q.key).toEqualTypeOf<string>()
    expectTypeOf(q).not.toHaveProperty('grouped')
  })

  it('rejects grouped-only modules on useQueryState', () => {
    const q = useQueryState('q')

    expectTypeOf(q.use).toBeFunction()
    expectTypeOf(functionOnly).not.toExtend<Parameters<typeof q.use>[0]>()
  })

  it('rejects queryState projections bound to the grouped schema', () => {
    const boundToGroupedSchema = {
      queryStates: () => ({ grouped: true }),
      queryState: (_core: QueryCore<typeof schema>, key: keyof typeof schema & string) => ({ key }),
    }

    expectTypeOf(boundToGroupedSchema).not.toExtend<Parameters<typeof defineQueryModule>[0]>()
  })

  it('uses the grouped projection on useQueryStates', () => {
    const q = useQueryStates(schema).use(dualMode())

    expectTypeOf(q.grouped).toEqualTypeOf<true>()
    expectTypeOf(q).not.toHaveProperty('single')
  })

  it('keeps function-only modules valid for useQueryStates', () => {
    const q = useQueryStates(schema).use(functionOnly)

    expectTypeOf(q.grouped).toEqualTypeOf<true>()
  })

  it('supports single-only modules and rejects them on useQueryStates', () => {
    const singleOnly = defineQueryModule({
      queryState: (_core, key) => ({ single: true, key }),
    })

    const q = useQueryState('q').use(singleOnly())

    expectTypeOf(q.single).toEqualTypeOf<boolean>()
    expectTypeOf(q.key).toEqualTypeOf<string>()
    const grouped = useQueryStates(schema)

    expectTypeOf(grouped.use).toBeFunction()
    expectTypeOf(singleOnly()).not.toExtend<Parameters<typeof grouped.use>[0]>()
  })
})
