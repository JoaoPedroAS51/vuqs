import { describe, expect, it } from 'vitest'
import { useQueryStates } from '../../../src/core/bindings/use-query-states'
import { codecs } from '../../../src/core/codecs/catalog'
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
