# @vuqs/store

The [core](/guide/introduction) solves one problem: a typed value ⇄ the URL.
That's enough for most apps. But real filtering UIs often have two more needs the
core deliberately leaves out:

1. **Defaults supplied at runtime** — saved preferences or computed defaults
   layer *under* explicit selections, but must never end up in the URL.
2. **Context-aware reset** — switching tabs, stepping through a wizard, or changing
   route should preserve some filters and reset others.

`@vuqs/store` adds exactly those two things on top of the core, and nothing more.

```bash
pnpm add @vuqs/store vuqs
```

## What it adds

### Three states

Instead of one value per field, the store tracks three layers
([full guide](/store/three-states)):

| State | Source | In the URL? |
| --- | --- | --- |
| `selected` | the user's explicit choices, mirrored from the URL | ✅ yes |
| `defaults` | supplied via `setDefaults` | ❌ never |
| `effective` | `selected` layered over `defaults` — the read model | derived |

Your UI reads `effective`; only `selected` is serialized. Clearing a field reverts
it to its default.

### Context-aware reset

A single store can serve several **contexts** — tabs, steps, modes
([full guide](/store/context)). You declare which fields survive a context change,
which reset, and which only exist in certain contexts:

```ts
context: {
  active: () => tab.value,    // an external, opaque identifier
  preserve: ['q'],            // kept across a switch; everything else resets
  only: {                     // field validity per context
    category: ['products'],
    status: ['orders'],
  },
}
```

## When you *don't* need the store

If you only sync state to the URL — no runtime defaults, no context reset — stay with
[`useQueryState`](/guide/use-query-state) /
[`useQueryStates`](/guide/use-query-states). The store is additive; it doesn't
replace the core, it builds on it (`store → core`). You can always adopt it later
without rewriting your fields — the same [schema](/guide/concepts#schema-a-map-of-fields)
works in both.

## Relationship to the core

```
@vuqs/store  ──depends on──▶  vuqs (core)
   3 states                    value ⇄ URL
   context reset               codecs, adapters
```

The store is versioned separately (kept `0.x` while its opinions settle) so its
API can evolve without gating the core's stability. Both share the same codecs,
fields, and adapters.

Next: **[The three states →](/store/three-states)**
