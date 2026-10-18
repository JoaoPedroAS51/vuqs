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

async function runAuthorLifecycle() {
  const { addDebugReporter, codecs, createDebugLogger, defineQueryModule, useQueryAdapter, useQueryStates } = await import('@vuqs/core')
  const { withVuqsTestingAdapter } = await import('@vuqs/core/adapters/testing')
  const { createApp, effectScope, onScopeDispose, ref } = await import('vue')

  const scope = effectScope()
  const app = createApp({})

  try {
    app.use(withVuqsTestingAdapter({ searchParams: { q: 'x' }, hasMemory: false }))
    assert.ok(app.runWithContext(useQueryAdapter))

    const schema = { q: codecs.string }
    const handler = []
    const started = []
    const hidden = []
    const used = []
    const source = ref({ q: 'from-source' })
    let teardown = 0

    const withAuthor = defineQueryModule({
      name: 'consumer:author',
      states: (core) => {
        core.hooks.on('context:change', context => handler.push(context))
        core.query.transactions.observe({ start: request => started.push(request.mode) })
        onScopeDispose(() => {
          teardown += 1
        })
        core.pipeline.define('read', (values) => {
          hidden.push(values)
          return values
        }, { projection: 'resolved' })

        return {
          api: {
            emit: () => core.hooks.emit('context:change', 'a'),
            log: () => createDebugLogger('consumer', { target: core.debug }).debug('written'),
          },
          defaults: [source],
          pipeline: [
            core.pipeline.define('read', (values) => {
              used.push(values)
              return { ...values, q: `${values.q}!` }
            }, { projection: 'resolved' }),
          ],
        }
      },
    })

    const query = scope.run(() => app.runWithContext(() => useQueryStates(schema).use(withAuthor())))
    assert.ok(query)

    // Only the returned declarations install, and the pipeline runs.
    assert.equal(query.values.q, 'x!')
    assert.ok(used.length > 0)
    assert.equal(hidden.length, 0)

    // An explicit value still wins while the returned source updates.
    source.value = { q: 'updated' }
    assert.equal(query.values.q, 'x!')

    // The module owns its subscriptions.
    query.emit()
    assert.deepEqual(handler, ['a'])

    // Transaction observers belong to the module too.
    query.patch({ q: 'y' })
    assert.deepEqual(started, ['patch'])

    // A colliding module fails whole and leaves the earlier module intact.
    assert.throws(
      () => query.use(() => ({ api: { emit: () => {} }, defaults: [{ q: 'never' }] })),
      /module key "emit" is already provided/,
    )
    assert.equal(query.values.q, 'y!')

    // An invalid declaration is rejected before anything is published.
    assert.throws(
      () => query.use(() => ({ api: {}, pipeline: [{ stage: 'read' }] })),
      /invalid pipeline registration/,
    )

    // A module used after creation, outside the creation scope, is still owned by the binding.
    scope.run(() => {})
    query.use(core => ({ api: { late: () => core.hooks.on('context:change', context => handler.push(`late:${context}`)) } })).late()
    query.emit()
    assert.deepEqual(handler, ['a', 'a', 'late:a'])

    // A targeted logger carries the binding and runtime attribution of the module's writes.
    const logged = []
    const stopLogs = addDebugReporter(event => logged.push(event))
    query.log()
    query.patch({ q: 'logged' })
    stopLogs()
    const logEvent = logged.find(event => event.code === 'module:log')
    const setEvent = logged.find(event => event.code === 'binding:set')
    assert.ok(logEvent?.context?.bindingId)
    assert.equal(logEvent.context.bindingId, setEvent?.context?.bindingId)
    assert.equal(logEvent.context.runtimeId, setEvent?.context?.runtimeId)

    // Stopping the scope releases subscriptions made at setup and later.
    scope.stop()
    query.emit()
    query.patch({ q: 'z' })
    assert.equal(teardown, 1)
    assert.deepEqual(handler, ['a', 'a', 'late:a'])
    assert.deepEqual(started, ['patch', 'patch'])
  }
  finally {
    scope.stop()
  }
}

async function runAuthorDefaults() {
  const { codecs, defineQueryModule, useQueryAdapter, useQueryState, useQueryStates } = await import('@vuqs/core')
  const { withVuqsTestingAdapter } = await import('@vuqs/core/adapters/testing')
  const { withRuntimeDefaults } = await import('@vuqs/core/modules')
  const { createApp, effectScope, ref } = await import('vue')

  const scope = effectScope()
  const app = createApp({})

  try {
    app.use(withVuqsTestingAdapter({ searchParams: {}, hasMemory: false }))
    assert.ok(app.runWithContext(useQueryAdapter))

    const later = ref({})
    const withLater = defineQueryModule({
      states: () => ({ api: {}, defaults: [later] }),
      state: () => ({ api: {}, defaults: [ref({})] }),
    })
    const grouped = scope.run(() => app.runWithContext(() => useQueryStates({ q: codecs.string }).use(withRuntimeDefaults()).use(withLater())))
    assert.ok(grouped)

    // A later source outranks the runtime defaults, which keep their slot after a clear.
    grouped.setDefaults({ q: 'runtime' })
    assert.equal(grouped.values.q, 'runtime')
    later.value = { q: 'later' }
    assert.equal(grouped.values.q, 'later')
    later.value = {}
    grouped.clearDefaults()
    grouped.setDefaults({ q: 'again' })
    assert.equal(grouped.values.q, 'again')
    later.value = { q: 'later' }
    assert.equal(grouped.values.q, 'later')

    // The same contract holds on the single-param facade.
    const single = scope.run(() => app.runWithContext(() => useQueryState('s').use(withRuntimeDefaults())))
    single.setDefault('single')
    assert.equal(single.value, 'single')
    single.clearDefault()
    assert.equal(single.value, undefined)
  }
  finally {
    scope.stop()
  }
}

async function runAuthorWrites() {
  const { codecs, defineQueryModule, useQueryAdapter, useQueryStates } = await import('@vuqs/core')
  const { withVuqsTestingAdapter } = await import('@vuqs/core/adapters/testing')
  const { createApp, effectScope } = await import('vue')

  const scope = effectScope()
  const app = createApp({})

  try {
    app.use(withVuqsTestingAdapter({ searchParams: {}, hasMemory: true }))
    const adapter = app.runWithContext(useQueryAdapter)
    assert.ok(adapter)

    const calls = []
    const withWrite = defineQueryModule({
      states: core => ({
        api: {},
        pipeline: [
          core.pipeline.define('write', (values) => {
            calls.push({ ...values })
            return { ...values, sort: 'added' }
          }),
        ],
      }),
    })
    const query = scope.run(() => app.runWithContext(() => useQueryStates({ q: codecs.string, sort: codecs.string }).use(withWrite())))
    assert.ok(query)

    // One write-pipeline invocation sees the complete request, and a param it adds joins the transaction.
    query.patch({ q: 'a' })
    assert.deepEqual(calls, [{ q: 'a' }])
    await new Promise(resolve => setTimeout(resolve, 0))
    assert.deepEqual(adapter.query.value, { q: 'a', sort: 'added' })

    // Every bound writer applies the same policy.
    query.values.q = 'b'
    assert.equal(calls.length, 2)
    query.replace({ q: 'c', sort: 'd' })
    assert.equal(calls.length, 3)
    assert.deepEqual(calls[2], { q: 'c', sort: 'd' })
  }
  finally {
    scope.stop()
  }
}

async function runOmission() {
  const { codecs, queryParam, useQueryAdapter, useQueryStates } = await import('@vuqs/core')
  const { withVuqsTestingAdapter } = await import('@vuqs/core/adapters/testing')
  const { createApp, effectScope } = await import('vue')

  const scope = effectScope()
  const app = createApp({})

  try {
    app.use(withVuqsTestingAdapter({ searchParams: {}, hasMemory: true }))
    const adapter = app.runWithContext(useQueryAdapter)
    assert.ok(adapter)

    const gated = queryParam.object('g', { n: queryParam('n', codecs.integer.withDefault(1)) }).withDefaultsWhenPresent()
    const query = scope.run(() => app.runWithContext(() => useQueryStates({ page: queryParam('page', codecs.integer.withDefault(1)), g: gated })))
    assert.ok(query)
    const settle = () => new Promise(resolve => setTimeout(resolve, 0))

    // A default-equal value that changes no read is omitted.
    query.patch({ page: 1 })
    await settle()
    assert.deepEqual(adapter.query.value, {})

    // A default-equal value that holds an object's presence is kept.
    query.patch({ g: { n: 1 } })
    await settle()
    assert.deepEqual(adapter.query.value, { g: { n: '1' } })
    assert.deepEqual({ ...query.values.g }, { n: 1 })
  }
  finally {
    scope.stop()
  }
}

async function runAuthorPublication() {
  const { codecs, defineQueryModule, useQueryAdapter, useQueryState, useQueryStates } = await import('@vuqs/core')
  const { withVuqsTestingAdapter } = await import('@vuqs/core/adapters/testing')
  const { createApp, effectScope, watch } = await import('vue')

  const app = createApp({})
  app.use(withVuqsTestingAdapter({ searchParams: {}, hasMemory: true }))
  assert.ok(app.runWithContext(useQueryAdapter))

  const observers = []
  const observe = (read) => {
    const scope = effectScope(true)
    const seen = []
    scope.run(() => watch(read, value => seen.push(value), { flush: 'sync' }))
    observers.push(scope)
    return seen
  }

  try {
    for (const facade of [
      { key: 'q', create: () => useQueryStates({ q: codecs.string }), read: query => query.values.q },
      { key: 'value', create: () => useQueryState('q', codecs.string), read: query => query.value },
    ]) {
      const scope = effectScope()
      const query = scope.run(() => app.runWithContext(facade.create))
      assert.ok(query)

      const setup = core => ({
        api: { tag: 1 },
        defaults: [{ [facade.key]: 'a' }],
        pipeline: [
          core.pipeline.define('read', values => ({ ...values, [facade.key]: `${values[facade.key]}!` }), { projection: 'resolved' }),
          core.pipeline.define('read', values => ({ ...values, [facade.key]: `${values[facade.key]}?` }), { projection: 'resolved' }),
        ],
      })
      const seen = observe(() => `${facade.read(query)}|${'tag' in query}`)

      // The first publication carries every contribution and the API.
      query.use(defineQueryModule({ states: setup, state: setup })())
      assert.deepEqual(seen, ['a!?|true'])

      // A failing API leaves nothing of the attempted installation behind.
      const failing = core => ({
        api: { ok: 1, get boom() { throw new Error('getter failed') } },
        defaults: [{ [facade.key]: 'never' }],
        pipeline: [core.pipeline.define('read', values => ({ ...values, [facade.key]: 'never' }), { projection: 'resolved' })],
      })
      assert.throws(() => query.use(defineQueryModule({ states: failing, state: failing })()), /getter failed/)
      assert.equal(seen.length, 1)
      assert.equal('ok' in query, false)

      // Disposal removes the complete installation at once.
      scope.stop()
      assert.deepEqual(seen.slice(1), ['undefined|true'])
    }
  }
  finally {
    for (const scope of observers) {
      scope.stop()
    }
  }
}

run()
  .then(runAuthorLifecycle)
  .then(runAuthorPublication)
  .then(runAuthorDefaults)
  .then(runAuthorWrites)
  .then(runOmission)
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
