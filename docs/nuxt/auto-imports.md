# Auto-imports

The module registers vuqs APIs as Nuxt auto-imports, so you use them without an
`import` line.

| Group | Names | From |
| --- | --- | --- |
| Composables | `useQueryState`, `useQueryStates`, `useQueryAdapter`, `provideQueryAdapter`, `queryParam`, `defineQueryModule`, `createSerializer` | `@vuqs/core` |
| Codecs | `codecs`, `createCodec` | `@vuqs/core` |
| Modules | the composable [modules](/modules/) | `@vuqs/core/modules` |

`codecs` is a single namespace object, so it is one auto-imported name
(`codecs.string`, `codecs.integer`, and so on), not one per codec.

The Modules group registers every module exported from `@vuqs/core/modules`, so a
new module becomes available without changing your config.

## Pick which groups to auto-import

Set `autoImports` to an object to toggle each group. Omitted groups default to
`true`:

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@vuqs/nuxt'],
  vuqs: {
    autoImports: {
      composables: true,
      codecs: false, // import `codecs` manually instead
      modules: true,
    },
  },
})
```

Set `autoImports: false` to register none. See [Configuration](/nuxt/configuration)
for the full option types.
