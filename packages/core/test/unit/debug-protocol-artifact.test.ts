import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const coreDir = resolve(import.meta.dirname, '../..')
let workspace: string

describe('published @vuqs/core entrypoints', () => {
  beforeAll(() => {
    // Always build so a stale dist cannot hide changes in the source under test.
    execFileSync('pnpm', ['build'], { cwd: coreDir, stdio: 'ignore' })

    workspace = mkdtempSync(join(tmpdir(), 'vuqs-protocol-'))
    mkdirSync(join(workspace, 'node_modules', '@vuqs'), { recursive: true })
    symlinkSync(coreDir, join(workspace, 'node_modules', '@vuqs', 'core'), 'dir')
    symlinkSync(join(coreDir, 'node_modules', 'vue'), join(workspace, 'node_modules', 'vue'), 'dir')
    mkdirSync(join(workspace, 'node_modules', '@standard-schema'), { recursive: true })
    symlinkSync(join(coreDir, 'node_modules', '@standard-schema', 'spec'), join(workspace, 'node_modules', '@standard-schema', 'spec'), 'dir')

    for (const file of ['consumer.ts', 'runtime.mjs']) {
      copyFileSync(join(coreDir, 'test', 'fixtures', 'published', file), join(workspace, file))
    }

    writeFileSync(join(workspace, 'tsconfig.json'), JSON.stringify({
      compilerOptions: {
        module: 'esnext',
        moduleResolution: 'bundler',
        target: 'esnext',
        strict: true,
        noEmit: true,
        skipLibCheck: false,
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

  it('preserves module and codec inference through package exports', () => {
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

  it('shares runtime state across published entrypoints', () => {
    expect(() => execFileSync(process.execPath, [join(workspace, 'runtime.mjs')], {
      cwd: workspace,
      stdio: 'pipe',
      encoding: 'utf8',
    })).not.toThrow()
  })

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
