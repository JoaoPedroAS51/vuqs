import { describe, expect, it } from 'vitest'
import { toRefs } from 'vue'
import { toQueryRefs } from '../../../src/core/bindings/to-query-refs'
import { useQueryStates } from '../../../src/core/bindings/use-query-states'
import { codecs } from '../../../src/core/codecs/catalog'
import { queryParam } from '../../../src/core/schema/params/query-param'
import { withRuntimeDefaults } from '../../../src/modules/runtime-defaults'
import { withTestQuery as setup } from '../../helpers/adapter'

const flush = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0))

const schema = {
  q: queryParam('q', codecs.string),
  page: queryParam('page', codecs.integer.withDefault(1)),
}

describe('read-only per-field refs via Vue toRefs', () => {
  it('reads each field and tracks updates without a writer', async () => {
    const { build } = setup({ q: 'sale' })
    const q = build(() => useQueryStates(schema).use(withRuntimeDefaults()))
    const qRef = toRefs(q.selected).q!

    expect(qRef.value).toBe('sale')
    expect('set' in qRef).toBe(false)
    expect('clear' in qRef).toBe(false)

    q.values.q = 'phone'
    await flush()
    expect(qRef.value).toBe('phone')
  })
})

describe('toQueryRefs coherence with withRuntimeDefaults', () => {
  it('clears against the effective default when writing through a ref', async () => {
    const { build } = setup()
    const q = build(() => useQueryStates(schema).use(withRuntimeDefaults()))
    q.setDefaults({ page: 5 })

    const { page } = toQueryRefs(q)

    page.value = 1 // codec default, not the effective default (5)
    await flush()
    expect(q.selected).toEqual({ page: 1 })

    page.value = 5 // the effective default
    await flush()
    expect(q.selected).toEqual({})
    expect(q.values).toEqual({ page: 5 })
  })
})
