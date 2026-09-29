/**
 * Defensive reader for simplicio-mapper artifacts (`.simplicio-loop/*.json`):
 * symbol-index (simplicio.symbol-index/v1), call-graph (simplicio.call-graph/v1) and project-map (simplicio.project-map/v1).
 * Mapper's resolution is lexical, so every call carries its resolution status and nothing here claims more than that.
 */
export interface MapperArtifacts { projectMap?: unknown; callGraph?: unknown; symbolIndex?: unknown }
export interface MapperSymbol { id: string; name: string; kind: string; file: string; line: number; language?: string }
export interface MapperCall { from: string; to: string; file?: string; line?: number; status: string; evidence?: string; candidates?: string[] }
export interface MapperImport { from: string; to: string }
export interface MapperUnresolved { file: string; line?: number; name: string; kind?: string }
export interface MapperFile { path: string; language?: string; roles?: string[]; size?: number }
export interface MapperModel {
  symbols: MapperSymbol[]
  calls: MapperCall[]
  imports: MapperImport[]
  unresolved: MapperUnresolved[]
  entryFiles: string[]
  files: MapperFile[]
  modules: Array<{ name: string; fileCount: number }>
  producer?: { component?: string; version?: string }
  coverage?: { status?: string; ambiguous?: number; truncated?: boolean }
  generatedAt?: string
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const str = (value: unknown) => (typeof value === 'string' && value ? value : undefined)
const int = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : undefined)
const strings = (value: unknown) => (Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [])

export function emptyMapperModel(): MapperModel { return { symbols: [], calls: [], imports: [], unresolved: [], entryFiles: [], files: [], modules: [] } }

function checkSchema(value: Record<string, unknown>, prefix: string, label: string, issues: string[]) {
  const schema = str(value.schema)
  if (schema && !schema.startsWith(`${prefix}/v1`)) issues.push(`${label}: unsupported schema ${schema}; reading it as ${prefix}/v1`)
}

export function parseMapperArtifacts(artifacts: MapperArtifacts): { model: MapperModel; issues: string[] } {
  const issues: string[] = []
  const model = emptyMapperModel()

  if (!isRecord(artifacts.symbolIndex)) issues.push('symbol index missing: run `simplicio-mapper scan` so flows can be built')
  else {
    checkSchema(artifacts.symbolIndex, 'simplicio.symbol-index', 'symbol index', issues)
    const list = Array.isArray(artifacts.symbolIndex.symbols) ? artifacts.symbolIndex.symbols : []
    let skipped = 0
    for (const entry of list) {
      const file = isRecord(entry) ? (str(entry.defined_in) ?? (isRecord(entry.evidence) ? str(entry.evidence.file) : undefined)) : undefined
      const id = isRecord(entry) ? str(entry.qualified_name) : undefined
      const name = isRecord(entry) ? str(entry.name) : undefined
      const line = isRecord(entry) ? int(entry.line) : undefined
      if (!isRecord(entry) || !id || !name || !file || line === undefined) { skipped += 1; continue }
      model.symbols.push({ id, name, kind: str(entry.kind) ?? 'function', file, line, language: str(entry.language) })
    }
    if (skipped) issues.push(`symbol index: skipped ${skipped} malformed symbol${skipped === 1 ? '' : 's'}`)
  }

  if (!isRecord(artifacts.callGraph)) issues.push('call graph missing: flows will have no calls until `simplicio-mapper scan` has produced it')
  else {
    checkSchema(artifacts.callGraph, 'simplicio.call-graph', 'call graph', issues)
    for (const entry of Array.isArray(artifacts.callGraph.edges) ? artifacts.callGraph.edges : []) {
      if (!isRecord(entry)) continue
      if (entry.type === 'calls') {
        const from = str(entry.source_symbol)
        const to = str(entry.target_symbol)
        if (!from || !to) continue
        const status = str(entry.resolution_status) ?? 'resolved'
        const candidates = strings(entry.target_candidates)
        model.calls.push({ from, to, file: str(entry.source_file), line: int(entry.line), status, evidence: str(entry.evidence_class), ...(status !== 'resolved' && candidates.length ? { candidates } : {}) })
      } else if (entry.type === 'imports') {
        const from = str(entry.source_file)
        const to = str(entry.target_file)
        if (from && to) model.imports.push({ from, to })
      }
    }
    for (const entry of Array.isArray(artifacts.callGraph.unresolved) ? artifacts.callGraph.unresolved : []) {
      if (!isRecord(entry)) continue
      const file = str(entry.source_file)
      const name = str(entry.queried_symbol)
      if (file && name) model.unresolved.push({ file, line: int(entry.line), name, kind: str(entry.kind) })
    }
    if (isRecord(artifacts.callGraph.coverage)) {
      const coverage = artifacts.callGraph.coverage
      model.coverage = { status: str(coverage.status), ambiguous: int(coverage.ambiguous_relations), truncated: typeof coverage.truncated === 'boolean' ? coverage.truncated : undefined }
    }
    if (isRecord(artifacts.callGraph.producer)) model.producer = { component: str(artifacts.callGraph.producer.component), version: str(artifacts.callGraph.producer.version) }
  }

  if (isRecord(artifacts.projectMap)) {
    checkSchema(artifacts.projectMap, 'simplicio.project-map', 'project map', issues)
    model.entryFiles = strings(artifacts.projectMap.entry_points)
    model.generatedAt = str(artifacts.projectMap.generated_at)
    for (const file of Array.isArray(artifacts.projectMap.files) ? artifacts.projectMap.files : []) {
      if (isRecord(file) && str(file.path)) model.files.push({ path: str(file.path)!, language: str(file.language), roles: strings(file.roles), size: int(file.size_bytes) })
    }
    for (const module of Array.isArray(artifacts.projectMap.modules) ? artifacts.projectMap.modules : []) {
      if (isRecord(module) && str(module.name)) model.modules.push({ name: str(module.name)!, fileCount: int(module.file_count) ?? strings(module.files).length })
    }
    if (!model.producer && isRecord(artifacts.projectMap.producer)) model.producer = { component: str(artifacts.projectMap.producer.component), version: str(artifacts.projectMap.producer.version) }
  }
  return { model, issues }
}

/**
 * Keeps only what the viewer reads. Used by the local bridge before sending artifacts to the browser and by the
 * fixture builder: it drops machine paths, provenance blocks, digests and relation ids.
 */
export function slimMapperArtifacts(artifacts: MapperArtifacts): MapperArtifacts {
  const out: MapperArtifacts = {}
  if (isRecord(artifacts.symbolIndex)) {
    out.symbolIndex = {
      schema: artifacts.symbolIndex.schema,
      symbols: (Array.isArray(artifacts.symbolIndex.symbols) ? artifacts.symbolIndex.symbols : []).filter(isRecord).map((symbol) => ({ name: symbol.name, qualified_name: symbol.qualified_name, kind: symbol.kind, language: symbol.language, defined_in: symbol.defined_in ?? (isRecord(symbol.evidence) ? symbol.evidence.file : undefined), line: symbol.line })),
    }
  }
  if (isRecord(artifacts.callGraph)) {
    const graph = artifacts.callGraph
    const edges = (Array.isArray(graph.edges) ? graph.edges : []).filter(isRecord).filter((entry) => entry.type === 'calls' || entry.type === 'imports').map((entry) => {
      const kept: Record<string, unknown> = { type: entry.type, source_file: entry.source_file, source_symbol: entry.source_symbol, target_file: entry.target_file, target_symbol: entry.target_symbol, line: entry.line, resolution_status: entry.resolution_status, evidence_class: entry.evidence_class }
      if (entry.resolution_status !== 'resolved' && Array.isArray(entry.target_candidates)) kept.target_candidates = entry.target_candidates
      return Object.fromEntries(Object.entries(kept).filter(([, value]) => value !== undefined))
    })
    const unresolved = (Array.isArray(graph.unresolved) ? graph.unresolved : []).filter(isRecord).map((entry) => Object.fromEntries(Object.entries({ source_file: entry.source_file, line: entry.line, queried_symbol: entry.queried_symbol, kind: entry.kind }).filter(([, value]) => value !== undefined)))
    const coverage = isRecord(graph.coverage) ? { status: graph.coverage.status, ambiguous_relations: graph.coverage.ambiguous_relations, truncated: graph.coverage.truncated } : undefined
    const producer = isRecord(graph.producer) ? { component: graph.producer.component, version: graph.producer.version } : undefined
    out.callGraph = { schema: graph.schema, edges, unresolved, coverage, producer }
  }
  if (isRecord(artifacts.projectMap)) {
    const map = artifacts.projectMap
    out.projectMap = {
      schema: map.schema, generated_at: map.generated_at, entry_points: map.entry_points,
      files: (Array.isArray(map.files) ? map.files : []).filter(isRecord).map((file) => ({ path: file.path, language: file.language, size_bytes: file.size_bytes, roles: file.roles })),
      modules: (Array.isArray(map.modules) ? map.modules : []).filter(isRecord).map((module) => ({ name: module.name, file_count: module.file_count })),
      producer: isRecord(map.producer) ? { component: map.producer.component, version: map.producer.version } : undefined,
    }
  }
  return out
}
