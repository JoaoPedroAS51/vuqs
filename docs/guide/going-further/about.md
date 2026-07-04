# About

The thinking behind vuqs, and the practical details around it.

## Two layers

vuqs is built in two layers, and the boundary between them is deliberate.

The **core** is pure URL-state wiring with no policy. It binds typed values to
query keys, reads and writes through an adapter, and coalesces navigations. It
knows nothing about your router, and it takes no opinion on where a value comes
from beyond the URL and its codec default.

**Modules** layer behavior on top through composition. Anything that needs more
than plain URL state, such as values resolved at runtime or state that reacts to
app context, lives in a [module](/modules/) you opt into with `.use()`, never in
the core. The set is open-ended, and modules coordinate through the shared core
rather than depending on each other.

Keeping that line clean is what lets the core stay small and predictable while the
capabilities around it grow.

## Requirements

| Requirement | Version | Notes |
| --- | --- | --- |
| Vue | `>=3.5` | Built on the current reactivity APIs. |
| `vue-router` | `4 \|\| 5` | Optional peer dependency, used only by the built-in adapter. |
| Node | `>=22` | For local development. ESM-only, no CommonJS build. |

## Acknowledgements

Inspired by [nuqs](https://nuqs.dev), which brought type-safe URL state to React.
vuqs takes the idea to Vue with its own architecture.

## About the name

`vuqs` is **Vue** plus **query state**, a nod to nuqs (from *Next-UseQueryState*),
the library that inspired it. It rhymes with nuqs on purpose.

## License

Released under the [MIT License](https://github.com/JoaoPedroAS51/vuqs/blob/main/LICENSE).
