# pickBy <Badge type="tip" text="@vuqs/core/shared" />

Creates a transform keeping object keys that match a predicate.

## Usage

```ts
import { pickBy } from '@vuqs/core/shared'

pickBy(key => key === 'q')({ q: 'phone', page: 2 }) // { q: 'phone' }
```

## Type

```ts
function pickBy(predicate: (key: string) => boolean): <T extends object>(values: T) => Partial<T>
```

## Parameters

`predicate: (key: string) => boolean`. Called for each object key.

## Return value

A generic transform accepting an object and returning `Partial<T>`. The values of retained entries are preserved.

## Related guide

[Writing a module](/modules/authoring).
