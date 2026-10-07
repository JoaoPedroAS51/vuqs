# Write lifecycle

Use transaction and batch identifiers to follow a write from the caller to its navigation result. Coalescing can combine several transactions and bindings into one navigation, so the trace is not one fixed sequence per setter call.

## Successful navigation

The main events of a successful managed navigation are:

```text
tx:start → binding:set → gtq:enqueue → gtq:flush
         → adapter:navigate → adapter:commit → gtq:settle
```

Scheduling, option coalescing, default clearing, and module events can also appear. A managed `adapter:commit` occurs after successful navigation, before settlement. It carries the final parsed query, even when the adapter normalized the serialized write.

The summary combines related events into one result:

```text
[vuqs] Updated the URL: "color" = "green".
```

## Failed navigation

A managed navigation that throws or rejects reports `adapter:error`. Its optional `rolledBack` payload lists the paths whose pending writes were reverted.

Rollback applies only to versions belonging to that attempt. A newer write to the same path survives the failure.

```text
[vuqs] Could not update the URL; restored the previous value of "color".
```

## Coalescing and correlation

`transactionIds` associates events with write intents. `batchId` associates them with a navigation batch. `bindingId` identifies a binding; `runtimeId` identifies its adapter runtime. Context fields are optional because some events are emitted outside those operations.

The global `seq` field orders the event stream. It does not imply that adjacent events belong to the same operation.

## External changes

An external query update reports `adapter:commit` with `source: 'external'`. A managed commit uses `source: 'write'`.

While a navigation is pending, the queue keeps at most one query observation for
attribution. A later observation reports the previous one as external. The attempt's
outcome attributes the final observation: a successful navigation reports the
managed commit; a rejected attempt reports it as external.

## Testing without memory

Without memory, the testing adapter settles completed writes into simulated read
state. Its queue snapshot contains only pending writes, and it does not emit a
managed `adapter:commit` for a simulation that leaves the query unchanged.

See the [event reference](/api/debug-events#transactions-and-navigation) for individual payloads and emission conditions. See [Console output](/guide/debugging/console-output) for summary and trace presentation.
