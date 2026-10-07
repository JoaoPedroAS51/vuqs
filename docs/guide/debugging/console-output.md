# Console output

Choose summary messages or the complete event trace, then filter the stream to the operation you are investigating.

## Summary and trace

`summary` is the default. It shows committed state changes and failures while omitting
internal callbacks. One committed write normally reads as one result:

```text
[vuqs] Updated the URL: "color" = "green".
```

Queue enqueue/schedule plumbing, hook dispatch, pipeline registration and binding
lifecycle stay hidden. A failed navigation instead explains the rollback:

```text
[vuqs] Could not update the URL; restored the previous value of "color".
```

Warnings, module decisions with summary messages, and explicit module logs remain visible.

A committed URL change with no pending vuqs write (for example browser back/forward
or another router integration) identifies only the synchronized paths:

```text
[vuqs] The URL changed outside vuqs; synchronized "color" and "page".
```

When a write selects the resolved default, the summary describes the resulting state
instead of presenting URL cleanup as the user's intent:

```text
[vuqs] "page" now uses its default value (1), so the URL does not need a "page" parameter.
```

If canonicalizing the default leaves the URL unchanged, it produces no summary line.
See [Common summary results](#common-summary-results) for the other committed-write forms.

Use `trace` for the complete FIFO stream:

```ts
import { enableDebug } from '@vuqs/core/debug'

enableDebug({ preset: 'trace' })
```

```text
[vuqs trace] gtq:enqueue — Queued 1 URL change; 1 path is now pending. { ... }
```

The searchable event code stays in the trace label. Runtime, binding, transaction, batch,
timestamps and global sequence move into one expandable details object, so the sentence
remains readable. The console does not group asynchronous events heuristically; causal
grouping uses the structured context.

See the [event reference](/api/debug-events) for emission conditions and typed payloads.

## Filtering

The official reporter supports include/exclude selectors. Dimensions within one selector
are combined, while values inside a dimension are alternatives. Exclusion wins:

```ts
import { enableDebug } from '@vuqs/core/debug'

enableDebug({
  preset: 'trace',
  filter: {
    include: { scopes: ['gtq', 'adapter'], runtimeIds: ['rt0'] },
    exclude: { codes: ['gtq:schedule'] },
  },
})
```

Filters run before payload normalization and redaction.

## Summary policies

- **Visible:** produces its own human summary.
- **Conditional:** produces a summary only for the configured outcomes.
- **Aggregated:** contributes to another logical result, such as a committed URL write.
- **Trace only:** stays out of the default summary but appears in the complete trace.
- **Pass-through:** preserves prose and console arguments supplied by `createDebugLogger`.

## Common summary results

Summary prose describes the observable result of a correlated operation. It does not
mirror each low-level event. These are the common committed-write forms:

```text
[vuqs] Updated the URL: "color" = "green".
[vuqs] Removed "draft" from the URL.
[vuqs] Updated 2 URL parameters in one navigation: updated "q" and removed "page".
[vuqs] Updated the URL and added a browser history entry: "page" = 2.
[vuqs] "page" now uses its default value (1), so the URL does not need a "page" parameter.
```

The default-valued form reports the effective query state. It does not imply that the
caller explicitly requested a removal. Default canonicalization that leaves the URL
unchanged produces no summary line.

For event ordering and navigation outcomes, see [Write lifecycle](/guide/debugging/write-lifecycle). For payload modes and redaction, see [Payloads and redaction](/guide/debugging/payloads).
