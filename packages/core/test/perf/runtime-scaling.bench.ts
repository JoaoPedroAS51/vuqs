import { afterAll, describe, it } from 'vitest'
import { effectScope, nextTick, watchEffect } from 'vue'
import { createTestingAdapter } from '../../src/adapters/testing'
import { codecs } from '../../src/core/codecs/catalog'
import { createQueryStateEngine } from '../../src/core/runtime/engine'
import { ThrottledQueue } from '../../src/core/runtime/navigation-queue'
import { queryParam } from '../../src/core/schema/params/query-param'
import { defineQuerySchema } from '../../src/core/schema/schema'
import { createPipelineFixture, installContributions } from '../helpers/pipeline'

function externalFixture(bindings: number) {
  const adapter = createTestingAdapter({ hasMemory: true })
  const scope = effectScope()
  let revision = 0

  scope.run(() => {
    for (let index = 0; index < bindings; index++) {
      const key = `k${index}`
      const engine = createQueryStateEngine({
        id: String(index),
        schema: { [key]: queryParam(key, codecs.string) },
        adapter,
      })
      // Model bindings consumed by component render effects.
      watchEffect(() => void engine.state.values.value)
    }
  })

  return {
    async changeOnePath() {
      adapter.query.value = { k0: String(revision++) }
      await nextTick()
    },
    stop: () => scope.stop(),
  }
}

const ten = externalFixture(10)
const hundred = externalFixture(100)
const fiveHundred = externalFixture(500)

function burstFixture(paths: number) {
  const adapter = createTestingAdapter({ hasMemory: true })
  const queue = new ThrottledQueue(adapter)
  let revision = 0

  return async () => {
    for (let index = 0; index < paths; index++) {
      queue.push({ [`p${index}`]: `${revision}` }, {}, 0)
    }
    revision++
    await Promise.resolve()
  }
}

const burstTen = burstFixture(10)
const burstHundred = burstFixture(100)
const burstFiveHundred = burstFixture(500)

afterAll(() => {
  ten.stop()
  hundred.stop()
  fiveHundred.stop()
})

describe('adapter-scoped query fan-out', () => {
  it('10 consumed bindings, one changed path', async ({ bench }) => {
    await bench('10 consumed bindings, one changed path', () => ten.changeOnePath()).run()
  })
  it('100 consumed bindings, one changed path', async ({ bench }) => {
    await bench('100 consumed bindings, one changed path', () => hundred.changeOnePath()).run()
  })
  it('500 consumed bindings, one changed path', async ({ bench }) => {
    await bench('500 consumed bindings, one changed path', () => fiveHundred.changeOnePath()).run()
  })
})

describe('canonical overlay write bursts', () => {
  it('10 distinct path writes in one batch', async ({ bench }) => {
    await bench('10 distinct path writes in one batch', burstTen).run()
  })
  it('100 distinct path writes in one batch', async ({ bench }) => {
    await bench('100 distinct path writes in one batch', burstHundred).run()
  })
  it('500 distinct path writes in one batch', async ({ bench }) => {
    await bench('500 distinct path writes in one batch', burstFiveHundred).run()
  })
})

const pipelineSchema = defineQuerySchema({
  value: codecs.integer.withDefault(1),
  text: codecs.string,
  record: queryParam.object('record', {
    a: queryParam('a', codecs.integer.withDefault(0)),
    b: queryParam('b', codecs.integer),
  }),
})

function pipelineFixture(registrations: number) {
  const { pipeline, installations } = createPipelineFixture(pipelineSchema)
  const context = { stage: 'read' as const, projection: 'resolved' as const, schema: pipelineSchema, query: {} }

  for (let index = 0; index < registrations; index++) {
    if (index % 2 === 0) {
      installContributions({ installations }, {
        pipeline: [pipeline.define('read', values => ({ ...values, text: String(index) }), {
          projection: 'resolved',
          presence: { optional: [['record', 'b']] },
        })],
      })
    }
    else {
      installContributions({ installations }, {
        pipeline: [pipeline.define('read', values => ({ ...values, value: values.value ?? 1, text: String(index) }), {
          projection: 'resolved',
          presence: { required: [['value']] },
        })],
      })
    }
  }

  return () => pipeline.run('read', { value: 1, record: { a: 0, b: 2 } }, context)
}

const noDescriptors = pipelineFixture(0)
const fiveDescriptors = pipelineFixture(5)
const twentyDescriptors = pipelineFixture(20)
const fiftyDescriptors = pipelineFixture(50)

describe('read pipeline evaluation', () => {
  it('no registrations', async ({ bench }) => {
    await bench('no registrations', noDescriptors).run()
  })
  it('5 descriptors', async ({ bench }) => {
    await bench('5 descriptors', fiveDescriptors).run()
  })
  it('20 descriptors', async ({ bench }) => {
    await bench('20 descriptors', twentyDescriptors).run()
  })
  it('50 descriptors', async ({ bench }) => {
    await bench('50 descriptors', fiftyDescriptors).run()
  })
})
