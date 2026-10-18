import type { ParsedQuery } from '../../query/types'
import type { ChildrenOf, ContributionOf, ExplicitValueOf, ResolvedValueOf, Simplify } from '../../schema/params/builder-types'
import type { QueryStateSchema } from '../../schema/schema'
import type { NavigateOptions } from '../adapter'

/** A param-keyed value map flowing through the pipeline. */
export type QueryValues = Record<string, unknown>

/**
 * The value-map contract for each pipeline stage.
 *
 * @internal
 */
export interface QueryPipeline {
  /** Reshapes the values the app reads. */
  read: (values: QueryValues) => QueryValues
  /** Reshapes the values written to the URL on a navigation. */
  write: (values: QueryValues) => QueryValues
}

/** A pipeline stage name. */
export type QueryPipelineStage = keyof QueryPipeline

/**
 * The execution band of a pipeline descriptor.
 */
export type Enforce = 'pre' | 'default' | 'post'

// Descriptors

/** The read projection a descriptor targets. */
export type ReadProjection = 'explicit' | 'defaults' | 'resolved'

type PathKey = string

/**
 * A logical path: schema params and declared object children, as a tuple of keys.
 *
 * Prefixes do not change a path, and atomic params end the path.
 *
 * @typeParam TSchema - The schema the path addresses.
 */
export type PipelinePath<TSchema extends QueryStateSchema> = {
  [Key in keyof TSchema & PathKey]: [Key] | ChildPaths<[Key], TSchema[Key]>
}[keyof TSchema & PathKey]

type ChildPaths<TPrefix extends PathKey[], TParam> = [ChildrenOf<TParam>] extends [never]
  ? never
  : {
      [Key in keyof ChildrenOf<TParam> & PathKey]:
        | [...TPrefix, Key]
        | ChildPaths<[...TPrefix, Key], ChildrenOf<TParam>[Key]>
    }[keyof ChildrenOf<TParam> & PathKey]

type ValueKind = 'explicit' | 'resolved' | 'contribution'

type KindValue<TParam, TKind extends ValueKind> = TKind extends 'explicit'
  ? ExplicitValueOf<TParam>
  : TKind extends 'resolved' ? ResolvedValueOf<TParam> : ContributionOf<TParam>

type KindOfProjection<TProjection extends ReadProjection> = TProjection extends 'explicit'
  ? 'explicit'
  : TProjection extends 'defaults' ? 'contribution' : 'resolved'

// Other registrations can introduce absence at composed positions.
type AuthoringValue<TParam, TKind extends ValueKind> = [ChildrenOf<TParam>] extends [never]
  ? KindValue<TParam, TKind>
  : { [Key in keyof ChildrenOf<TParam>]?: AuthoringValue<ChildrenOf<TParam>[Key], TKind> | undefined }

type ReadonlyAuthoringValue<TParam, TKind extends ValueKind> = [ChildrenOf<TParam>] extends [never]
  ? KindValue<TParam, TKind>
  : { readonly [Key in keyof ChildrenOf<TParam>]?: ReadonlyAuthoringValue<ChildrenOf<TParam>[Key], TKind> | undefined }

/**
 * A callback input map with readonly, optional param and composed-child properties.
 *
 * Atomic values keep their exact declared types.
 *
 * @typeParam TSchema - The schema the map belongs to.
 * @typeParam TKind - Which value domain the map holds.
 */
export type PipelineView<TSchema extends QueryStateSchema, TKind extends ValueKind> = {
  readonly [Key in keyof TSchema]?: ReadonlyAuthoringValue<TSchema[Key], TKind> | undefined
}

type PipelineMap<TSchema extends QueryStateSchema, TKind extends ValueKind> = {
  [Key in keyof TSchema]?: AuthoringValue<TSchema[Key], TKind> | undefined
}

type Head<TPaths> = TPaths extends readonly [infer THead extends PathKey, ...unknown[]] ? THead : never

type Tails<TPaths, TKey> = TPaths extends readonly [TKey, ...infer TTail extends readonly PathKey[]] ? TTail : never

// Apply overlapping paths in a single traversal.
type PathTrie<TPaths> = {
  [Key in Head<TPaths>]: {
    end: [] extends Tails<TPaths, Key> ? true : false
    kids: PathTrie<Tails<TPaths, Key>>
  }
}

type Trie = Record<string, { end: boolean, kids: Trie }>

type RequireTrie<TValue, TTrie extends Trie> = TValue extends object
  ? Simplify<
    { [Key in keyof TValue as Key extends keyof TTrie ? never : Key]: TValue[Key] }
    & { [Key in keyof TValue & keyof TTrie]-?: RequireNested<TValue[Key], TTrie[Key]> }
  >
  : TValue

type RequireNested<TValue, TNode extends { end: boolean, kids: Trie }> = TNode['end'] extends true
  ? Exclude<RequireTrie<TValue, TNode['kids']>, undefined>
  : RequireTrie<TValue, TNode['kids']>

type OptionalTrie<TValue, TTrie extends Trie, TTop extends boolean> = TValue extends object
  ? Simplify<
    { [Key in keyof TValue as Key extends keyof TTrie ? never : Key]: TValue[Key] }
    & (TTop extends true
      ? { [Key in keyof TValue & keyof TTrie]: OptionalNested<TValue[Key], TTrie[Key]> }
      : { [Key in keyof TValue & keyof TTrie]?: OptionalNested<TValue[Key], TTrie[Key]> })
  >
  : TValue

type OptionalNested<TValue, TNode extends { end: boolean, kids: Trie }> = TNode['end'] extends true
  ? OptionalTrie<TValue, TNode['kids'], false> | undefined
  : OptionalTrie<TValue, TNode['kids'], false>

type NonEmpty<TPaths> = [TPaths] extends [never] ? false : true

// Require children only while their parent is defined.
type ApplyRequiredPaths<TValue, TPaths> = NonEmpty<TPaths> extends true
  ? RequireTrie<TValue, PathTrie<TPaths> extends infer TTrie extends Trie ? TTrie : never>
  : TValue

type ApplyOptionalPaths<TValue, TPaths> = NonEmpty<TPaths> extends true
  ? OptionalTrie<TValue, PathTrie<TPaths> extends infer TTrie extends Trie ? TTrie : never, true>
  : TValue

type MembersOf<TList> = TList extends readonly (infer TPath)[] ? TPath : never

// Widened lists cannot establish guaranteed paths.
type LiteralMembersOf<TList> = TList extends readonly unknown[]
  ? number extends TList['length'] ? never : TList[number]
  : never

type EveryAlternative<TPath, TList> = TList extends unknown
  ? TPath extends LiteralMembersOf<TList> ? true : false
  : never

type CommonPaths<TList> = MembersOf<TList> extends infer TPath
  ? TPath extends unknown
    ? [EveryAlternative<TPath, TList>] extends [true] ? TPath : never
    : never
  : never

/**
 * A pipeline callback descriptor with its stage, projection and presence effects.
 *
 * @typeParam TStage - The pipeline stage.
 * @typeParam TProjection - The read projection, or `undefined` for a write.
 * @typeParam TOptional - The paths where the callback can introduce absence.
 * @typeParam TRequired - The paths the callback defines.
 * @typeParam TEnforce - The execution band.
 */
export interface PipelineDescriptor<
  TStage extends 'read' | 'write' = 'read' | 'write',
  TProjection extends ReadProjection | undefined = ReadProjection | undefined,
  TOptional extends readonly unknown[] = readonly unknown[],
  TRequired extends readonly unknown[] = readonly unknown[],
  TEnforce extends Enforce = Enforce,
> {
  readonly stage: TStage
  readonly projection: TProjection
  readonly optional: TOptional
  readonly required: TRequired
  readonly enforce: TEnforce
  /** The value transformation declared by the descriptor. */
  readonly callback: (values: any, context: any) => any
}

/** A descriptor with unspecified stage, projection and presence types. */
export type AnyPipelineDescriptor = PipelineDescriptor<any, any, any, any, any>

type BandOf<TDescriptor> = TDescriptor extends { readonly enforce: infer TBand } ? TBand : 'default'

type PossibleInBand<TDescriptor, TBand extends Enforce> = TDescriptor extends unknown
  ? TBand extends BandOf<TDescriptor> ? TDescriptor : never
  : never

type PossibleBandList<TDescriptor, TBand extends Enforce> = [PossibleInBand<TDescriptor, TBand>] extends [never]
  ? []
  : PossibleInBand<TDescriptor, TBand>[]

type InBand<TList extends readonly unknown[], TBand extends Enforce, TCollected extends readonly unknown[] = []> = TList extends readonly []
  ? TCollected
  : TList extends readonly [infer THead, ...infer TTail]
    ? InBand<TTail, TBand, [...TCollected, ...([BandOf<THead>] extends [TBand] ? [THead] : PossibleBandList<THead, TBand>)]>
    : TList extends readonly [...infer TInit, infer TLast]
      ? [BandOf<TLast>] extends [TBand]
          ? [...InBand<TInit, TBand, TCollected>, TLast]
          : [...InBand<TInit, TBand, TCollected>, ...PossibleBandList<TLast, TBand>]
      : [...TCollected, ...PossibleBandList<TList[number], TBand>]

/**
 * The execution order of descriptors: `pre`, `default`, `post`, then installation order.
 *
 * @typeParam TDescriptors - The descriptors in installation order.
 */
export type OrderedPipelineDescriptors<TDescriptors extends readonly unknown[]> = [
  ...InBand<TDescriptors, 'pre'>,
  ...InBand<TDescriptors, 'default'>,
  ...InBand<TDescriptors, 'post'>,
]

type ApplyDescriptor<TValue, TDescriptor> = TDescriptor extends {
  readonly stage: 'read'
  readonly projection: infer TProjection
  readonly optional: infer TOptional
  readonly required: infer TRequired
}
  ? ApplyRequiredPaths<
    ApplyOptionalPaths<TValue, 'resolved' extends TProjection ? MembersOf<TOptional> : never>,
    [TProjection] extends ['resolved'] ? CommonPaths<TRequired> : never
  >
  : TValue

type PossibleOptionalPaths<TDescriptor> = TDescriptor extends {
  readonly stage: infer TStage
  readonly projection: infer TProjection
  readonly optional: infer TOptional
}
  ? 'read' extends TStage
    ? 'resolved' extends TProjection ? MembersOf<TOptional> : never
    : never
  : never

type FoldDescriptors<TValue, TList extends readonly unknown[]> = TList extends readonly []
  ? TValue
  : TList extends readonly [infer THead, ...infer TTail]
    ? FoldDescriptors<ApplyDescriptor<TValue, THead>, TTail>
    : TList extends readonly [...infer TInit, infer TLast]
      ? ApplyDescriptor<FoldDescriptors<TValue, TInit>, TLast>
      : ApplyOptionalPaths<TValue, PossibleOptionalPaths<TList[number]>>

/**
 * Applies the presence effects of descriptors to a base read, in execution order.
 *
 * Optional effects weaken presence, required effects strengthen it, and a later effect
 * wins. Only descriptors of the resolved projection affect the result. A conditional
 * declaration guarantees the paths every alternative names, and a widened list guarantees
 * nothing while still admitting absence.
 *
 * @typeParam TBase - The read map before the descriptors.
 * @typeParam TDescriptors - The descriptors in installation order.
 */
export type ApplyPipelineEffects<TBase, TDescriptors extends readonly unknown[]>
  = FoldDescriptors<TBase, OrderedPipelineDescriptors<TDescriptors>>

// Contexts

/** The write request supplied before pipeline transformations. */
export interface PipelineWriteRequest<TSchema extends QueryStateSchema> {
  readonly mode: 'patch' | 'replace'
  readonly values: PipelineView<TSchema, 'explicit'>
  readonly origin?: symbol
  readonly navigation?: Readonly<NavigateOptions>
  readonly defaultPolicy?: 'binding' | 'preserve-explicit'
}

/**
 * The context supplied to a read callback.
 *
 * @typeParam TSchema - The schema of the binding.
 * @typeParam TProjection - The value map being processed.
 */
export interface PipelineReadContext<TSchema extends QueryStateSchema, TProjection extends ReadProjection> {
  readonly stage: 'read'
  readonly schema: Readonly<TSchema>
  readonly query: Readonly<ParsedQuery>
  readonly projection: TProjection
}

/**
 * The context supplied to a write callback.
 *
 * @typeParam TSchema - The schema of the binding.
 */
export interface PipelineWriteContext<TSchema extends QueryStateSchema> {
  readonly stage: 'write'
  readonly schema: Readonly<TSchema>
  readonly query: Readonly<ParsedQuery>
  readonly request: PipelineWriteRequest<TSchema>
}

type PipelineOutput<TSchema extends QueryStateSchema, TKind extends ValueKind, TRequired>
  = ApplyRequiredPaths<PipelineMap<TSchema, TKind>, MembersOf<TRequired>>

/** Presence effects declared by a descriptor. */
export interface PipelinePresence<TOptional extends readonly unknown[], TRequired extends readonly unknown[]> {
  /** Paths where the callback can introduce absence. */
  optional?: TOptional
  /** Paths the callback defines whenever their parent is present. */
  required?: TRequired
}

/** Options for a read descriptor. */
export interface PipelineReadOptions<
  TProjection extends ReadProjection,
  TOptional extends readonly unknown[],
  TRequired extends readonly unknown[],
  TEnforce extends Enforce,
> {
  /** The read projection the callback processes. */
  projection: TProjection
  presence?: PipelinePresence<TOptional, TRequired>
  /**
   * Execution band within the read stage.
   *
   * @default 'default'
   */
  enforce?: TEnforce
}

/** Options for a write descriptor. */
export interface PipelineWriteOptions<
  TOptional extends readonly unknown[],
  TRequired extends readonly unknown[],
  TEnforce extends Enforce,
> {
  presence?: PipelinePresence<TOptional, TRequired>
  /**
   * Execution band within the write stage.
   *
   * @default 'default'
   */
  enforce?: TEnforce
}

/**
 * Declares value transformations contributed by a module.
 *
 * The module contributes descriptors through its `pipeline` result.
 *
 * @typeParam TSchema - The schema of the binding.
 */
export interface QueryPipelineBus<TSchema extends QueryStateSchema = QueryStateSchema> {
  /**
   * Describes a synchronous value transformation without executing it.
   *
   * Callbacks must be pure. Return the input unchanged or a new map that
   * replaces the containers it changes. Absence can be introduced only at the paths
   * declared optional. Required paths must be defined whenever their parent is present.
   *
   * @returns The descriptor, typed with its presence effects.
   */
  define: {
    <
      TProjection extends ReadProjection,
      const TOptional extends readonly PipelinePath<TSchema>[] = readonly [],
      const TRequired extends readonly PipelinePath<TSchema>[] = readonly [],
      TEnforce extends Enforce = 'default',
    >(
      stage: 'read',
      callback: (
        values: PipelineView<TSchema, KindOfProjection<TProjection>>,
        context: PipelineReadContext<TSchema, TProjection>,
      ) => PipelineOutput<TSchema, KindOfProjection<TProjection>, NoInfer<TRequired>>,
      options: PipelineReadOptions<TProjection, TOptional, TRequired, TEnforce>,
    ): NoInfer<PipelineDescriptor<'read', TProjection, TOptional, TRequired, TEnforce>>
    <
      const TOptional extends readonly PipelinePath<TSchema>[] = readonly [],
      const TRequired extends readonly PipelinePath<TSchema>[] = readonly [],
      TEnforce extends Enforce = 'default',
    >(
      stage: 'write',
      callback: (
        values: PipelineView<TSchema, 'explicit'>,
        context: PipelineWriteContext<TSchema>,
      ) => PipelineOutput<TSchema, 'explicit', NoInfer<TRequired>>,
      options?: PipelineWriteOptions<TOptional, TRequired, TEnforce>,
    ): NoInfer<PipelineDescriptor<'write', undefined, TOptional, TRequired, TEnforce>>
  }
}

/** The module and registration a descriptor is installed for. */
export interface PipelineOwner {
  readonly moduleName?: string
  readonly installationId: number
  readonly registrationId: number
}
