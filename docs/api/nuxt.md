# API: @vuqs/nuxt

The Nuxt module — auto-imports plus the adapter, out of the box. See the
[Nuxt guide](/nuxt/introduction) for the narrative.

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@vuqs/nuxt'],
  vuqs: { /* ModuleOptions */ },
})
```

Config key: **`vuqs`**. Compatibility: **Nuxt `>=3.0.0`** (3 and 4).

## ModuleOptions <Badge type="warning" text="@vuqs/nuxt" />

The options under the `vuqs` config key.

### Properties

```ts
interface ModuleOptions {
  autoImports?: boolean | AutoImportsOptions // default: true
  adapter?: boolean | AdapterOptions         // default: true
}
```

| Property | Type | Default | Description |
| --- | --- | --- | --- |
| `autoImports` | `boolean \| AutoImportsOptions` | `true` | Auto-import composables, codecs, and modules. |
| `adapter` | `boolean \| AdapterOptions` | `true` | Provide the vue-router adapter app-wide via a plugin. |

### AutoImportsOptions

```ts
interface AutoImportsOptions {
  composables?: boolean // useQueryState(s), use/provideQueryAdapter, defineQueryParam, createSerializer
  codecs?: boolean      // the `codecs` namespace and `createCodec`
  modules?: boolean     // the composable modules from `vuqs/modules`
}
```

- `autoImports: true` (default) enables every group.
- `autoImports: false` registers no auto-imports.
- An object enables the listed groups; omitted groups default to `true`.

The `modules` group registers every module exported from `vuqs/modules`. Because
modules ship with `vuqs`, the group is always available — no extra install.

### AdapterOptions

```ts
interface AdapterOptions {
  defaultOptions?: QueryAdapterDefaultOptions
}
```

- `adapter: true` (default) provides the
  [vue-router adapter](/api/adapters#createvuerouteradapter) app-wide via a plugin.
- `adapter: false` skips the plugin so you can
  [provide your own](/nuxt/introduction#bring-your-own-adapter).
- `adapter.defaultOptions` are forwarded to the adapter as its
  [`defaultOptions`](/api/adapters#createvuerouteradapter); see
  [`QueryAdapterDefaultOptions`](/api/types#adapter-navigation-types). They sit at
  the bottom of the [precedence chain](/guide/navigation-options#precedence).

The defaults are exposed through `runtimeConfig.public.vuqs.adapter`, so they can
be overridden per environment like any public runtime config.

## What it registers

| When | Effect |
| --- | --- |
| `autoImports.composables` | Auto-imports the core composables and `defineQueryParam`, `createSerializer` from `vuqs`. |
| `autoImports.codecs` | Auto-imports `codecs` and `createCodec` from `vuqs`. |
| `autoImports.modules` | Auto-imports the composable modules from `vuqs/modules`. |
| `adapter` not `false` | Adds a plugin that calls `installQueryAdapter(nuxtApp.vueApp, createVueRouterAdapter(...))`. |
