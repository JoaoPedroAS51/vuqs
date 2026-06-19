# Configuration

All module options live under the `vuqs` key in `nuxt.config`:

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@vuqs/nuxt'],
  vuqs: {
    autoImports: true,
    adapter: { defaultOptions: { history: 'replace' } },
  },
})
```

## Options

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `autoImports` | `boolean \| { composables?, codecs?, modules? }` | `true` | Register vuqs APIs as [auto-imports](/nuxt/auto-imports). `false` registers none; an object toggles each group. |
| `adapter` | `boolean \| { defaultOptions? }` | `true` | Provide the [vue-router adapter](/nuxt/adapter) app-wide. `false` disables the built-in adapter. |
| `debug` | `boolean \| 'force' \| { client?, server? }` | `false` | Enable [console diagnostics](/guide/going-further/debugging#nuxt). The shorthand targets the browser; server logging is separately opt-in and request-scoped. |

## Types

```ts
interface ModuleOptions {
  autoImports?: boolean | AutoImportsOptions // default: true
  adapter?: boolean | AdapterOptions // default: true
  debug?: boolean | 'force' | DebugOptions // shorthand targets the client
}

interface AutoImportsOptions {
  composables?: boolean // useQueryState(s), use/provideQueryAdapter, queryParam, defineQueryModule, createSerializer
  codecs?: boolean // the `codecs` namespace and `createCodec`
  modules?: boolean // the composable modules from `@vuqs/core/modules`
}

interface AdapterOptions {
  defaultOptions?: QueryAdapterDefaultOptions
}

interface DebugOptions {
  client?: boolean | 'force'
  server?: boolean | 'force'
}
```

Passing an object to `autoImports` or `adapter` enables the listed groups; omitted
keys default to `true`.

For debug targets, omitted object keys mean disabled. `true` is development-only and
`'force'` includes that target in production. Prefer `{ client: 'force' }`; use
`{ server: 'force' }` only when raw production server diagnostics are intentional.

When the client target is included, a valid browser configuration under
`localStorage['vuqs:debug']` overrides its default summary. `console.enabled: false`
disables the client reporter for that browser without changing `nuxt.config`. Server
diagnostics never read browser storage and remain request-scoped.
