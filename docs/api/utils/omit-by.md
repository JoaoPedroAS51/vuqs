# omitBy <Badge type="tip" text="@vuqs/core/shared" />

Creates a transform removing object keys that match a predicate.

## Usage

```ts
import { omitBy } from '@vuqs/core/shared'

omitBy(key => key === 'page')({ q: 'phone', page: 2 }) // { q: 'phone' }
```

## Type

```ts
function omitBy(predicate: (key: string) => boolean): <T extends object>(values: T) => Partial<T>
```

## Parameters

`predicate: (key: string) => boolean`. Called for each object key.

## Return value

A generic transform accepting an object and returning `Partial<T>`. The values of retained entries are preserved.

## Related guide

[Writing a module](/modules/authoring).
