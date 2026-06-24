# @vuqs/playground

Interactive playground for `vuqs` and its [modules](../docs/modules/introduction.md). Every page
syncs state to the URL — edit a control and watch the inspector, or edit the URL and watch the UI
react. State survives a reload because it lives in the query string.

## Run

```bash
pnpm install        # from the repo root
pnpm --filter @vuqs/playground dev
```

Then open http://localhost:5173.

## Pages

| Route      | Demonstrates |
| ---------- | ------------ |
| `/single`  | `useQueryState` across every codec (string, integer, float, boolean, literal, arrayOf, isoDate), defaults, and `.clear()` |
| `/grouped` | `useQueryStates` driving a search/sort/page list, with a per-call `history: 'push' \| 'replace'` override |
| `/store`   | `withEffective`: `selected` (URL) vs async-loaded `defaults` vs derived `effective` |
| `/context` | `withContext`: `preserve` / reset / `only` validity across tabs, in one navigation |

## How it resolves the packages

`vite.config.ts` aliases `vuqs`, `vuqs/adapters/vue-router`, and `vuqs/modules` to their `src/`
entry points, so editing the libraries reflects instantly via HMR with no rebuild. The published
`dist` stubs (`unbuild --stub`) are jiti-backed and run in Node only, which is why a browser
playground aliases to source instead.
