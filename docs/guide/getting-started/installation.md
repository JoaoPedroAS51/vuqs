# Installation

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

> [!WARNING]
> vuqs is in active development. Minor releases may include breaking changes.
> Pin an exact version in your `package.json` and review the changelog before
> upgrading.

:::

## Requirements

| Requirement | Version | Notes |
| --- | --- | --- |
| Vue | `>=3.5` | Built on the current reactivity APIs. |
| `vue-router` | `4 \|\| 5` | Optional peer dependency, used only by the built-in adapter. |
| Node | `>=22` | For local development. ESM-only, no CommonJS build. |

::: info Using Nuxt?
[`@vuqs/nuxt`](/nuxt/getting-started) wraps the core: it provides the vue-router
adapter app-wide and auto-imports the composables and codecs.
:::

## Next

The core never touches the URL on its own. Set up an [adapter](/guide/getting-started/adapters)
so vuqs can read the query and navigate, then bind your [first query state](/guide/getting-started/quick-start).
