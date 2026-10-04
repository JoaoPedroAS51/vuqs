import type { ShallowRef } from 'vue'
import type { TestingAdapter } from '../../../src/adapters/testing'
import type { ParsedQuery } from '../../../src/index'
import { describe, expectTypeOf, it } from 'vitest'

describe('testing adapter query', () => {
  it('exposes a shallow query ref', () => {
    expectTypeOf<TestingAdapter['query']>().toEqualTypeOf<ShallowRef<ParsedQuery>>()
  })
})
