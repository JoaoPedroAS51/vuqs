import type { Ref } from 'vue'
import type { ThrottledQueue } from '../../../../src/core/runtime/navigation-queue'
import type { Overlay } from '../../../../src/core/runtime/overlay'
import { describe, expectTypeOf, it } from 'vitest'

describe('navigation queue types', () => {
  it('exposes the overlay through a read-only type', () => {
    expectTypeOf<ThrottledQueue['overlay']>().toEqualTypeOf<Readonly<Ref<Readonly<Overlay>>>>()
    expectTypeOf<ThrottledQueue['overlay']['value']>().toEqualTypeOf<Readonly<Overlay>>()
  })
})
