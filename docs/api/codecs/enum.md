# codecs.enum <Badge type="info" text="@vuqs/core" />

## Usage

```ts
import { codecs, useQueryState } from '@vuqs/core'

enum Status {
  Active = 'active',
  Archived = 'archived',
}

const status = useQueryState('status', codecs.enum(Status))
//    ^? QueryStateRef<Status | undefined>
```

## Type

```ts
interface EnumCodecFactory {
  <const T extends Record<string, string | number>>(enumObject: T): Codec<T[keyof T]>
}
```

`EnumCodecFactory` is a local alias for the call signature of `codecs.enum`,
not a package export.

## Parameters

- `enumObject: T`
  - A TypeScript `enum`, or a plain `as const` object of strings and numbers. The
    accepted values are read from the object, so callers pass the enum directly
    rather than `Object.values(...)`.

## Return value

- `codec: Codec<T[keyof T]>`
  - A codec for the enum's member union. String, numeric, and heterogeneous enums
    are supported. A numeric member round-trips through its number rather than its
    key, and any value outside the enum parses as absent.

## Related guide

[Codecs](/guide/codecs/built-in).
