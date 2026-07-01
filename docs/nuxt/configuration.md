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
| `adapter` | `boolean \| { defaultOptions? }` | `true` | Provide the [vue-router adapter](/nuxt/adapter) app-wide. `false` disables it so you can provide your own. |

## Types

```ts
interface ModuleOptions {
  autoImports?: boolean | AutoImportsOptions // default: true
  adapter?: boolean | AdapterOptions // default: true
}

interface AutoImportsOptions {
  composables?: boolean // useQueryState(s), use/provideQueryAdapter, queryParam, defineQueryModule, createSerializer
  codecs?: boolean // the `codecs` namespace and `createCodec`
  modules?: boolean // the composable modules from `@vuqs/core/modules`
}

interface AdapterOptions {
  defaultOptions?: QueryAdapterDefaultOptions
}
```

Passing an object to `autoImports` or `adapter` enables the listed groups; omitted
keys default to `true`.
