import { describe, expect, it } from 'vitest'
import { PUBLIC_DEMO_POLICY } from '../src/domain/demo-policy'
import { generateFiles } from '../src/domain/generators'
import type { ArchitectureGraph } from '../src/domain/architecture'
import type { VisualOperation } from '../src/domain/operations'

// Regression suite: each test here pins a defect that previously shipped and was
// caught during the hardening pass. Keep this file append-only for future fixes so
// a fixed bug never silently comes back.
describe('regression: previously shipped defects stay fixed', () => {
  it('[REG-1] the public demo policy must stay read-only, not grant every capability', () => {
    // PUBLIC_DEMO_POLICY once shipped with every capability set to true, which would let
    // the public demo import folders/GitHub repos, edit and save source, move pieces and
    // run host processes -- defeating the point of a public read-only demo.
    expect(PUBLIC_DEMO_POLICY.canImportFolder).toBe(false)
    expect(PUBLIC_DEMO_POLICY.canImportGitHub).toBe(false)
    expect(PUBLIC_DEMO_POLICY.canEditSource).toBe(false)
    expect(PUBLIC_DEMO_POLICY.canSaveSource).toBe(false)
    expect(PUBLIC_DEMO_POLICY.canMoveNodes).toBe(false)
    expect(PUBLIC_DEMO_POLICY.canRunProcesses).toBe(false)
    expect(PUBLIC_DEMO_POLICY.canReadBundledExample).toBe(true)
  })

  it('[REG-2] generated connect imports strip the source file extension', () => {
    // generateFiles used an over-escaped regex (`/\\.(tsx?|jsx?|py)$/`, a literal backslash
    // followed by any character) to strip the source extension from a connect operation's
    // import path. It never matched, so generated imports kept the file extension
    // (e.g. `import Source from './domain/Source.ts'`), which is invalid ESM/CJS syntax.
    const target = { id: 'target', path: 'domain/Target.ts', name: 'Target', layer: 'domain' as const, kind: 'service' as const, x: 0, z: 0 }
    const source = { id: 'source', path: 'domain/Source.ts', name: 'Source', layer: 'domain' as const, kind: 'repository' as const, x: 0, z: 0 }
    const graph: ArchitectureGraph = { nodes: [target, source], edges: [] }
    const operations: VisualOperation[] = [
      { type: 'create', node: target },
      { type: 'connect', edge: { from: 'source', to: 'target', type: 'depends' } },
    ]
    const files = generateFiles(graph, operations, 'TypeScript')
    const targetFile = files.find((file) => file.path === 'domain/Target.ts')!
    expect(targetFile.content).toContain("import Source from './domain/Source'")
    expect(targetFile.content).not.toContain('.ts\'')
  })
})
