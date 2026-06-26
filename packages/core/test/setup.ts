import { beforeEach } from 'vitest'
import { resetQueues } from '../src/core/queues/throttle'

// The optimistic overlay is a module-level singleton, so reset it before each
// test to keep one test's pending writes from leaking into the next.
beforeEach(() => {
  resetQueues()
})
