# QueryModuleRegistry <Badge type="info" text="@vuqs/core" />

Registers a module's options contract and specialized setup through TypeScript module augmentation.

## Usage

```ts
import type { ComputedRef } from 'vue'
import type { QueryCore, QueryStateSchema, QueryStateValueAt } from '@vuqs/core'
import { defineQueryModule } from '@vuqs/core'
import { computed } from 'vue'

declare module '@vuqs/core' {
  interface QueryModuleRegistry<TSchema extends QueryStateSchema, TOptions, TInference = unknown> {
    'my-lib:explicit-value': {
      state: () => typeof withExplicitValue.definition.state<TSchema>
    }
  }
}

export const withExplicitValue = defineQueryModule({
  name: 'my-lib:explicit-value',
  state: <TSchema extends QueryStateSchema>(
    core: QueryCore<TSchema>,
    key: keyof TSchema & string,
  ): { api: { explicitValue: ComputedRef<QueryStateValueAt<TSchema, 'value'> | undefined> } } => ({
    api: {
      explicitValue: computed(() => core.state.explicitValues.value[key] as QueryStateValueAt<TSchema, 'value'> | undefined),
    },
  }),
})
```

## Type

```ts
interface QueryModuleRegistry<TSchema extends QueryStateSchema, TOptions, TInference = unknown> {}

type QueryModuleName = keyof QueryModuleRegistry<QueryStateSchema, unknown>

type ModuleOptions<TProvided, TContract> = unknown extends TProvided
  ? TContract
  : Extract<TProvided, TContract>
```

## Type parameters

| Parameter | Meaning |
| --- | --- |
| `TSchema extends QueryStateSchema` | Schema supplied by the composing facade. A `state` signature receives the single schema `{ value: DefinedQueryParam }`. |
| `TOptions` | The options the module was configured with, or `unknown` while the factory infers them. |
| `TInference` | The source an option callback is contextualized by, inferred independently of `TOptions`. Modules without such a relationship ignore it. |

Every augmentation declares all three parameters with the same names and the default shown.

## Signatures

| Signature | Meaning |
| --- | --- |
| `states(options) => setup` | Grouped form. The parameter is the options contract; the return type is the setup specialized for `TSchema` and the configured options. |
| `state(options) => setup` | Single form with the same roles. |

Keys are namespaced module names, and `QueryModuleName` is their union. Pass a key as `name` to `defineQueryModule`. The registry is type-only and registers no runtime behavior. A module without options declares the signature without a parameter, and its factory is called without arguments.

`ModuleOptions<TOptions, TContract>` is the accepted contract while `TOptions` is `unknown`, and the supplied options, narrowed to those that satisfy the contract, afterwards. A call that supplies options outside the contract, including a union with an incompatible alternative, is rejected.

Read the single param value with `QueryStateValueAt<TSchema, 'value'>`. Grouped signatures can key their options and maps against `keyof TSchema`.

## Registry lookups

| Type | Resolves to |
| --- | --- |
| `QueryModuleStatesContract<TName, TSchema>` / `QueryModuleStateContract<TName, TSchema>` | The options contract of the signature, before options are known. |
| `QueryModuleStatesParam<TName, TSchema, TOptions, TInference>` / `QueryModuleStateParam<…>` | The options parameter for the configured options. |
| `QueryModuleStatesSetup<TName, TSchema, TOptions, TInference>` / `QueryModuleStateSetup<…>` | The specialized setup the signature returns. |
| `QueryModuleStatesResult<…>` / `QueryModuleStateResult<…>` | The result that setup produces. |
| `QueryModuleStatesApi<…>` / `QueryModuleStateApi<…>` | The `api` of that result. |
| `VerifiedStatesProducer<…>` / `VerifiedStateProducer<…>` | The callback shape `.use()` requires of the actual setup. |

`.use()` verifies the actual callback against the specialization for the bound schema and options, at the first and at every later `.use()` in a chain.

## Related guide

[Registering a module](/modules/authoring#registering-a-module).
