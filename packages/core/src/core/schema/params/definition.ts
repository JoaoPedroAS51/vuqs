import type { Codec } from '../../codecs/codec'
import type { ParsedQuery, ParsedQueryRaw } from '../../query/types'
import { structuralEq } from '../../../shared/utils/object'
import { collectLeafPaths, getPath, setPath } from '../../query/path'

/** Receives diagnostics produced while a param reads a query. */
export interface QueryParamReadContext {
  onInvalid: (path: string, raw: unknown) => void
}

/**
 * Type-only carrier of a param's value contracts.
 *
 * @internal
 */
export declare const paramContract: unique symbol

/**
 * Type-only carrier of the declared object children of a composed param.
 *
 * @internal
 */
export declare const paramChildren: unique symbol

/**
 * The value contracts a param preserves through builders, prefixes and state bindings.
 *
 * @typeParam TExplicit - The decoded value before default resolution.
 * @typeParam TResolved - The value after applicable defaults when it is defined.
 * @typeParam TContribution - The value a default source can supply.
 * @typeParam TGuaranteed - `true` when an applicable static default guarantees a defined resolved value.
 */
export interface ParamContract<
  TExplicit,
  TResolved,
  TContribution,
  TGuaranteed extends boolean,
> {
  explicit: TExplicit
  resolved: TResolved
  contribution: TContribution
  guaranteed: TGuaranteed
}

/**
 * A defined query param the core can execute.
 *
 * @typeParam TExplicit - The decoded value type before default resolution.
 * @typeParam TResolved - The value type after applicable defaults, accepted wherever the explicit type is accepted.
 * @typeParam TContribution - The value type a default source can supply.
 * @typeParam TGuaranteed - `true` when an applicable static default guarantees a defined resolved value.
 */
export interface DefinedQueryParam<
  TExplicit,
  TResolved = TExplicit,
  TContribution = TExplicit,
  TGuaranteed extends boolean = boolean,
> {
  /** Type-only carrier of the param's value contracts. */
  readonly [paramContract]?: ParamContract<TExplicit, TResolved, TContribution, TGuaranteed>
  /** The query keys this param owns. */
  readonly paths: readonly string[]
  /**
   * Reads the param's decoded URL value.
   *
   * @returns The decoded value, or `undefined` when absent or invalid.
   */
  read: (query: ParsedQuery, context?: QueryParamReadContext) => TExplicit | undefined
  /**
   * Encodes the param's value for the query.
   *
   * @returns A new query object containing only declared `paths`.
   */
  write: (value: TExplicit) => ParsedQueryRaw
  /** Compares two defined values in the explicit-value domain. */
  eq: (a: TExplicit, b: TExplicit) => boolean
  /**
   * Resolves an explicit value or its absence against the applicable default.
   *
   * A param that guarantees a resolved value must return one.
   *
   * @returns The resolved value, or `undefined` when none applies and presence is not guaranteed.
   */
  resolve?: (
    explicitValue: TExplicit | undefined,
    defaultValue: TResolved | undefined,
  ) => [TGuaranteed] extends [true] ? TResolved : TResolved | undefined
  /** The param's static default candidate, if the codec or builder declared one. */
  readonly defaultValue?: TContribution
  /** Param-level `clearOnDefault` override. */
  readonly clearOnDefault?: boolean
  /** Conditions every default of the param on decoded explicit presence. */
  readonly presenceGated?: boolean
}

/**
 * A {@link DefinedQueryParam} whose definition guarantees a defined resolved value.
 *
 * @typeParam T - The decoded value type of the param.
 */
export type DefinedQueryParamWithDefault<T> = DefinedQueryParam<T, T, T, true>

/** @internal */
export type AnyDefinedQueryParam = DefinedQueryParam<any, any, any, boolean>

/**
 * The composed default of one param position.
 *
 * @internal
 */
export interface DefaultCandidate {
  /** The composed value before read projection, or `undefined` when no source supplies one. */
  readonly value: unknown
  /** `true` when a source supplied this param directly, including `{}` for an object. */
  readonly direct: boolean
  /** The candidates of declared object children. */
  readonly children?: Readonly<Record<string, DefaultCandidate>>
}

/**
 * The declared structure the core traverses for composition and resolution.
 *
 * @internal
 */
export interface ParamStructure {
  /** The declared object children, keyed by logical name; absent for atomic params. */
  readonly children?: Readonly<Record<string, AnyDefinedQueryParam>>
  /** The static composed candidate before any runtime source. */
  readonly staticCandidate?: DefaultCandidate
}

/** @internal */
export const PARAM_STRUCTURE: unique symbol = Symbol('vuqs.paramStructure')

/** @internal */
export interface StructuredParam {
  readonly [PARAM_STRUCTURE]?: ParamStructure
}

/**
 * Reads the declared structure of a param.
 *
 * @returns The structure, or `undefined` when the param has no structure metadata.
 *
 * @internal
 */
export function getParamStructure(param: AnyDefinedQueryParam): ParamStructure | undefined {
  return (param as StructuredParam)[PARAM_STRUCTURE]
}

/**
 * Creates a defined param from executable pieces.
 *
 * @internal
 */
export function createDefinedQueryParam<
  TExplicit,
  TResolved = TExplicit,
  TContribution = TExplicit,
  TGuaranteed extends boolean = boolean,
>(
  input: {
    paths: readonly string[]
    read: (query: ParsedQuery, context?: QueryParamReadContext) => TExplicit | undefined
    write: (value: TExplicit) => ParsedQueryRaw
    eq?: (a: TExplicit, b: TExplicit) => boolean
    resolve?: (explicitValue: TExplicit | undefined, defaultValue: TResolved | undefined) => TResolved | undefined
    defaultValue?: unknown
    clearOnDefault?: boolean
    presenceGated?: boolean
    structure?: ParamStructure
  },
): DefinedQueryParam<TExplicit, TResolved, TContribution, TGuaranteed> {
  const write = guardWrite(input.paths, input.write)
  const structure: ParamStructure = input.structure ?? {
    staticCandidate: input.defaultValue === undefined
      ? undefined
      : { value: input.defaultValue, direct: false },
  }

  return {
    paths: input.paths,
    read: input.read,
    write,
    eq: input.eq ?? structuralEq,
    resolve: input.resolve,
    defaultValue: structure.staticCandidate?.value,
    clearOnDefault: input.clearOnDefault,
    presenceGated: input.presenceGated,
    [PARAM_STRUCTURE]: structure,
  } as DefinedQueryParam<TExplicit, TResolved, TContribution, TGuaranteed>
}

/**
 * Creates the executable pieces of a codec bound to a single dot-path.
 *
 * @internal
 */
export function codecParamInput<T>(path: string, codec: Codec<T>): {
  paths: readonly string[]
  read: (query: ParsedQuery, context?: QueryParamReadContext) => T | undefined
  write: (value: T) => ParsedQueryRaw
  eq: (a: T, b: T) => boolean
  defaultValue?: T
} {
  return {
    paths: [path],
    read: (query, context) => {
      const raw = getPath(query, path)
      const parsed = codec.parse(raw)

      if (raw !== undefined && raw !== null && parsed === undefined) {
        context?.onInvalid(path, raw)
      }

      return parsed
    },
    write: value => setPath({}, path, codec.serialize(value)),
    eq: codec.eq,
    defaultValue: codec.defaultValue,
  }
}

/**
 * Binds a codec to a single dot-path.
 *
 * @internal
 */
export function defineCodecQueryParam<T>(path: string, codec: Codec<T>): DefinedQueryParam<T> {
  return createDefinedQueryParam<T>(codecParamInput(path, codec))
}

/**
 * Wraps a write function so every call checks that the keys it writes fall
 * within the declared paths.
 *
 * @returns A writer that throws if its output includes a key outside `paths`.
 *
 * @internal
 */
export function guardWrite<T>(
  paths: readonly string[],
  write: (value: T) => ParsedQueryRaw,
): (value: T) => ParsedQueryRaw {
  const declared = new Set(paths)

  return (value) => {
    const output = write(value)

    for (const path of collectLeafPaths(output)) {
      if (!declared.has(path)) {
        throw new Error(
          `[vuqs] write() wrote "${path}", which is not in the declared paths [${paths.join(', ')}].`,
        )
      }
    }

    return output
  }
}

/** @internal */
export function isDefinedQueryParam(value: unknown): value is AnyDefinedQueryParam {
  return value !== null
    && typeof value === 'object'
    && typeof (value as AnyDefinedQueryParam).read === 'function'
    && typeof (value as AnyDefinedQueryParam).write === 'function'
    && Array.isArray((value as AnyDefinedQueryParam).paths)
}
