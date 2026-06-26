import { describe, expect, it } from 'vitest'
import { computed } from 'vue'
import { createQueryPipeline } from '../../src/core/pipeline'
import { omitBy, pickBy } from '../../src/shared'

describe('createQueryPipeline', () => {
  it('returns the value unchanged when a stage has no taps', () => {
    const pipeline = createQueryPipeline()

    expect(pipeline.run('read', { a: 1, b: 2 })).toEqual({ a: 1, b: 2 })
  })

  it('composes taps within a stage in registration order', () => {
    const pipeline = createQueryPipeline()

    pipeline.tap('read', values => ({ ...values, a: (values.a as number) + 1 }))
    pipeline.tap('read', values => ({ ...values, a: (values.a as number) * 2 }))

    expect(pipeline.run('read', { a: 1 })).toEqual({ a: 4 }) // (1 + 1) * 2
  })

  it('orders taps by enforce: pre, default, then post', () => {
    const pipeline = createQueryPipeline()
    const order: string[] = []

    const record = (label: string) => (values: Record<string, unknown>) => {
      order.push(label)
      return values
    }

    pipeline.tap('write', record('default'))
    pipeline.tap('write', record('post'), { enforce: 'post' })
    pipeline.tap('write', record('pre'), { enforce: 'pre' })

    pipeline.run('write', {})

    expect(order).toEqual(['pre', 'default', 'post'])
  })

  it('keeps registration order within an enforce band', () => {
    const pipeline = createQueryPipeline()
    const order: string[] = []
    const record = (label: string) => (values: Record<string, unknown>) => {
      order.push(label)
      return values
    }

    pipeline.tap('read', record('d1'))
    pipeline.tap('read', record('post1'), { enforce: 'post' })
    pipeline.tap('read', record('d2'))
    pipeline.tap('read', record('pre1'), { enforce: 'pre' })

    pipeline.run('read', {})

    expect(order).toEqual(['pre1', 'd1', 'd2', 'post1'])
  })

  it('re-runs a computed read when a tap is added (pull-based reactivity)', () => {
    const pipeline = createQueryPipeline()
    const result = computed(() => pipeline.run('read', { secret: 1, a: 2 }))

    expect(result.value).toEqual({ secret: 1, a: 2 })

    pipeline.tap('read', pickBy(key => key !== 'secret'))

    expect(result.value).toEqual({ a: 2 })
  })

  it('taps several stages in one call and unregisters from all of them', () => {
    const pipeline = createQueryPipeline()
    const untap = pipeline.tap(['read', 'write'], pickBy(key => key !== 'secret'))

    expect(pipeline.run('read', { a: 1, secret: 2 })).toEqual({ a: 1 })
    expect(pipeline.run('write', { a: 1, secret: 2 })).toEqual({ a: 1 })

    untap()

    expect(pipeline.run('read', { a: 1, secret: 2 })).toEqual({ a: 1, secret: 2 })
    expect(pipeline.run('write', { a: 1, secret: 2 })).toEqual({ a: 1, secret: 2 })
  })
})

describe('pickBy / omitBy', () => {
  it('pickBy keeps the matching keys', () => {
    expect(pickBy(key => key.startsWith('a'))({ a1: 1, a2: 2, b: 3 })).toEqual({ a1: 1, a2: 2 })
  })

  it('omitBy drops the matching keys', () => {
    expect(omitBy(key => key.startsWith('a'))({ a1: 1, a2: 2, b: 3 })).toEqual({ b: 3 })
  })

  it('compose order-independently (set intersection)', () => {
    const pipeline = createQueryPipeline()
    pipeline.tap('read', pickBy(key => key !== 'a'))
    pipeline.tap('read', pickBy(key => key !== 'b'))

    expect(pipeline.run('read', { a: 1, b: 2, c: 3 })).toEqual({ c: 3 })
  })
})
