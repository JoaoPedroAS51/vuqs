import assert from 'node:assert/strict'
import process from 'node:process'

process.env.NODE_ENV = 'production'

async function run() {
  const { addDebugReporter, useQueryAdapter, useQueryState } = await import('@vuqs/core')
  const { withVuqsTestingAdapter } = await import('@vuqs/core/adapters/testing')
  const { withRuntimeDefaults } = await import('@vuqs/core/modules')
  const { createApp, effectScope } = await import('vue')

  const events = []
  const updates = []
  const stopReporter = addDebugReporter(event => events.push(event))
  const scope = effectScope()
  const app = createApp({})

  try {
    app.use(withVuqsTestingAdapter({
      searchParams: { q: 'initial' },
      hasMemory: false,
      onUrlUpdate: update => updates.push(update),
    }))

    const adapter = app.runWithContext(useQueryAdapter)
    assert.ok(adapter)
    const query = scope.run(() => app.runWithContext(() => useQueryState('q').use(withRuntimeDefaults())))
    assert.ok(query)
    assert.equal(query.value, 'initial')

    query.setDefault('fallback')
    assert.equal(query.defaultValue.value, 'fallback')
    query.set('next')
    await new Promise(resolve => setTimeout(resolve, 0))

    assert.equal(query.value, 'next')
    assert.deepEqual(adapter.query.value, { q: 'initial' })
    assert.equal(updates.length, 1)
    assert.deepEqual(updates[0].query, { q: 'next' })

    const write = events.find(event => event.code === 'binding:set')
    const defaults = events.find(event => event.code === 'rd:set')
    assert.ok(write?.context?.bindingId)
    assert.ok(write.context.runtimeId)
    assert.equal(defaults?.context?.bindingId, write.context.bindingId)
    assert.equal(defaults?.context?.runtimeId, write.context.runtimeId)
    assert.ok(events.some(event => event.code === 'gtq:settle'))

    adapter.resetQueue()
    assert.equal(query.value, 'initial')
    scope.stop()
    assert.ok(events.some(event => event.code === 'binding:disposed'))
    assert.ok(events.some(event => event.code === 'rd:register' && event.data.state === 'disposed'))
  }
  finally {
    scope.stop()
    stopReporter()
  }
}

run().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
