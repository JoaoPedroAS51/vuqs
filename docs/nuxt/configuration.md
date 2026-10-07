# Configuration

Configure the module under `vuqs` in `nuxt.config`:

```ts
export default defineNuxtConfig({
  modules: ['@vuqs/nuxt'],
  vuqs: {
    autoImports: true,
    adapter: { defaultOptions: { history: 'replace' } },
    debug: true,
  },
})
```

## autoImports

- **Type:** `boolean | AutoImportsOptions`
- **Default:** `true`

`true` enables all groups. `false` registers none. An object toggles individual groups; omitted groups default to `true`.

| Group | Names | Entry point |
| --- | --- | --- |
| `composables` | `useQueryState`, `useQueryStates`, `useQueryAdapter`, `provideQueryAdapter`, `toQueryRef`, `toQueryRefs`, `queryParam`, `defineQuerySchema`, `defineQueryModule`, `createSerializer` | `@vuqs/core` |
| `codecs` | `codecs`, `createCodec` | `@vuqs/core` |
| `modules` | `withRuntimeDefaults`, `withContext`, `withActiveParams`, `withStorage` | `@vuqs/core/modules` |

```ts
export default defineNuxtConfig({
  modules: ['@vuqs/nuxt'],
  vuqs: { autoImports: { codecs: false } },
})
```

Import APIs from a disabled group explicitly. Other core exports, such as `installQueryAdapter`, are not registered as auto-imports.

## adapter

- **Type:** `boolean | AdapterOptions`
- **Default:** `true`

`true` installs the adapter with its default options. An object enables it and supplies `defaultOptions`. `false` skips installation so your plugin can provide a custom adapter.

```ts
export default defineNuxtConfig({
  modules: ['@vuqs/nuxt'],
  vuqs: {
    adapter: {
      defaultOptions: { history: 'push', throttleMs: 100 },
    },
  },
})
```

These defaults are exposed at `runtimeConfig.public.vuqs.adapter.defaultOptions`. Existing runtime config overrides are preserved while missing values are filled from module configuration.

Per-call and composable options take precedence over adapter defaults. Omitted navigation options follow the [option precedence](/guide/query-state/navigation-options#precedence); they do not default to `true`.

See [Routing and adapters](/nuxt/adapter) for router selection, nested query formats, and custom installation.

## debug

- **Type:** `DebugTargetOption | DebugOptions`
- **Default:** `false`

| Value | Behavior |
| --- | --- |
| `false` | No console reporter plugins. |
| `true` | Browser reporter in development. |
| `'force'` | Browser reporter in development and production. |
| `{ client?, server? }` | Configure each target independently. Omitted targets are disabled. |

Each object target accepts `false`, `true`, or `'force'` with the same inclusion rules. Server diagnostics are request-scoped and enabled separately.

```ts
export default defineNuxtConfig({
  modules: ['@vuqs/nuxt'],
  vuqs: { debug: { client: true, server: true } },
})
```

Target selection happens at build time. Debug targets are not public runtime config options. When included, the client plugin reads the browser's persisted console configuration; server plugins do not.

See [Enabling debugging](/guide/debugging/enabling#nuxt) for persisted overrides, reporter ownership, and SSR lifecycle.

## Types

```ts
interface ModuleOptions {
  autoImports?: boolean | AutoImportsOptions
  adapter?: boolean | AdapterOptions
  debug?: DebugTargetOption | DebugOptions
}

interface AutoImportsOptions {
  composables?: boolean
  codecs?: boolean
  modules?: boolean
}

interface AdapterOptions {
  defaultOptions?: QueryAdapterDefaultOptions
}

type DebugTargetOption = boolean | 'force'

interface DebugOptions {
  client?: DebugTargetOption
  server?: DebugTargetOption
}
```

The module types are exported from `@vuqs/nuxt`. `QueryAdapterDefaultOptions` is exported from `@vuqs/core`.
