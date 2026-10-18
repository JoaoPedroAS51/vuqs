import type { ParsedQuery } from '../../../src/core/query/types'
import { useQueryStates } from '../../../src/core/bindings/use-query-states'
import { codecs } from '../../../src/core/codecs/catalog'
import { queryParam } from '../../../src/core/schema/params/query-param'
import { withRuntimeDefaults } from '../../../src/modules/runtime-defaults'
import { withTestQuery } from '../../helpers/adapter'

// Bounded case data, real-param construction and an independent expected-value oracle for the
// three approved default-resolution families. The oracle consumes case data only: it never calls
// production composition/resolution helpers or reads values from the built params.

export type UrlState = 'absent' | 'valid' | 'invalid'
export type Supply = 'none' | 'partial' | 'full'

export interface Outcome {
  explicit: unknown
  resolved: unknown
}

type Plain = Record<string, unknown>

const URL_VALUES = { a: 30, b: 31, x: 30, y: 31, z: 32 } as const

// Flat family

export interface FlatCase {
  label: string
  urls: [UrlState, UrlState]
  statics: [boolean, boolean]
  own: 'none' | 'partial'
  gated: boolean
  runtime: Supply
}

const FLAT_STATIC = { a: 1, b: 2 }
const FLAT_OWN: Plain = { a: 10 }
const FLAT_RUNTIME: Record<Supply, Plain | undefined> = {
  none: undefined,
  partial: { a: 20 },
  full: { a: 20, b: 21 },
}

export function flatCases(): FlatCase[] {
  const cases: FlatCase[] = []
  const urlStates: UrlState[] = ['absent', 'valid', 'invalid']
  const bools = [false, true]
  const supplies: Supply[] = ['none', 'partial', 'full']

  for (const a of urlStates) {
    for (const b of urlStates) {
      for (const sa of bools) {
        for (const sb of bools) {
          for (const own of ['none', 'partial'] as const) {
            for (const gated of bools) {
              for (const runtime of supplies) {
                cases.push({
                  label: `urls=[${a},${b}] statics=[${flag(sa)},${flag(sb)}] own=${own} gate=${flag(gated)} runtime=${runtime}`,
                  urls: [a, b],
                  statics: [sa, sb],
                  own,
                  gated,
                  runtime,
                })
              }
            }
          }
        }
      }
    }
  }

  return cases
}

export function runFlat(c: FlatCase): Outcome {
  const a = queryParam('a', c.statics[0] ? codecs.integer.withDefault(FLAT_STATIC.a) : codecs.integer)
  const b = queryParam('b', c.statics[1] ? codecs.integer.withDefault(FLAT_STATIC.b) : codecs.integer)
  let record: any = queryParam.object('record', { a, b })

  if (c.own === 'partial') {
    record = record.withDefault(FLAT_OWN)
  }
  if (c.gated) {
    record = record.withDefaultsWhenPresent()
  }

  const query: ParsedQuery = {}
  const urlLeaves: Plain = {}
  if (c.urls[0] !== 'absent') {
    urlLeaves.a = c.urls[0] === 'valid' ? String(URL_VALUES.a) : 'bad'
  }
  if (c.urls[1] !== 'absent') {
    urlLeaves.b = c.urls[1] === 'valid' ? String(URL_VALUES.b) : 'bad'
  }
  if (Object.keys(urlLeaves).length > 0) {
    query.record = urlLeaves as ParsedQuery[string]
  }

  return run({ record }, 'record', query, FLAT_RUNTIME[c.runtime])
}

export function expectFlat(c: FlatCase): Outcome {
  const explicitLeaves: Plain = {}
  if (c.urls[0] === 'valid') {
    explicitLeaves.a = URL_VALUES.a
  }
  if (c.urls[1] === 'valid') {
    explicitLeaves.b = URL_VALUES.b
  }
  const present = Object.keys(explicitLeaves).length > 0
  const explicit = present ? explicitLeaves : undefined

  if (c.gated && !present) {
    return { explicit, resolved: undefined }
  }

  const runtime = FLAT_RUNTIME[c.runtime]
  const own = c.own === 'partial' ? FLAT_OWN : undefined
  const statics = [c.statics[0] ? FLAT_STATIC.a : undefined, c.statics[1] ? FLAT_STATIC.b : undefined]
  const resolved: Plain = {}

  for (const [index, key] of (['a', 'b'] as const).entries()) {
    const value = explicitLeaves[key] ?? runtime?.[key] ?? own?.[key] ?? statics[index]
    if (value !== undefined) {
      resolved[key] = value
    }
  }

  const direct = own !== undefined || runtime !== undefined
  const defined = present || direct || Object.keys(resolved).length > 0

  return { explicit, resolved: defined ? resolved : undefined }
}

// Nested family

export interface NestedCase {
  label: string
  urls: [boolean, boolean, boolean]
  statics: [boolean, boolean, boolean]
  rootOwn: boolean
  innerOwn: boolean
  rootGated: boolean
  innerGated: boolean
  runtime: Supply
}

const NESTED_STATIC = { x: 1, y: 2, z: 3 }
const NESTED_ROOT_OWN = { x: 100, inner: { y: 101 } }
const NESTED_INNER_OWN = { y: 110, z: 111 }
const NESTED_RUNTIME: Record<Supply, Plain | undefined> = {
  none: undefined,
  // Omits the defaultable grandchild `z`.
  partial: { x: 200, inner: { y: 201 } },
  full: { x: 200, inner: { y: 201, z: 202 } },
}

export function nestedCases(): NestedCase[] {
  const cases: NestedCase[] = []
  const bools = [false, true]
  const supplies: Supply[] = ['none', 'partial', 'full']

  for (const ux of bools) {
    for (const uy of bools) {
      for (const uz of bools) {
        for (const sx of bools) {
          for (const sy of bools) {
            for (const sz of bools) {
              for (const rootOwn of bools) {
                for (const innerOwn of bools) {
                  for (const rootGated of bools) {
                    for (const innerGated of bools) {
                      for (const runtime of supplies) {
                        cases.push({
                          label: `urls=[${flag(ux)},${flag(uy)},${flag(uz)}] statics=[${flag(sx)},${flag(sy)},${flag(sz)}] own=[root:${flag(rootOwn)},inner:${flag(innerOwn)}] gate=[root:${flag(rootGated)},inner:${flag(innerGated)}] runtime=${runtime}`,
                          urls: [ux, uy, uz],
                          statics: [sx, sy, sz],
                          rootOwn,
                          innerOwn,
                          rootGated,
                          innerGated,
                          runtime,
                        })
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }

  return cases
}

export function runNested(c: NestedCase): Outcome {
  const x = queryParam('x', c.statics[0] ? codecs.integer.withDefault(NESTED_STATIC.x) : codecs.integer)
  const y = queryParam('y', c.statics[1] ? codecs.integer.withDefault(NESTED_STATIC.y) : codecs.integer)
  const z = queryParam('z', c.statics[2] ? codecs.integer.withDefault(NESTED_STATIC.z) : codecs.integer)
  let inner: any = queryParam.object('inner', { y, z })

  if (c.innerOwn) {
    inner = inner.withDefault(NESTED_INNER_OWN)
  }
  if (c.innerGated) {
    inner = inner.withDefaultsWhenPresent()
  }

  let root: any = queryParam.object('root', { x, inner })

  if (c.rootOwn) {
    root = root.withDefault(NESTED_ROOT_OWN)
  }
  if (c.rootGated) {
    root = root.withDefaultsWhenPresent()
  }

  const innerUrl: Plain = {}
  const rootUrl: Plain = {}
  if (c.urls[0]) {
    rootUrl.x = String(URL_VALUES.x)
  }
  if (c.urls[1]) {
    innerUrl.y = String(URL_VALUES.y)
  }
  if (c.urls[2]) {
    innerUrl.z = String(URL_VALUES.z)
  }
  if (Object.keys(innerUrl).length > 0) {
    rootUrl.inner = innerUrl
  }
  const query: ParsedQuery = Object.keys(rootUrl).length > 0 ? { root: rootUrl as ParsedQuery[string] } : {}

  return run({ root }, 'root', query, NESTED_RUNTIME[c.runtime])
}

export function expectNested(c: NestedCase): Outcome {
  const runtime = NESTED_RUNTIME[c.runtime]
  const runtimeInner = runtime?.inner as Plain | undefined
  const rootOwn = c.rootOwn ? NESTED_ROOT_OWN : undefined
  const rootOwnInner = rootOwn?.inner as Plain | undefined
  const innerOwn = c.innerOwn ? NESTED_INNER_OWN : undefined
  const statics: Plain = {
    x: c.statics[0] ? NESTED_STATIC.x : undefined,
    y: c.statics[1] ? NESTED_STATIC.y : undefined,
    z: c.statics[2] ? NESTED_STATIC.z : undefined,
  }
  const explicit: Record<'x' | 'y' | 'z', number | undefined> = {
    x: c.urls[0] ? URL_VALUES.x : undefined,
    y: c.urls[1] ? URL_VALUES.y : undefined,
    z: c.urls[2] ? URL_VALUES.z : undefined,
  }

  // Highest precedence first: runtime, the enclosing object, the inner object, the param.
  const innerCandidate = (key: 'y' | 'z'): unknown =>
    runtimeInner?.[key] ?? rootOwnInner?.[key] ?? innerOwn?.[key] ?? statics[key]
  const rootCandidate = (): unknown => runtime?.x ?? rootOwn?.x ?? statics.x

  const innerExplicit: Plain = {}
  for (const key of ['y', 'z'] as const) {
    if (explicit[key] !== undefined) {
      innerExplicit[key] = explicit[key]
    }
  }
  const innerPresent = Object.keys(innerExplicit).length > 0
  const rootPresent = explicit.x !== undefined || innerPresent

  const explicitRoot: Plain = {}
  if (explicit.x !== undefined) {
    explicitRoot.x = explicit.x
  }
  if (innerPresent) {
    explicitRoot.inner = innerExplicit
  }

  let resolvedInner: Plain | undefined
  if (!(c.innerGated && !innerPresent)) {
    const value: Plain = {}
    for (const key of ['y', 'z'] as const) {
      const leaf = explicit[key] ?? innerCandidate(key)
      if (leaf !== undefined) {
        value[key] = leaf
      }
    }
    const innerDirect = rootOwn !== undefined || innerOwn !== undefined || runtimeInner !== undefined
    if (innerPresent || innerDirect || Object.keys(value).length > 0) {
      resolvedInner = value
    }
  }

  let resolvedRoot: Plain | undefined
  if (!(c.rootGated && !rootPresent)) {
    const value: Plain = {}
    const x = explicit.x ?? rootCandidate()
    if (x !== undefined) {
      value.x = x
    }
    if (resolvedInner !== undefined) {
      value.inner = resolvedInner
    }
    const rootDirect = rootOwn !== undefined || runtime !== undefined
    if (rootPresent || rootDirect || Object.keys(value).length > 0) {
      resolvedRoot = value
    }
  }

  return { explicit: rootPresent ? explicitRoot : undefined, resolved: resolvedRoot }
}

// Identity-transform family

export interface IdentityCase {
  label: string
  urls: [UrlState, UrlState]
  statics: [boolean, boolean]
  runtime: 'none' | 'full'
}

const IDENTITY_STATIC = { a: 1, b: 2 }
const IDENTITY_RUNTIME = { a: 20, b: 21 }

export function identityCases(): IdentityCase[] {
  const cases: IdentityCase[] = []
  const urlStates: UrlState[] = ['absent', 'valid', 'invalid']
  const bools = [false, true]

  for (const a of urlStates) {
    for (const b of urlStates) {
      for (const sa of bools) {
        for (const sb of bools) {
          for (const runtime of ['none', 'full'] as const) {
            cases.push({
              label: `urls=[${a},${b}] statics=[${flag(sa)},${flag(sb)}] runtime=${runtime}`,
              urls: [a, b],
              statics: [sa, sb],
              runtime,
            })
          }
        }
      }
    }
  }

  return cases
}

export function runIdentity(c: IdentityCase): Outcome {
  const a = queryParam('a', c.statics[0] ? codecs.integer.withDefault(IDENTITY_STATIC.a) : codecs.integer)
  const b = queryParam('b', c.statics[1] ? codecs.integer.withDefault(IDENTITY_STATIC.b) : codecs.integer)
  const record: any = queryParam.object('record', { a, b }).transform({
    read: (value: any) => value,
    write: (value: any) => value,
  })

  const leaves: Plain = {}
  if (c.urls[0] !== 'absent') {
    leaves.a = c.urls[0] === 'valid' ? String(URL_VALUES.a) : 'bad'
  }
  if (c.urls[1] !== 'absent') {
    leaves.b = c.urls[1] === 'valid' ? String(URL_VALUES.b) : 'bad'
  }
  const query: ParsedQuery = Object.keys(leaves).length > 0 ? { record: leaves as ParsedQuery[string] } : {}

  return run({ record }, 'record', query, c.runtime === 'full' ? IDENTITY_RUNTIME : undefined)
}

export function expectIdentity(c: IdentityCase): Outcome {
  const validA = c.urls[0] === 'valid'
  const validB = c.urls[1] === 'valid'
  const staticA = c.statics[0] ? IDENTITY_STATIC.a : undefined
  const staticB = c.statics[1] ? IDENTITY_STATIC.b : undefined

  if (validA || validB) {
    // The transform input resolves static defaults only, and the output wins as a whole.
    const output: Plain = {}
    const a = validA ? URL_VALUES.a : staticA
    const b = validB ? URL_VALUES.b : staticB
    if (a !== undefined) {
      output.a = a
    }
    if (b !== undefined) {
      output.b = b
    }

    return { explicit: output, resolved: output }
  }

  if (c.runtime === 'full') {
    return { explicit: undefined, resolved: IDENTITY_RUNTIME }
  }

  const derived: Plain = {}
  if (staticA !== undefined) {
    derived.a = staticA
  }
  if (staticB !== undefined) {
    derived.b = staticB
  }

  return { explicit: undefined, resolved: Object.keys(derived).length > 0 ? derived : undefined }
}

// Shared

function run(schema: Record<string, any>, key: string, query: ParsedQuery, runtime: Plain | undefined): Outcome {
  const test = withTestQuery(query)

  try {
    const state = test.build(() => useQueryStates(schema).use(withRuntimeDefaults()))

    if (runtime !== undefined) {
      state.setDefaults({ [key]: runtime })
    }

    return {
      explicit: (state.explicitValues as Plain)[key],
      resolved: (state.values as Plain)[key],
    }
  }
  finally {
    test.dispose()
  }
}

function flag(value: boolean): string {
  return value ? 'on' : 'off'
}
