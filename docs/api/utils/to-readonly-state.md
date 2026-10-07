# toReadonlyState <Badge type="tip" text="@vuqs/core/shared" />

Projects a computed record into a readonly reactive object with dot access.

## Usage

```ts
import { toReadonlyState } from '@vuqs/core/shared'
import { computed } from 'vue'

const source = computed(() => ({ count: 2 }))
const state = toReadonlyState(source)
state.count // 2
```

## Type

```ts
function toReadonlyState<T extends object>(source: ComputedRef<T>): Readonly<T>
```

## Parameters

`source: ComputedRef<T>`, where `T extends object`.

## Return value

`Readonly<T>`. Keys and reads follow `source.value` reactively. Destructuring snapshots values; use Vue's `toRefs` to preserve reactive field access.

## Related guide

[Writing a module](/modules/authoring).
