import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// Validates the published type-only subpath as a consumer would: it compiles a
// fixture that imports `@vuqs/core/debug-protocol` by package name, resolving through
// the package `exports` to `dist/debug-protocol.d.ts` (not the source alias). A dangling
// private import or a missing re-export in the emitted `.d.ts` would fail the compile.
// It is self-contained: it builds the package if `dist` is missing rather than assuming
// a prior step did.

const coreDir = resolve(import.meta.dirname, '../..')
let workspace: string

describe('published @vuqs/core/debug-protocol', () => {
  beforeAll(() => {
    // Always build so a stale dist cannot hide changes in the source under test.
    execFileSync('pnpm', ['build'], { cwd: coreDir, stdio: 'ignore' })

    workspace = mkdtempSync(join(tmpdir(), 'vuqs-protocol-'))
    mkdirSync(join(workspace, 'node_modules', '@vuqs'), { recursive: true })
    symlinkSync(coreDir, join(workspace, 'node_modules', '@vuqs', 'core'), 'dir')

    writeFileSync(join(workspace, 'consumer.ts'), [
      `import type { DebugEventCode, DebugEventMap, DebugScope, EngineSnapshot, KnownDebugEvent } from '@vuqs/core/debug-protocol'`,
      `import type { StoredDebugConfigV1 } from '@vuqs/core/debug/console'`,
      `import { createConsoleReporter, createPerformanceReporter, VUQS_DEBUG_STORAGE_KEY } from '@vuqs/core/debug/console'`,
      `export const code = 'gtq:flush' satisfies DebugEventCode`,
      `export type Events = DebugEventMap`,
      `export type Scope = DebugScope`,
      `export type Event = KnownDebugEvent`,
      `export type Snapshot = EngineSnapshot`,
      `export const consoleReporter = createConsoleReporter({ preset: 'summary' })`,
      `export const performanceReporter = createPerformanceReporter({ limit: 10 })`,
      `export const storageKey = VUQS_DEBUG_STORAGE_KEY`,
      `export const storedConfig = { version: 1, console: { enabled: true, preset: 'trace' } } satisfies StoredDebugConfigV1`,
      ``,
    ].join('\n'))

    writeFileSync(join(workspace, 'tsconfig.json'), JSON.stringify({
      compilerOptions: {
        module: 'esnext',
        moduleResolution: 'bundler',
        strict: true,
        noEmit: true,
        skipLibCheck: true,
        types: [],
      },
      files: ['consumer.ts'],
    }))
  }, 180_000)

  afterAll(() => {
    if (workspace !== undefined) {
      rmSync(workspace, { recursive: true, force: true })
    }
  })

  it('compiles a consumer that imports the subpath through package exports', () => {
    let diagnostics = ''

    try {
      execFileSync('pnpm', ['exec', 'tsc', '--noEmit', '-p', join(workspace, 'tsconfig.json')], {
        cwd: coreDir,
        stdio: 'pipe',
        encoding: 'utf8',
      })
    }
    catch (error) {
      const failure = error as { stdout?: string, stderr?: string }
      diagnostics = `${failure.stdout ?? ''}${failure.stderr ?? ''}`
    }

    expect(diagnostics, diagnostics).toBe('')
  }, 60_000)

  it('emits no runtime module for the type-only subpath', () => {
    const runtime = join(coreDir, 'dist', 'debug-protocol.mjs')

    if (existsSync(runtime)) {
      const emitted = readFileSync(runtime, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '')
        .replace(/export\s*\{\s*\}\s*;?/g, '')
        .trim()

      expect(emitted).toBe('')
    }
  })
})
