# isDebugArmed <Badge type="info" text="@vuqs/core" />

Checks whether a channel has active reporters or retained history.

## Usage

```ts
import { isDebugArmed } from '@vuqs/core'

isDebugArmed()
```

## Type

```ts
function isDebugArmed(channel?: DebugChannelHandle): boolean
```

## Parameters

Optional `DebugChannelHandle`. Omit it to check the global channel.

## Return value

`boolean`. This check allows integrations to avoid preparing diagnostic payloads when no consumer is observing them.

## Related guide

[Debugging](/guide/debugging/programmatic-diagnostics).
