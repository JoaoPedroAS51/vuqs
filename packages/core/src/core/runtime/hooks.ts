import type { DebugChannelHandle } from '../diagnostics/bus'
import { emitDebug, isDebugArmed } from '../diagnostics/bus'

/**
 * The notification event map, augmented by modules.
 *
 * @example
 * ```ts
 * declare module '@vuqs/core' {
 *   interface QueryHooks {
 *     'context:change': (context: string) => void
 *   }
 * }
 * ```
 */
export interface QueryHooks {}

type HookHandler = (...args: never[]) => void

type HookArgs<Event extends keyof QueryHooks> = QueryHooks[Event] extends (...args: infer Args) => unknown
  ? Args
  : never

/**
 * The notification bus modules share through {@link QueryCore} to coordinate
 * without referencing each other.
 */
export interface QueryHookBus {
  /**
   * Subscribes `handler` to `event` and returns a function that unsubscribes it.
   * Pair the returned function with `onScopeDispose` so the subscription is
   * cleaned up with its effect scope.
   */
  on: <Event extends keyof QueryHooks>(event: Event, handler: QueryHooks[Event]) => () => void
  /** Synchronously invokes every handler subscribed to `event`. */
  emit: <Event extends keyof QueryHooks>(event: Event, ...args: HookArgs<Event>) => void
}

/**
 * Creates a {@link QueryHookBus}. One bus is created per `useQueryStates` call
 * and shared with its modules.
 *
 * @internal
 */
export function createQueryHooks(channel: DebugChannelHandle): QueryHookBus {
  const registry = new Map<keyof QueryHooks, Set<HookHandler>>()

  function on<Event extends keyof QueryHooks>(event: Event, handler: QueryHooks[Event]): () => void {
    let handlers = registry.get(event)

    if (!handlers) {
      handlers = new Set()
      registry.set(event, handlers)
    }

    handlers.add(handler as HookHandler)
    emitDebug(channel, 'hooks:subscribe', { event: String(event) })

    return () => {
      registry.get(event)?.delete(handler as HookHandler)
    }
  }

  function emit<Event extends keyof QueryHooks>(event: Event, ...args: HookArgs<Event>): void {
    if (isDebugArmed(channel)) {
      emitDebug(channel, 'hooks:emit', { event: String(event), args: [...args] })
    }
    const handlers = registry.get(event)

    if (!handlers) {
      return
    }

    // Snapshot so a handler that (un)subscribes mid-dispatch does not affect this
    // dispatch; the new state applies to the next emit.
    for (const handler of [...handlers]) {
      try {
        handler(...(args as unknown as never[]))
      }
      catch (error) {
        console.error(`[vuqs] error in "${String(event)}" hook handler`, error)
      }
    }
  }

  return { on, emit }
}
