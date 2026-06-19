# @vuqs/playground

Interactive playground for `@vuqs/core` and its [modules](../docs/modules/index.md).
Each page synchronizes the controls and URL in both directions and displays the
current state in the inspector.

## Run

```bash
pnpm install        # from the repo root
pnpm --filter @vuqs/playground dev
```

Then open http://localhost:5173.

## Pages

| Route      | Demonstrates |
| ---------- | ------------ |
| `/single`  | `useQueryState` with string, integer, float, boolean, literal, array, and date codecs, defaults, and `.clear()` |
| `/grouped` | `useQueryStates` driving a search/sort/page list, with a per-call `history: 'push' \| 'replace'` override |
| `/store`   | `withRuntimeDefaults`: URL `selected`, async-loaded `defaults`, and resolved `values` |
| `/context` | `withContext`: `preserve` / reset / `only` validity across tabs, in one navigation |

## Package resolution

`vite.config.ts` aliases `@vuqs/core`, `@vuqs/core/adapters/vue-router`, and `@vuqs/core/modules` to their `src/`
entry points, so editing the libraries is picked up by HMR with no rebuild. The published
`dist` stubs (`unbuild --stub`) are jiti-backed and run in Node only, which is why a browser
playground aliases to source instead.
