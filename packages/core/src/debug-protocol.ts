// Type-only entry: the strict debug protocol for first-party tooling such as
// `@vuqs/devtools`. It declares no runtime values (compiles to zero JS), and the
// shapes it re-exports are experimental: they are governed by `DEBUG_PROTOCOL_VERSION`
// (exported from `@vuqs/core`), not by the package's normal semver.
export type { KnownDebugEvent } from './core/debug/bus'
export type {
  DebugEventCode,
  DebugEventMap,
  DebugScope,
  LogDebugCode,
  WarnDebugCode,
} from './core/debug/events'
export type {
  DebugSnapshot,
  DebugSnapshotByKind,
  DebugSnapshotKind,
  EngineSnapshot,
  QueueSnapshot,
  StorageSnapshot,
} from './core/debug/snapshot'
