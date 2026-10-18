import type { AnyDefinedQueryParam } from '../../schema/params/definition'
import type { QueryStateSchema } from '../../schema/schema'
import type { AnyPipelineDescriptor, PipelineOwner, QueryPipelineStage, ReadProjection } from './contract'
import { getParamStructure } from '../../schema/params/definition'

interface PresenceContext {
  stage: QueryPipelineStage
  projection?: ReadProjection
}

interface PresenceStep {
  descriptor: AnyPipelineDescriptor
  owner: PipelineOwner
  index: number
  input: unknown
  output: unknown
}

interface PresenceRun {
  verify: (step: PresenceStep) => void
}

interface PresenceValidation {
  validate: (descriptor: AnyPipelineDescriptor) => void
  beginRun: (context: PresenceContext) => PresenceRun
}

interface Node {
  readonly children?: ReadonlyMap<string, Node>
  readonly guaranteed: boolean
}

/**
 * Validates declared paths and verifies sequential presence effects against a schema.
 *
 * @param schema - The schema to check.
 * @returns A validator whose `beginRun` creates independent verification state for each evaluation.
 *
 * @internal
 */
export function createPresenceValidation(schema: QueryStateSchema): PresenceValidation {
  const tree = buildTree(schema)
  const baseGuarantees = collectGuarantees(tree)

  return {
    validate: (descriptor) => {
      validatePresence(tree, descriptor)
    },
    beginRun: ({ stage, projection }) => {
      const effective = new Set(projection === 'resolved' ? baseGuarantees : [])
      const declared = new Set<string>()

      return {
        verify: (step) => {
          verify({ ...step, tree, stage, projection, effective, declared })
        },
      }
    },
  }
}

// Presence paths

function buildTree(schema: QueryStateSchema): ReadonlyMap<string, Node> {
  const nodes = new Map<string, Node>()

  for (const key of Object.keys(schema)) {
    nodes.set(key, buildNode(schema[key]))
  }

  return nodes
}

function buildNode(param: AnyDefinedQueryParam): Node {
  const structure = getParamStructure(param)
  const children = structure?.children

  if (children === undefined) {
    return { guaranteed: structure?.staticCandidate?.value !== undefined }
  }

  const nodes = new Map<string, Node>()
  for (const key of Object.keys(children)) {
    nodes.set(key, buildNode(children[key]))
  }

  const guaranteed = param.presenceGated !== true
    && (structure?.staticCandidate?.direct === true || [...nodes.values()].some(node => node.guaranteed))

  return { children: nodes, guaranteed }
}

function collectGuarantees(tree: ReadonlyMap<string, Node>, prefix: string[] = [], found = new Set<string>()): Set<string> {
  for (const [key, node] of tree) {
    const path = [...prefix, key]

    if (node.guaranteed) {
      found.add(JSON.stringify(path))
    }

    if (node.children !== undefined) {
      collectGuarantees(node.children, path, found)
    }
  }

  return found
}

function validatePresence(tree: ReadonlyMap<string, Node>, descriptor: AnyPipelineDescriptor): void {
  const optional = new Set<string>()

  for (const path of descriptor.optional as readonly string[][]) {
    assertPath(tree, path)
    optional.add(JSON.stringify(path))
  }

  for (const path of descriptor.required as readonly string[][]) {
    assertPath(tree, path)

    if (optional.has(JSON.stringify(path))) {
      throw new Error(`[vuqs] presence path ${JSON.stringify(path)} is both optional and required.`)
    }
  }
}

function assertPath(tree: ReadonlyMap<string, Node>, path: readonly string[]): void {
  let nodes: ReadonlyMap<string, Node> | undefined = tree

  for (const [index, key] of path.entries()) {
    const node: Node | undefined = nodes?.get(key)

    if (node === undefined) {
      throw new Error(`[vuqs] presence path ${JSON.stringify(path)} does not address a schema param or declared child.`)
    }

    nodes = node.children

    if (index < path.length - 1 && nodes === undefined) {
      throw new Error(`[vuqs] presence path ${JSON.stringify(path)} enters an atomic param, whose internals are not addressable.`)
    }
  }
}

// Result verification

interface Verification {
  tree: ReadonlyMap<string, Node>
  descriptor: AnyPipelineDescriptor
  owner: PipelineOwner
  index: number
  stage: 'read' | 'write'
  projection: ReadProjection | undefined
  input: unknown
  output: unknown
  // Effective presence: the builder guarantees plus every effect so far, in order.
  effective: Set<string>
  // Paths a descriptor declared required, which bind even when the input already lacked them.
  declared: Set<string>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function verify(check: Verification): void {
  const { descriptor, output, effective, declared } = check
  const optional = new Set((descriptor.optional as readonly string[][]).map(path => JSON.stringify(path)))

  for (const key of optional) {
    effective.delete(key)
    declared.delete(key)
  }
  for (const path of descriptor.required as readonly string[][]) {
    const key = JSON.stringify(path)
    effective.add(key)
    declared.add(key)
  }

  if (!isRecord(output)) {
    throw violation(check, [], 'returned a value that is not a map')
  }

  verifyLevel(check, check.tree, [], isRecord(check.input) ? check.input : undefined, output, optional, false)
}

function verifyLevel(
  check: Verification,
  nodes: ReadonlyMap<string, Node>,
  prefix: string[],
  input: Record<string, unknown> | undefined,
  output: Record<string, unknown>,
  optional: ReadonlySet<string>,
  introduced: boolean,
): void {
  for (const [key, node] of nodes) {
    const path = [...prefix, key]
    const id = JSON.stringify(path)
    const before = input?.[key]
    const after = output[key]

    if (after === undefined) {
      if (before !== undefined && !optional.has(id)) {
        throw violation(check, path, 'removed it without an optional permission')
      }

      if (before === undefined && (check.declared.has(id) || (introduced && check.effective.has(id)))) {
        throw violation(check, path, 'did not define it')
      }

      continue
    }

    if (node.children !== undefined) {
      if (!isRecord(after)) {
        throw violation(check, path, 'returned a composed value that is not an object')
      }

      verifyLevel(check, node.children, path, isRecord(before) ? before : undefined, after, optional, before === undefined)
    }
  }
}

function violation(check: Verification, path: readonly string[], reason: string): Error {
  const where = check.stage === 'read' ? `read/${check.projection}` : 'write'

  const { moduleName, installationId, registrationId } = check.owner
  const owner = ` (module ${moduleName === undefined ? '' : `"${moduleName}", `}installation #${installationId}, registration #${registrationId})`

  return new Error(`[vuqs] pipeline ${where} descriptor #${check.index}${owner} ${reason}${path.length > 0 ? `: ${JSON.stringify(path)}` : ''}.`)
}
