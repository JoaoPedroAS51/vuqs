# QueryHookBus <Badge type="info" text="@vuqs/core" />

Subscribes to and synchronously emits typed module signals.

## Usage

```ts
import { defineQueryModule } from '@vuqs/core'
import { onScopeDispose } from 'vue'

declare module '@vuqs/core' {
  interface QueryHooks {
    'my-lib:reset': () => void
  }
}

const withReset = defineQueryModule({
  queryStates: (core) => {
    const stop = core.hooks.on('my-lib:reset', () => {
      core.query.transact({ mode: 'replace', values: {} })
    })
    onScopeDispose(stop)
    return { reset: () => core.hooks.emit('my-lib:reset') }
  },
})
```

## Type

```ts
interface QueryHookBus {
  on: <Event extends keyof QueryHooks>(event: Event, handler: QueryHooks[Event]) => () => void
  emit: <Event extends keyof QueryHooks>(event: Event, ...args: HookArgs<Event>) => void
}
```

`HookArgs` is an internal conditional alias extracting the arguments of a signal handler.

## Methods

| Method | Parameters | Return value |
| --- | --- | --- |
| `on(event, handler)` | An augmented `QueryHooks` key and its handler. | Disposer that unsubscribes the handler. |
| `emit(event, ...args)` | A signal key and the arguments declared for it. | `void`. Invokes subscribed handlers synchronously. |

Handlers are invoked synchronously in unspecified order; returned promises are not awaited. A synchronous throw is logged and isolated from the emitter and other handlers. Pair subscription disposers with `onScopeDispose`.

## QueryHooks

```ts
interface QueryHooks {}
```

An open, initially empty interface. Augment `@vuqs/core` to declare signal keys and handler signatures. Module import declarations can add built-in signals.

## Related guide

[Signals](/modules/signals).
