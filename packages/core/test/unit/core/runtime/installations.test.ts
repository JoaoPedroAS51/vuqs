import { describe, expect, it } from 'vitest'
import { watch } from 'vue'
import { createInstallationRegistry } from '../../../../src/core/runtime/installations'

const installation = (id: number) => ({ id, defaults: [], pipeline: [] })

describe('createInstallationRegistry', () => {
  it('activates installations in publication order, each in one assignment', () => {
    const registry = createInstallationRegistry()
    const seen: number[][] = []
    const stop = watch(registry.snapshot, value => seen.push(value.map(entry => entry.id)), { flush: 'sync' })

    registry.publish(installation(1))
    registry.publish(installation(2))
    stop()

    expect(seen).toEqual([[1], [1, 2]])
  })

  it('removes an installation by identity and keeps the others', () => {
    const registry = createInstallationRegistry()
    registry.publish(installation(1))
    registry.publish(installation(2))
    registry.publish(installation(3))

    registry.remove(2)

    expect(registry.snapshot.value.map(entry => entry.id)).toEqual([1, 3])
  })

  it('assigns nothing when the identity is not active', () => {
    const registry = createInstallationRegistry()
    registry.publish(installation(1))
    const before = registry.snapshot.value
    let assignments = 0
    const stop = watch(registry.snapshot, () => assignments++, { flush: 'sync' })

    registry.remove(9)
    registry.remove(1)
    registry.remove(1)
    stop()

    expect(registry.snapshot.value).not.toBe(before)
    expect(registry.snapshot.value).toEqual([])
    expect(assignments).toBe(1)
  })

  it('never mutates a snapshot it handed out', () => {
    const registry = createInstallationRegistry()
    registry.publish(installation(1))
    const published = registry.snapshot.value

    registry.publish(installation(2))
    registry.remove(1)

    expect(published.map(entry => entry.id)).toEqual([1])
  })
})
