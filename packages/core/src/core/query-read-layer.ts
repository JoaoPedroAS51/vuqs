import type { MaybeRefOrGetter } from 'vue'
import type { QueryAdapter } from './adapter'
import type { Overlay } from './queues/throttle'

/** Retains completed writes in a read layer above the adapter's query. @internal */
export interface QueryReadLayer {
  readonly values: MaybeRefOrGetter<Readonly<Overlay>>
  apply: (deltas: Overlay) => void
  reset: () => void
}

const layers = new WeakMap<QueryAdapter, QueryReadLayer>()

/** Registers a read layer for one adapter identity before its runtime is created. @internal */
export function registerQueryReadLayer(adapter: QueryAdapter, layer: QueryReadLayer): void {
  layers.set(adapter, layer)
}

/** Reads the layer registered for one adapter identity. @internal */
export function getQueryReadLayer(adapter: QueryAdapter): QueryReadLayer | undefined {
  return layers.get(adapter)
}
