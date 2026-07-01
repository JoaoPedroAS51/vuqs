# Installation

Install vuqs with your package manager of choice:

::: code-group

```bash [pnpm]
pnpm add @vuqs/core
```

```bash [npm]
npm install @vuqs/core
```

```bash [yarn]
yarn add @vuqs/core
```

```bash [bun]
bun add @vuqs/core
```

:::

## Requirements

| Requirement | Version | Notes |
| --- | --- | --- |
| Vue | `>=3.5` | Built on the current reactivity APIs. |
| `vue-router` | `4` | Optional peer dependency, used only by the built-in adapter. |
| Node | `>=22` | For local development. ESM-only, no CommonJS build. |

Most apps already have `vue-router`, so the built-in adapter needs nothing extra.

::: info Using Nuxt?
[`@vuqs/nuxt`](/nuxt/getting-started) wraps the core: it provides the vue-router
adapter app-wide and auto-imports the composables and codecs.
:::

## Next

The core never touches the URL on its own. Set up an [adapter](/guide/getting-started/adapters)
so vuqs can read the query and navigate, then bind your [first query state](/guide/getting-started/quick-start).
