import type { QueryCore } from '../../../../src/core/module-system/query-core'
import type { Enforce } from '../../../../src/core/runtime/pipeline/contract'
import type { QueryStateSchema } from '../../../../src/core/schema/schema'
import { describe, expectTypeOf, it } from 'vitest'
import { toRefs } from 'vue'
import { toQueryRef } from '../../../../src/core/bindings/to-query-ref'
import { toQueryRefs } from '../../../../src/core/bindings/to-query-refs'
import { useQueryState } from '../../../../src/core/bindings/use-query-state'
import { useQueryStates } from '../../../../src/core/bindings/use-query-states'
import { codecs } from '../../../../src/core/codecs/catalog'
import { defineQueryModule } from '../../../../src/core/module-system/define-query-module'
import { queryParam } from '../../../../src/core/schema/params/query-param'
import { defineQuerySchema } from '../../../../src/core/schema/schema'

const schema = {
  q: queryParam('q', codecs.string),
  category: queryParam('category', codecs.literal(['cpu', 'gpu'] as const)),
}

describe('single-state module composition', () => {
  const dualMode = defineQueryModule({
    states: () => ({ api: { grouped: true as const } }),
    state: (_core, key) => ({ api: { single: true as const, key } }),
  })

  const functionOnly = <TSchema extends QueryStateSchema>(_core: QueryCore<TSchema>): { api: { grouped: true } } => ({ api: { grouped: true } })

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
      states: () => ({ api: { grouped: true } }),
      state: (_core: QueryCore<typeof schema>, key: keyof typeof schema & string) => ({ api: { key } }),
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
      state: (_core, key) => ({ api: { single: true, key } }),
    })

    const q = useQueryState('q').use(singleOnly())

    expectTypeOf(q.single).toEqualTypeOf<boolean>()
    expectTypeOf(q.key).toEqualTypeOf<string>()
    const grouped = useQueryStates(schema)

    expectTypeOf(grouped.use).toBeFunction()
    expectTypeOf(singleOnly()).not.toExtend<Parameters<typeof grouped.use>[0]>()
  })
})

declare const requiredMaybeEmpty: readonly [['n']] | readonly []
declare const requiredEither: readonly [['n'], ['n']] | readonly [['n']]
declare const enforce: Enforce

describe('captured read facets', () => {
  const effectSchema = {
    n: queryParam('n', codecs.integer),
    m: queryParam('m', codecs.integer.withDefault(1)),
  }

  // F can omit n, C conditionally fills it without declaring a guarantee, G guarantees it.
  const withF = defineQueryModule({
    states: core => ({
      api: {},
      pipeline: [core.pipeline.define('read', values => ({ ...values, n: undefined }), {
        projection: 'resolved',
        presence: { optional: [['n']] },
      })],
    }),
  })
  const withC = defineQueryModule({
    states: core => ({
      api: {},
      pipeline: [core.pipeline.define('read', values => values, { projection: 'resolved' })],
    }),
  })
  const withG = defineQueryModule({
    states: core => ({
      api: {},
      pipeline: [core.pipeline.define('read', values => ({ ...values, n: values.n ?? 0 }), {
        projection: 'resolved',
        presence: { required: [['n']] },
      })],
    }),
  })

  it('reads the base contract directly without modules', () => {
    const query = useQueryStates(effectSchema)

    expectTypeOf(query.values.n).toEqualTypeOf<number | undefined>()
    expectTypeOf(query.values.m).toEqualTypeOf<number>()
  })

  it('follows the effective order for every F, C and G arrangement', () => {
    const fcg = useQueryStates(effectSchema).use(withF()).use(withC()).use(withG())
    const fgc = useQueryStates(effectSchema).use(withF()).use(withG()).use(withC())
    const cfg = useQueryStates(effectSchema).use(withC()).use(withF()).use(withG())
    const cgf = useQueryStates(effectSchema).use(withC()).use(withG()).use(withF())
    const gfc = useQueryStates(effectSchema).use(withG()).use(withF()).use(withC())
    const gcf = useQueryStates(effectSchema).use(withG()).use(withC()).use(withF())

    expectTypeOf(fcg.values.n).toEqualTypeOf<number>()
    expectTypeOf(fgc.values.n).toEqualTypeOf<number>()
    expectTypeOf(cfg.values.n).toEqualTypeOf<number>()
    expectTypeOf(cgf.values.n).toEqualTypeOf<number | undefined>()
    expectTypeOf(gfc.values.n).toEqualTypeOf<number | undefined>()
    expectTypeOf(gcf.values.n).toEqualTypeOf<number | undefined>()
  })

  it('leaves params the effects do not name unchanged', () => {
    const query = useQueryStates(effectSchema).use(withF()).use(withC())

    expectTypeOf(query.values.m).toEqualTypeOf<number>()
    expectTypeOf(query.values.n).toEqualTypeOf<number | undefined>()
  })

  it('retains the module APIs next to the reconstructed read', () => {
    const withApi = defineQueryModule({
      states: () => ({ api: { tag: 'x' as const } }),
    })
    const query = useQueryStates(effectSchema).use(withG()).use(withApi()).use(withF())

    expectTypeOf(query.tag).toEqualTypeOf<'x'>()
    expectTypeOf(query.values.n).toEqualTypeOf<number | undefined>()
    expectTypeOf(query.patch).toBeFunction()
  })

  it('applies the same effects to refs and lenses derived from the capture', () => {
    const query = useQueryStates(effectSchema).use(withG())
    const { n, m } = toQueryRefs(query)

    expectTypeOf(n.value).toEqualTypeOf<number>()
    expectTypeOf(m.value).toEqualTypeOf<number>()
    expectTypeOf(toQueryRef(query).value).toEqualTypeOf<{ n?: number, m?: number }>()
  })

  it('keeps the explicit write domain independent of read effects', () => {
    const query = useQueryStates(effectSchema).use(withG())

    query.patch({ n: undefined, m: 2 })
    query.replace({ m: 3 })
    // @ts-expect-error the write domain stays the explicit param type
    query.patch({ n: 'text' })
  })

  it('types the single-param read through the same effects', () => {
    const withValueG = defineQueryModule({
      state: core => ({
        api: {},
        pipeline: [core.pipeline.define('read', values => ({ ...values, value: values.value ?? 0 }), {
          projection: 'resolved',
          presence: { required: [['value']] },
        })],
      }),
    })
    const bare = useQueryState('n', codecs.integer)
    const guaranteed = useQueryState('n', codecs.integer).use(withValueG())

    expectTypeOf(bare.value).toEqualTypeOf<number | undefined>()
    expectTypeOf(guaranteed.value).toEqualTypeOf<number>()
  })

  it('lets enforce override installation order', () => {
    const postF = defineQueryModule({
      states: core => ({
        api: {},
        pipeline: [core.pipeline.define('read', values => ({ ...values, n: undefined }), {
          projection: 'resolved',
          presence: { optional: [['n']] },
          enforce: 'post',
        })],
      }),
    })
    const postG = defineQueryModule({
      states: core => ({
        api: {},
        pipeline: [core.pipeline.define('read', values => ({ ...values, n: values.n ?? 0 }), {
          projection: 'resolved',
          presence: { required: [['n']] },
          enforce: 'post',
        })],
      }),
    })
    const omittingLast = useQueryStates(effectSchema).use(postF()).use(withG())
    const guaranteeingLast = useQueryStates(effectSchema).use(postG()).use(withF())

    expectTypeOf(omittingLast.values.n).toEqualTypeOf<number | undefined>()
    expectTypeOf(guaranteeingLast.values.n).toEqualTypeOf<number>()
  })

  it('retains possible absence from a module returning a descriptor array', () => {
    const query = useQueryStates(effectSchema).use((core) => {
      const omit = core.pipeline.define('read', values => ({ ...values, m: undefined }), {
        projection: 'resolved',
        presence: { optional: [['m']] },
      })
      const pipeline = [omit]

      return { api: { tag: 'filtered' as const }, pipeline }
    })

    expectTypeOf(query.values.m).toEqualTypeOf<number | undefined>()
    expectTypeOf(query.tag).toEqualTypeOf<'filtered'>()
    expectTypeOf(query.values.n).toEqualTypeOf<number | undefined>()
  })

  it('captures an inline descriptor with an unknown band', () => {
    const query = useQueryStates(effectSchema).use(core => ({
      api: {},
      pipeline: [core.pipeline.define('read', values => ({ ...values, m: undefined }), {
        projection: 'resolved',
        enforce,
        presence: { optional: [['m']] },
      })],
    }))

    expectTypeOf(query.values.m).toEqualTypeOf<number | undefined>()
    expectTypeOf(query.values.m).not.toBeAny()
  })

  it('recovers a grouped guarantee after a stored module with uncertain descriptors', () => {
    const withOmission = defineQueryModule({
      states: (core) => {
        const descriptor = core.pipeline.define('read', values => ({ ...values, m: undefined }), {
          projection: 'resolved',
          enforce,
          presence: { optional: [['m']] },
        })
        const pipeline = [descriptor]

        return { api: { tag: 'filtered' as const }, pipeline }
      },
    })
    const stored = withOmission()
    const omitted = useQueryStates(effectSchema).use(stored)
    const recovered = omitted.use(core => ({
      api: {},
      pipeline: [core.pipeline.define('read', values => ({ ...values, m: values.m ?? 0 }), {
        projection: 'resolved',
        enforce: 'post',
        presence: { required: [['m']] },
      })],
    }))

    expectTypeOf(omitted.values.m).toEqualTypeOf<number | undefined>()
    expectTypeOf(recovered.values.m).toEqualTypeOf<number>()
    expectTypeOf(recovered.tag).toEqualTypeOf<'filtered'>()
    expectTypeOf(recovered.values.n).toEqualTypeOf<number | undefined>()
    expectTypeOf(recovered.patch).toBeCallableWith({ m: undefined })
  })

  it('preserves nested and atomic contracts through a grouped descriptor array', () => {
    const nestedSchema = {
      record: queryParam.object({ a: codecs.integer.withDefault(1), b: codecs.string.withDefault('b') }),
      payload: codecs.json<{ items: number[] }>(),
    }
    const query = useQueryStates(nestedSchema).use((core) => {
      const descriptor = core.pipeline.define('read', values => values, {
        projection: 'resolved',
        presence: { optional: [['record', 'a']] },
      })
      const pipeline = [descriptor]

      return { api: {}, pipeline }
    })

    expectTypeOf(query.values.record.a).toEqualTypeOf<number | undefined>()
    expectTypeOf(query.values.record.b).toEqualTypeOf<string>()
    expectTypeOf(query.values.payload).toEqualTypeOf<{ items: number[] } | undefined>()
  })

  it('captures and restores single-param presence through stored modules with descriptor arrays', () => {
    const withOmission = defineQueryModule({
      state: (core) => {
        const descriptor = core.pipeline.define('read', () => ({}), {
          projection: 'resolved',
          enforce,
          presence: { optional: [['value']] },
        })
        const pipeline = [descriptor]

        return { api: { tag: 'filtered' as const }, pipeline }
      },
    })
    const withGuarantee = defineQueryModule({
      state: core => ({
        api: {},
        pipeline: [core.pipeline.define('read', values => ({ ...values, value: values.value ?? 0 }), {
          projection: 'resolved',
          enforce: 'post',
          presence: { required: [['value']] },
        })],
      }),
    })
    const stored = withOmission()
    const omitted = useQueryState('n', codecs.integer.withDefault(1)).use(stored)
    const recovered = omitted.use(withGuarantee())

    expectTypeOf(omitted.value).toEqualTypeOf<number | undefined>()
    expectTypeOf(omitted.tag).toEqualTypeOf<'filtered'>()
    expectTypeOf(recovered.value).toEqualTypeOf<number>()
    expectTypeOf(recovered.tag).toEqualTypeOf<'filtered'>()
    expectTypeOf(recovered.set).toBeCallableWith(2)
  })

  it('guarantees only what every conditional alternative requires', () => {
    const withMaybeG = defineQueryModule({
      states: core => ({
        api: {},
        pipeline: [core.pipeline.define('read', values => ({ ...values, n: values.n ?? 0 }), {
          projection: 'resolved',
          presence: { required: requiredMaybeEmpty },
        })],
      }),
    })
    const withEitherG = defineQueryModule({
      states: core => ({
        api: {},
        pipeline: [core.pipeline.define('read', values => ({ ...values, n: values.n ?? 0 }), {
          projection: 'resolved',
          presence: { required: requiredEither },
        })],
      }),
    })
    const maybe = useQueryStates(effectSchema).use(withMaybeG())
    const common = useQueryStates(effectSchema).use(withEitherG())

    expectTypeOf(maybe.values.n).toEqualTypeOf<number | undefined>()
    expectTypeOf(common.values.n).toEqualTypeOf<number>()
  })

  it('ignores effects of the explicit and defaults projections and of writes', () => {
    const withOtherStages = defineQueryModule({
      states: core => ({
        api: {},
        pipeline: [
          core.pipeline.define('read', values => ({ ...values, n: values.n ?? 0 }), { projection: 'explicit', presence: { required: [['n']] } }),
          core.pipeline.define('read', values => ({ ...values, n: values.n ?? 0 }), { projection: 'defaults', presence: { required: [['n']] } }),
          core.pipeline.define('write', values => ({ ...values, n: values.n ?? 0 }), { presence: { required: [['n']] } }),
        ],
      }),
    })
    const query = useQueryStates(effectSchema).use(withOtherStages())

    expectTypeOf(query.values.n).toEqualTypeOf<number | undefined>()
  })

  it('does not retype an earlier alias of the mutable composable', () => {
    const base = useQueryStates(effectSchema)
    const captured = base.use(withG())

    expectTypeOf(base.values.n).toEqualTypeOf<number | undefined>()
    expectTypeOf(captured.values.n).toEqualTypeOf<number>()
  })

  it('keeps Vue conversion to the projected read type', () => {
    const query = useQueryStates(effectSchema).use(withG())
    const refs = toRefs(query.values)

    expectTypeOf(refs.n.value).toEqualTypeOf<number>()
    expectTypeOf(refs.m.value).toEqualTypeOf<number>()
  })

  it('captures the effects of a module whose core parameter is annotated', () => {
    const annotatedSchema = defineQuerySchema(effectSchema)
    const withAnnotatedG = defineQueryModule({
      states: (core: QueryCore<typeof annotatedSchema>) => ({
        api: {},
        pipeline: [core.pipeline.define('read', values => ({ ...values, n: values.n ?? 0 }), {
          projection: 'resolved',
          presence: { required: [['n']] },
        })],
      }),
    })
    const query = useQueryStates(annotatedSchema).use(withAnnotatedG())

    expectTypeOf(query.values.n).toEqualTypeOf<number>()
  })
})
