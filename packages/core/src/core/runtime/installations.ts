import type { Ref, ShallowRef } from 'vue'
import type { QueryDefaultSource } from '../module-system/contract'
import type { AnyPipelineDescriptor, PipelineOwner } from './pipeline/contract'
import { shallowRef } from 'vue'

/** A default source one installation contributes, as one registration. */
export interface InstalledDefaultSource {
  readonly source: QueryDefaultSource
  readonly owner: PipelineOwner
}

/** A pipeline descriptor one installation contributes, as one registration. */
export interface InstalledPipelineEntry {
  readonly descriptor: AnyPipelineDescriptor
  readonly owner: PipelineOwner
}

/**
 * Everything one module installation contributes: its default sources and pipeline
 * descriptors in occurrence order, each occurrence a registration of its own.
 */
export interface InstalledContributions {
  readonly id: number
  readonly name?: string
  readonly defaults: readonly InstalledDefaultSource[]
  readonly pipeline: readonly InstalledPipelineEntry[]
}

/**
 * The active contributions of a binding.
 *
 * The snapshot holds registration membership, never resolved values: it keeps the
 * original source refs and descriptor callbacks, and an installation joins or leaves it
 * as a whole in a single assignment.
 */
export interface InstallationRegistry {
  /** The active installations in publication order. */
  readonly snapshot: Readonly<Ref<readonly InstalledContributions[]>>
  /** Activates a complete installation after the installations already active. */
  publish: (installation: InstalledContributions) => void
  /** Removes the installation with this identity; removing an absent identity changes nothing. */
  remove: (id: number) => void
}

/**
 * Creates a binding-local registry of complete module installations.
 *
 * @internal
 */
export function createInstallationRegistry(): InstallationRegistry {
  const installations: ShallowRef<readonly InstalledContributions[]> = shallowRef([])

  return {
    snapshot: installations,
    publish: (installation) => {
      installations.value = [...installations.value, installation]
    },
    remove: (id) => {
      const current = installations.value

      if (current.some(installation => installation.id === id)) {
        installations.value = current.filter(installation => installation.id !== id)
      }
    },
  }
}
