/**
 * Blocks a type parameter from being inferred at this position, so it is fixed by
 * another argument or the call site instead.
 *
 * @remarks
 * Equivalent to `T`, but TypeScript will not use the annotated argument as an
 * inference source for `T`. Used so an options object can be checked against a
 * schema bound elsewhere (for example by `useQueryStates(...).use(...)`) rather
 * than inferring the schema from the options.
 *
 * @typeParam T - The type to pass through without inference.
 */
export type NoInferType<T> = [T][T extends unknown ? 0 : never]
