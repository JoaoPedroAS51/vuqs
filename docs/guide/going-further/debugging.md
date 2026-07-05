# Debugging

vuqs ships an opt-in debug system that logs its internals to the console: how
values resolve, when writes coalesce, how the optimistic overlay reconciles against
the URL, plus module activity and any warnings it raises.

It lives at a dedicated subpath, so it stays out of your bundle until you import it:

```ts
import '@vuqs/core/debug'
```

## Enabling

Importing `@vuqs/core/debug` installs the console sink but keeps logging gated
behind a flag, matched as a substring for `vuqs`:

```ts
import '@vuqs/core/debug' // once, anywhere in your app

localStorage.debug = 'vuqs' // on the client
process.env.DEBUG = 'vuqs' // on the server
```

Set the flag, reload, and logging turns on. Clear it to turn logging off.

### Programmatic control

`enableDebug` forces logging on regardless of the flag; `disableDebug` removes the
sink again:

```ts
import { disableDebug, enableDebug } from '@vuqs/core/debug'

enableDebug()
disableDebug()
```

To flip it on from the devtools console without touching your source, import the
entry and enable it in one line:

```ts
import('@vuqs/core/debug').then(m => m.enableDebug())
```

## Nuxt

The [Nuxt module](/nuxt/configuration) wires this up for you with the `debug`
option. `true` registers the debug plugin only in development, so neither the plugin
nor its `@vuqs/core/debug` import reaches the production bundle:

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@vuqs/nuxt'],
  vuqs: {
    debug: true,
  },
})
```

Pass `'force'` to keep logging on in production for diagnosing a deployed app. It is
noisy and adds bundle weight, so set it deliberately and turn it back off once done:

```ts
vuqs: {
  debug: 'force',
}
```

## Reading the logs

Each line is prefixed with the subsystem that emitted it:

| Tag | Subsystem |
| --- | --- |
| <code>[vuqs &lt;id&gt; \`&lt;keys&gt;\`]</code> | A binding/engine instance, identified by its id and the query keys it owns. |
| `[vuqs gtq]` | The global throttle queue that coalesces writes. |
| <code>[vuqs &lt;adapter&gt;]</code> | An adapter, named by its kind (for example `vue-router`). |
| `[vuqs rd]` | Runtime defaults. |
| `[vuqs ctx]` | Context. |
| `[vuqs hooks]` | The hooks notification bus. |
| `[vuqs pipe]` | The transform pipeline. |
| `[vuqs serializer]` | The standalone serializer. |
| `[vuqs]` | Global, subsystem-agnostic messages. |

Warnings such as a failed JSON parse or a parse miss always render once logging is
installed, whatever the tag.

::: tip Performance timeline
Non-warning logs also emit a [`performance.mark`](https://developer.mozilla.org/en-US/docs/Web/API/Performance/mark)
User Timing entry, so the same events show up in the browser Performance panel for
timing analysis.
:::

## Instrumenting your own module

A module you build on top of vuqs can write into the same stream with
`createDebugLogger`. It returns a namespaced logger whose messages honor the flag,
render through the installed console sink, and emit `performance.mark` entries, so your
logs sit alongside the core's:

```ts
import { createDebugLogger } from '@vuqs/core'

const log = createDebugLogger('my-module')

log.debug('resolved %O', value) // [vuqs my-module] resolved { ... }
log.warn('ignoring invalid input %s', raw)
```

Pass your module's name as the namespace. Messages take the same `%s`/`%d`/`%f`/`%O`
placeholders the console interpolates, and calls are no-ops until the consumer imports
`@vuqs/core/debug` and enables logging.
