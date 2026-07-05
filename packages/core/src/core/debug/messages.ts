// Debug log messages, keyed by the namespaced string code passed to `debug`/`warn`.
//
// Kept out of the core bundle on purpose: only the opt-in `@vuqs/core/debug` entry
// (`src/debug.ts`) imports these values, so the format strings never reach
// `dist/index.mjs` unless logging is opted into via `import '@vuqs/core/debug'`.
// Call sites in the core pass the code only; the sink (`./sink`) imports this file
// type-only, so the catalog's *types* constrain call sites while its *values* stay
// behind the opt-in entry. A `build:done` assertion fails the build if this table
// leaks into the core bundle.
//
// The key is the single source of truth for both which codes exist and their
// argument shapes. The prefix scheme is `[vuqs <tag>]`: `<id> \`<keys>\`` for a
// binding/engine instance, `gtq` for the global throttle queue, `<adapter>` for an
// adapter, `rd`/`ctx` for the runtime-defaults/context modules, `hooks`/`pipe` for
// the coordination buses, `serializer`, or bare `[vuqs]` for global events.
export const debugMessages = {
  // Binding + engine (per-instance: first %s is the correlation id, `%s` the keys)
  'binding:created': '[vuqs %s `%s`] Binding created (paths %O)',
  'binding:set': '[vuqs %s `%s`] set %s = %O (options %O)',
  'engine:reconcile': '[vuqs %s `%s`] Reconciled, settled paths %O',
  'engine:clear-on-default': '[vuqs %s `%s`] clearOnDefault: dropped %s (equals default)',
  // Parse visibility (standalone param: no binding id in scope)
  'engine:parse-miss': '[vuqs] Parse miss at `%s`: raw %s present but did not decode',
  // Global throttle queue
  'gtq:enqueue': '[vuqs gtq] Enqueue %O (overlay %O)',
  'gtq:coalesce': '[vuqs gtq] Coalesced options %O',
  'gtq:schedule': '[vuqs gtq] Scheduling flush in %f ms',
  'gtq:flush': '[vuqs gtq] Flushing %d path(s) → %O (options %O)',
  'gtq:flush-skip': '[vuqs gtq] Flush skipped: %s',
  'gtq:settle': '[vuqs gtq] Settled, dropped %O',
  'gtq:reset': '[vuqs gtq] Reset',
  // Adapter (first %s is the adapter name)
  'adapter:navigate': '[vuqs %s] Navigate (%s) %O',
  'adapter:error': '[vuqs %s] Navigation rejected: %O',
  'adapter:missing': '[vuqs] No query adapter in scope',
  // Codec
  'codec:json-error': '[vuqs] json codec failed to parse `%s`: %O',
  // Coordination buses
  'hooks:emit': '[vuqs hooks] emit "%s" %O',
  'hooks:subscribe': '[vuqs hooks] subscribe "%s"',
  'pipeline:tap': '[vuqs pipe] tap %O (enforce %s)',
  // withRuntimeDefaults
  'rd:set': '[vuqs rd] setDefaults %O',
  'rd:clear': '[vuqs rd] clearDefaults',
  'rd:reset': '[vuqs rd] Reset defaults on context:change → %s',
  'rd:register': '[vuqs rd] Default layer %s',
  // withContext
  'ctx:change': '[vuqs ctx] Context → %s (valid %O, invalid %O)',
  'ctx:build': '[vuqs ctx] buildContextQuery kept %O, dropped %O',
  'ctx:switch': '[vuqs ctx] switchTo → %s',
  // Serializer
  'serializer:clear-on-default': '[vuqs serializer] Dropped %s (equals default)',
  'serializer:build': '[vuqs serializer] Built %O',
} as const

/**
 * The set of valid debug codes: the keys of {@link debugMessages}.
 *
 * @remarks
 * Makes the catalog the single source of truth for which codes exist. `debug`/`warn`
 * accept only a `DebugCode`, so an unknown code is a type error at the call site.
 */
export type DebugCode = keyof typeof debugMessages

// The type of a `%s` argument. `sprintf` (and the browser console) coerce with
// `String(arg)`, so anything with a `toString` is valid. (`%d`/`%f` narrow to
// `number`; `%O` accepts `unknown`.)
type Stringifiable = { toString: () => string } | null | undefined
type ArgType<Spec extends string> = Spec extends 'O'
  ? unknown
  : Spec extends 'd' | 'f'
    ? number
    : Spec extends 's'
      ? Stringifiable
      : never

// Walk a format string left → right, accumulating one tuple slot per %s/%d/%f/%O
// placeholder, mirroring `sprintf`'s `/%[sfdO]/g`. Recursion is bounded by the
// placeholder count of one message, not by the catalog size.
type ParseArgs<
  S extends string,
  Acc extends unknown[] = [],
> = S extends `${infer _Pre}%${infer Rest}`
  ? Rest extends `${infer Spec}${infer Tail}`
    ? Spec extends 's' | 'd' | 'f' | 'O'
      ? ParseArgs<Tail, [...Acc, ArgType<Spec>]>
      : ParseArgs<Rest, Acc>
    : Acc
  : Acc

/**
 * The argument tuple a debug code requires, derived from the `%` placeholders in its
 * message.
 *
 * @remarks
 * The catalog string is the single source of truth for both the set of codes
 * ({@link DebugCode}) and the shape of their arguments.
 */
export type DebugArgs<Code extends DebugCode> = ParseArgs<
  (typeof debugMessages)[Code]
>

export function sprintf(base: string, ...args: any[]): string {
  return base.replace(/%[sfdO]/g, (match) => {
    const arg = args.shift()
    return match === '%O' && arg
      ? JSON.stringify(arg).replace(/"([^"]+)":/g, '$1:')
      : String(arg)
  })
}
