# Enabling debugging

Enable the official console reporter in a Vue application or through the Nuxt module.

## Browser

```ts
import { enableDebug } from '@vuqs/core/debug'

const stop = enableDebug()
```

The default output is `summary` with `preview` payloads. Call `stop()` to remove this generation of the reporter.

Pass options to [enableDebug](/api/debugging/enable-debug) to configure the projection:

```ts
import { disableDebug, enableDebug } from '@vuqs/core/debug'

const stop = enableDebug({
  preset: 'summary',
})

stop() // owns only this generation
disableDebug() // removes only the official console projection
```

Calling `enableDebug()` again replaces the prior configuration without duplicating
logs. An older disposer cannot detach a newer configuration. Reporters attached through
the bus are independent. `enableDebug()` and `disableDebug()` affect only the current
session and never mutate `localStorage`.

## Persistent browser configuration

Importing `@vuqs/core/debug` reads one versioned browser configuration from
`localStorage['vuqs:debug']`:

```ts
localStorage.setItem('vuqs:debug', JSON.stringify({
  version: 1,
  console: { enabled: true },
}))
location.reload()
```

For example, a persistent trace restricted to queue and adapter events is:

```ts
localStorage.setItem('vuqs:debug', JSON.stringify({
  version: 1,
  console: {
    enabled: true,
    preset: 'trace',
    payload: 'preview',
    filter: {
      include: { scopes: ['gtq', 'adapter'] },
      exclude: { codes: ['gtq:schedule'] },
    },
  },
}))
location.reload()
```

With `console.enabled: true`, omitted settings default to `preset: 'summary'`,
`payload: 'preview'`, and no filter. Persisted selectors support stable `levels`,
`scopes`, and `codes`. Runtime and binding ids are intentionally programmatic because
they can change after a reload.

Only `preview` and `hidden` are accepted as persisted payload modes. Raw `full` payloads,
custom redaction, preview limits, and adapter channels require programmatic control. An
invalid or unknown configuration version fails closed with one warning. Reading never
rewrites or migrates storage, and changes take effect after a reload.

The entry never auto-enables a process-global reporter on the server: that would mix
diagnostics across concurrent requests. Server integrations must attach the pure
reporter to a request adapter channel, as the [Nuxt integration](#nuxt) does.

::: warning Browser DevTools imports
`import('@vuqs/core/debug')` typed directly into a browser console is a bare package
specifier and normally cannot be resolved without an import map. Import the entry from
application source, use the Nuxt option below, or expose your own development command.
:::

## Nuxt

The shorthand enables browser diagnostics only, in development:

```ts
export default defineNuxtConfig({
  modules: ['@vuqs/nuxt'],
  vuqs: { debug: true },
})
```

`'force'` includes the browser reporter in production. Server logging is a separate,
explicit target because query/storage payloads may contain request data:

```ts
export default defineNuxtConfig({
  modules: ['@vuqs/nuxt'],
  vuqs: {
    debug: { client: 'force', server: true },
  },
})
```

Use `server: 'force'` only when production server logging is intentional. The server
plugin attaches to that request's adapter channel and disposes after render, error or
redirect. It never falls back to the process-global hub, so runtime-less fallback events
are omitted rather than mixed across concurrent requests. The client reporter is owned by
the Nuxt app and is removed on unmount/HMR.

When the client plugin is included, `vuqs:debug` overrides its default summary for that
browser. Set `console.enabled: false` to disable the installed client reporter locally.
An absent config keeps the Nuxt default summary. Server diagnostics ignore browser
storage and remain controlled only by the Nuxt target.

Do not also import the side-effecting `@vuqs/core/debug` entry in that Nuxt app: it owns
an independent reporter and would render each event twice.

All target decisions happen at build time; debug configuration is not placed in public
runtime config.

For filtering and trace mode, see [Console output](/guide/debugging/console-output). For custom reporters or server channels, see [Programmatic diagnostics](/guide/debugging/programmatic-diagnostics).
