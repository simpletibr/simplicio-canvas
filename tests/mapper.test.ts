import { describe, expect, it } from 'vitest'
import { parseMapperArtifacts, slimMapperArtifacts } from '../src/domain/mapper'

const symbolIndex = {
  schema: 'simplicio.symbol-index/v1', root: '/Users/someone/private/project',
  symbols: [
    { name: 'main', qualified_name: 'app/cli.py::main', kind: 'function', language: 'python', defined_in: 'app/cli.py', line: 7, evidence: { file: 'app/cli.py', line: 7 } },
    { name: 'run', qualified_name: 'app/core.py::run', kind: 'function', language: 'python', defined_in: 'app/core.py', line: 5 },
    { name: 'Runner', qualified_name: 'app/core.py::Runner', kind: 'class', language: 'python', defined_in: 'app/core.py', line: 20 },
    { name: 'broken', kind: 'function' },
  ],
}
const edge = (over: Record<string, unknown>) => ({ type: 'calls', evidence_class: 'lexical_unique', resolution_status: 'resolved', provenance: { method: 'x', candidates: ['a'] }, relation_id: 'abc', ...over })
const callGraph = {
  schema: 'simplicio.call-graph/v1',
  edges: [
    edge({ source_file: 'app/cli.py', source_symbol: 'app/cli.py::main', target_file: 'app/core.py', target_symbol: 'app/core.py::run', line: 13, target_candidates: ['app/core.py::run'] }),
    edge({ source_file: 'app/cli.py', source_symbol: 'app/cli.py::main', target_file: 'app/cli.py', target_symbol: 'app/cli.py::main', line: 19 }),
    edge({ source_file: 'app/core.py', source_symbol: 'app/core.py::run', target_file: 'app/cli.py', target_symbol: 'app/cli.py::main', line: 9, resolution_status: 'ambiguous', evidence_class: 'lexical_ambiguous', target_candidates: ['app/cli.py::main', 'hooks/x.py::main'] }),
    { type: 'imports', source_file: 'app/cli.py', target_file: 'app/core.py', import: 'app.core', resolution_status: 'resolved', provenance: {} },
    { type: 'imports', source_file: 'app/cli.py', import: 'argparse', resolution_status: 'unresolved' },
    { type: 'weird', source_file: 'x' },
    'not an edge',
  ],
  unresolved: [{ source_file: 'app/cli.py', line: 9, queried_symbol: 'ArgumentParser' }, { source_file: 'app/cli.py', queried_symbol: 'argparse', kind: 'import' }],
  coverage: { status: 'degraded', ambiguous_relations: 1, truncated: false },
  producer: { component: 'simplicio-mapper', version: '0.26.34', canonical_digest: 'sha256:x' },
}
const projectMap = {
  schema: 'simplicio.project-map/v1', generated_at: '2026-09-29T13:12:51Z', product: { name: 'demo', stack: 'python' },
  files: [{ path: 'app/cli.py', language: 'python', size_bytes: 300, roles: ['entrypoint'], file_hash: 'zzz', imports: [] }, { path: 'pyproject.toml', language: 'toml', size_bytes: 10, roles: ['config'] }],
  entry_points: ['app/cli.py'], modules: [{ name: 'app', files: ['app/cli.py', 'app/core.py'], file_count: 2 }],
  producer: { component: 'simplicio-mapper', version: '0.26.34' },
}

describe('Mapper artifact parsing', () => {
  const { model, issues } = parseMapperArtifacts({ symbolIndex, callGraph, projectMap })

  it('reads symbols and skips malformed entries with an issue', () => {
    expect(model.symbols.map((symbol) => [symbol.id, symbol.kind, symbol.line])).toEqual([['app/cli.py::main', 'function', 7], ['app/core.py::run', 'function', 5], ['app/core.py::Runner', 'class', 20]])
    expect(model.symbols[0]).toMatchObject({ name: 'main', file: 'app/cli.py', language: 'python' })
    expect(issues.some((issue) => /symbol/i.test(issue))).toBe(true)
  })

  it('reads call edges with their resolution status and ignores non-call relations', () => {
    expect(model.calls).toHaveLength(3)
    expect(model.calls[0]).toMatchObject({ from: 'app/cli.py::main', to: 'app/core.py::run', line: 13, status: 'resolved', file: 'app/cli.py' })
    expect(model.calls[2]).toMatchObject({ status: 'ambiguous', candidates: ['app/cli.py::main', 'hooks/x.py::main'] })
  })

  it('reads resolved file imports, unresolved names, entry files, modules and coverage', () => {
    expect(model.imports).toEqual([{ from: 'app/cli.py', to: 'app/core.py' }])
    expect(model.unresolved).toEqual([{ file: 'app/cli.py', line: 9, name: 'ArgumentParser', kind: undefined }, { file: 'app/cli.py', line: undefined, name: 'argparse', kind: 'import' }])
    expect(model.entryFiles).toEqual(['app/cli.py'])
    expect(model.files.map((file) => file.path)).toEqual(['app/cli.py', 'pyproject.toml'])
    expect(model.coverage).toMatchObject({ status: 'degraded', ambiguous: 1 })
    expect(model.producer).toMatchObject({ component: 'simplicio-mapper', version: '0.26.34' })
  })

  it('works with only a symbol index and explains what is missing', () => {
    const partial = parseMapperArtifacts({ symbolIndex })
    expect(partial.model.calls).toEqual([])
    expect(partial.issues.some((issue) => /call graph/i.test(issue))).toBe(true)
  })

  it('rejects artifacts that are not objects and reports an unknown schema without crashing', () => {
    expect(parseMapperArtifacts({}).model.symbols).toEqual([])
    expect(parseMapperArtifacts({}).issues[0]).toMatch(/symbol index/i)
    const odd = parseMapperArtifacts({ symbolIndex: { schema: 'simplicio.symbol-index/v9', symbols: [] } })
    expect(odd.issues.some((issue) => /schema/i.test(issue))).toBe(true)
    expect(() => parseMapperArtifacts({ symbolIndex: 'nope' as unknown, callGraph: 5 as unknown })).not.toThrow()
  })
})

describe('slimMapperArtifacts', () => {
  const slim = slimMapperArtifacts({ symbolIndex, callGraph, projectMap })

  it('drops machine paths, provenance, digests and relation ids', () => {
    const text = JSON.stringify(slim)
    expect(text).not.toContain('/Users/someone')
    expect(text).not.toContain('relation_id')
    expect(text).not.toContain('provenance')
    expect(text).not.toContain('canonical_digest')
    expect(text).not.toContain('file_hash')
  })

  it('keeps everything the viewer needs and round-trips through the parser', () => {
    const again = parseMapperArtifacts(slim)
    expect(again.model.symbols).toEqual(parseMapperArtifacts({ symbolIndex, callGraph, projectMap }).model.symbols)
    expect(again.model.calls.map((call) => [call.from, call.to, call.line, call.status])).toEqual(model_calls())
    expect(again.model.calls[2].candidates).toEqual(['app/cli.py::main', 'hooks/x.py::main'])
    expect(again.model.imports).toEqual([{ from: 'app/cli.py', to: 'app/core.py' }])
    expect(again.model.entryFiles).toEqual(['app/cli.py'])
    expect(again.model.producer?.version).toBe('0.26.34')
  })

  it('keeps target candidates only for ambiguous edges', () => {
    const edges = (slim.callGraph as { edges: Array<Record<string, unknown>> }).edges
    expect(edges[0]).not.toHaveProperty('target_candidates')
    expect(edges[2]).toHaveProperty('target_candidates')
  })
})

function model_calls() { return parseMapperArtifacts({ symbolIndex, callGraph, projectMap }).model.calls.map((call) => [call.from, call.to, call.line, call.status]) }
