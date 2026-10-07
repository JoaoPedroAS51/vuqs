# Payloads and redaction

Choose which event data reaches the console and apply application-specific redaction before sharing diagnostic records.

## Console modes

| Mode | Behavior |
| --- | --- |
| `preview` | Default. Bounded, detached snapshots with built-in and optional application redaction. |
| `hidden` | Event narrative without a payload dump. |
| `full` | Live raw references, bypassing preview redaction. |

Preview detaches Vue proxies, cycles, and mutable references. It redacts common sensitive keys such as `password`, `token`, `cookie`, `authorization`, and `session`.

Filters run before payload normalization and redaction. Dynamic names and values in console sentences use the same projection as the payload. If redaction removes the expected shape, the reporter uses generic prose.

## Application redaction

The `redact` callback receives a bounded preview and returns its replacement. This example masks `customerEmail` properties at any depth in that preview:

```ts
import { enableDebug } from '@vuqs/core/debug'

function redactCustomerEmail(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(redactCustomerEmail)
  }
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [
      key,
      key === 'customerEmail' ? '[redacted]' : redactCustomerEmail(child),
    ]))
  }
  return value
}

enableDebug({ redact: redactCustomerEmail })
```

The callback result is normalized again. If the callback throws, the reporter fails closed rather than printing a raw fallback.

Neither the built-in denylist nor a custom callback guarantees that arbitrary application data contains no secrets. Literal message text supplied to `createDebugLogger` is author-controlled and cannot be redacted automatically; structured arguments follow the payload policy.

## History and snapshots

Console redaction does not apply to custom reporters, retained history, or snapshots.

| Surface | Data received |
| --- | --- |
| Live custom reporter | Raw event references. |
| Replayed history | Normalized, deeply frozen records. Normalization is not redaction. |
| Snapshot | Bounded, detached subsystem state. No automatic redaction. |

Engine values and defaults, storage metadata, pending writes, and custom module arguments can contain application data. Apply your integration's redaction policy before transporting or persisting these records.

For capture and replay examples, see [Programmatic diagnostics](/guide/debugging/programmatic-diagnostics).
