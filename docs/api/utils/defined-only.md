# definedOnly <Badge type="tip" text="@vuqs/core/shared" />

Copies an object without entries whose value is `undefined`.

## Usage

```ts
import { definedOnly } from '@vuqs/core/shared'

definedOnly({ q: 'phone', page: undefined }) // { q: 'phone' }
```

## Type

```ts
function definedOnly<T extends object>(values: T): T
```

## Parameters

`values: T extends object`. The object to copy.

## Return value

`T`. The result retains the input type even though undefined-valued properties are omitted at runtime.

## Related guide

[Writing a module](/modules/authoring).
