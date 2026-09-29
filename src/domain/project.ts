/**
 * The project model behind every static view: analyzed files, Mapper symbols and calls, imports and entry points.
 * Call queries are answered lazily and cleaned against the real source: only resolved calls that sit inside the
 * caller's body are kept, so module-level code that Mapper attributes to the nearest function never shows up as a call.
 */
import { analyzeProject, type AnalyzedFile, type ProjectAnalysis, type SourceFileInput } from './analyzer'
import { detectEntryPoints, type EntryPoint } from './entrypoints'
import { pythonImports, type FileImport } from './imports'
import { parseMapperArtifacts, type MapperArtifacts, type MapperModel, type MapperCall, type MapperSymbol } from './mapper'
import { bodyRange, docOf, earlyExitBefore, excerpt, guardsAt, languageFamily, paramsOf, raisesIn, signatureOf, type Guard, type LineRange } from './source'

export interface ProjectSymbol extends MapperSymbol { label: string; owner?: string }
/** `after` is set when an earlier return/raise may end the function before this call runs. */
export interface ProjectCall { from: string; to: string; line: number; guards: Guard[]; after?: { line: number; text: string }; evidence?: string }
export interface AmbiguousCall { line: number; candidates: string[] }
export interface ProjectInput { name: string; files: SourceFileInput[]; artifacts?: MapperArtifacts }

export interface Project {
  name: string
  analysis: ProjectAnalysis
  files: Map<string, AnalyzedFile>
  symbols: Map<string, ProjectSymbol>
  symbolsByFile: Map<string, ProjectSymbol[]>
  imports: FileImport[]
  entries: EntryPoint[]
  mapper: MapperModel | null
  issues: string[]
  rawFrom: Map<string, MapperCall[]>
  rawTo: Map<string, MapperCall[]>
  unresolved: Map<string, Array<{ line?: number; name: string; kind?: string }>>
  cache: { lines: Map<string, string[]>; bodies: Map<string, LineRange | null>; calls: Map<string, ProjectCall[]> }
}

function push<K, V>(map: Map<K, V[]>, key: K, value: V) { const list = map.get(key); if (list) list.push(value); else map.set(key, [value]) }

export function buildProject(input: ProjectInput): Project {
  const analysis = analyzeProject(input.name, input.files)
  const files = new Map(analysis.files.map((file) => [file.path, file]))
  const parsed = input.artifacts ? parseMapperArtifacts(input.artifacts) : null
  const mapper = parsed?.model ?? null
  const cache: Project['cache'] = { lines: new Map(), bodies: new Map(), calls: new Map() }
  const project: Project = { name: input.name, analysis, files, symbols: new Map(), symbolsByFile: new Map(), imports: [], entries: [], mapper, issues: parsed?.issues ?? [], rawFrom: new Map(), rawTo: new Map(), unresolved: new Map(), cache }

  const symbols = (mapper?.symbols ?? []).filter((symbol) => files.has(symbol.file)).sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line)
  for (const symbol of symbols) {
    const entry: ProjectSymbol = { ...symbol, label: symbol.name }
    project.symbols.set(symbol.id, entry)
    push(project.symbolsByFile, symbol.file, entry)
  }
  // Methods: a function whose definition sits inside a class body belongs to that class.
  for (const [path, list] of project.symbolsByFile) {
    const classes = list.filter((symbol) => symbol.kind === 'class')
    if (!classes.length) continue
    const family = languageFamily(files.get(path)?.language, path)
    if (family !== 'python') continue
    const lines = linesOf(project, path)
    const ranges = classes.map((klass) => ({ klass, range: bodyRange(lines, klass.line, family) }))
    for (const symbol of list) {
      if (symbol.kind === 'class') continue
      const owner = ranges.find(({ klass, range }) => symbol.line > klass.line && symbol.line <= range.end)
      if (owner) { symbol.owner = owner.klass.name; symbol.label = `${owner.klass.name}.${symbol.name}` }
    }
  }

  for (const call of mapper?.calls ?? []) { push(project.rawFrom, call.from, call); push(project.rawTo, call.to, call) }
  for (const entry of mapper?.unresolved ?? []) push(project.unresolved, entry.file, { line: entry.line, name: entry.name, kind: entry.kind })

  // Python is resolved precisely (submodule imports); every other language uses Mapper's edges plus the analyzer's.
  const seen = new Set<string>()
  const generic = [...(mapper?.imports ?? []), ...analysis.connections.filter((connection) => !connection.external).map((connection) => ({ from: connection.source, to: connection.target }))]
  for (const edge of [...pythonImports(input.files), ...generic.filter((edge) => !edge.from.endsWith('.py'))]) {
    const key = `${edge.from}\0${edge.to}`
    if (edge.from === edge.to || seen.has(key) || !files.has(edge.from) || !files.has(edge.to)) continue
    seen.add(key)
    project.imports.push(edge)
  }

  if (mapper) {
    const detected = detectEntryPoints({ files: input.files, symbols, entryFiles: mapper.entryFiles })
    project.entries = detected.entries
    project.issues.push(...detected.issues)
  }
  return project
}

function linesOf(project: Project, path: string): string[] {
  let lines = project.cache.lines.get(path)
  if (!lines) { lines = (project.files.get(path)?.content ?? '').split('\n'); project.cache.lines.set(path, lines) }
  return lines
}

export function bodyOf(project: Project, id: string): LineRange | undefined {
  const cached = project.cache.bodies.get(id)
  if (cached !== undefined) return cached ?? undefined
  const symbol = project.symbols.get(id)
  const file = symbol ? project.files.get(symbol.file) : undefined
  const range = symbol && file ? bodyRange(linesOf(project, symbol.file), symbol.line, languageFamily(symbol.language ?? file.language, symbol.file)) : null
  project.cache.bodies.set(id, range)
  return range ?? undefined
}

const inside = (range: LineRange | undefined, line: number) => !range || (line >= range.start && line <= range.end)

/** Resolved outgoing calls of a symbol, in call order, each with the conditions that guard it. */
export function callsOf(project: Project, id: string): ProjectCall[] {
  const cached = project.cache.calls.get(id)
  if (cached) return cached
  const symbol = project.symbols.get(id)
  const range = bodyOf(project, id)
  const lines = symbol ? linesOf(project, symbol.file) : []
  const family = symbol ? languageFamily(symbol.language, symbol.file) : 'other'
  const calls: ProjectCall[] = []
  for (const raw of project.rawFrom.get(id) ?? []) {
    if (raw.status !== 'resolved' || raw.to === id || !project.symbols.has(raw.to)) continue
    const line = raw.line ?? symbol?.line ?? 0
    if (!inside(range, line)) continue
    const after = range && lines.length ? earlyExitBefore(lines, range, line, family) : undefined
    calls.push({ from: id, to: raw.to, line, guards: range && lines.length ? guardsAt(lines, range, line, family) : [], ...(after ? { after } : {}), evidence: raw.evidence })
  }
  calls.sort((a, b) => a.line - b.line)
  project.cache.calls.set(id, calls)
  return calls
}

/** Calls Mapper could not resolve to one target. Edges for the same call site are folded into one entry with all its candidates. */
export function ambiguousOf(project: Project, id: string): AmbiguousCall[] {
  const range = bodyOf(project, id)
  const sites = new Map<string, AmbiguousCall>()
  for (const raw of project.rawFrom.get(id) ?? []) {
    if (raw.status === 'resolved' || raw.line === undefined || !inside(range, raw.line)) continue
    const site = sites.get(`${raw.line}:${raw.to.split('::')[1] ?? raw.to}`) ?? { line: raw.line, candidates: [] }
    for (const candidate of raw.candidates?.length ? raw.candidates : [raw.to]) if (!site.candidates.includes(candidate)) site.candidates.push(candidate)
    sites.set(`${raw.line}:${raw.to.split('::')[1] ?? raw.to}`, site)
  }
  return [...sites.values()].sort((a, b) => a.line - b.line)
}

export function callersOf(project: Project, id: string): ProjectCall[] {
  const callers = new Map<string, ProjectCall>()
  for (const raw of project.rawTo.get(id) ?? []) {
    if (raw.status !== 'resolved' || raw.from === id) continue
    for (const call of callsOf(project, raw.from)) if (call.to === id && !callers.has(`${call.from}:${call.line}`)) callers.set(`${call.from}:${call.line}`, call)
  }
  return [...callers.values()].sort((a, b) => a.from.localeCompare(b.from) || a.line - b.line)
}

/** Names Mapper could not resolve (library, builtin or dynamic calls) made from inside a symbol. */
export function externalCallsOf(project: Project, id: string): string[] {
  const symbol = project.symbols.get(id)
  const range = bodyOf(project, id)
  if (!symbol || !range) return []
  const names: string[] = []
  for (const entry of project.unresolved.get(symbol.file) ?? []) {
    if (entry.kind === 'import' || entry.line === undefined || entry.line < range.start || entry.line > range.end) continue
    names.push(entry.name)
  }
  return [...new Set(names)].slice(0, 30)
}

export interface SymbolDetails {
  symbol: ProjectSymbol
  language?: string
  signature?: string
  params: string[]
  returns?: string
  summary?: string
  doc?: string
  excerpt?: { start: number; end: number; lines: string[]; truncated: boolean }
  raises: string[]
  callees: ProjectCall[]
  callers: ProjectCall[]
  ambiguous: AmbiguousCall[]
  external: string[]
}

export function describeSymbol(project: Project, id: string): SymbolDetails | undefined {
  const symbol = project.symbols.get(id)
  if (!symbol) return undefined
  const file = project.files.get(symbol.file)
  const family = languageFamily(symbol.language ?? file?.language, symbol.file)
  const details: SymbolDetails = { symbol, language: symbol.language ?? file?.language, params: [], raises: [], callees: callsOf(project, id), callers: callersOf(project, id), ambiguous: ambiguousOf(project, id), external: externalCallsOf(project, id) }
  const range = bodyOf(project, id)
  if (file && range) {
    const lines = linesOf(project, symbol.file)
    details.signature = signatureOf(lines, symbol.line, family) || undefined
    if (details.signature) Object.assign(details, paramsOf(details.signature, family))
    Object.assign(details, docOf(lines, symbol.line, family))
    details.excerpt = excerpt(lines, range, 60)
    details.raises = raisesIn(lines, range, family)
  }
  return details
}

/** Functions that call others but are called by nobody: the natural starts of a call graph. Most callees first. */
export function callRoots(project: Project, limit = 8): ProjectSymbol[] {
  const roots: Array<{ symbol: ProjectSymbol; callees: number }> = []
  for (const symbol of project.symbols.values()) {
    if (symbol.kind === 'class' || /(^|\/)(tests?|__tests__)(\/|$)|(^|\/)test_/.test(symbol.file)) continue
    const callees = new Set(callsOf(project, symbol.id).map((call) => call.to)).size
    if (callees && !callersOf(project, symbol.id).length) roots.push({ symbol, callees })
  }
  return roots.sort((a, b) => b.callees - a.callees || a.symbol.id.localeCompare(b.symbol.id)).slice(0, limit).map((entry) => entry.symbol)
}

/** Functions whose name or file matches a search text, shortest names first. */
export function findSymbols(project: Project, text: string, limit = 20): ProjectSymbol[] {
  const needle = text.trim().toLowerCase()
  if (needle.length < 2) return []
  return [...project.symbols.values()]
    .filter((symbol) => symbol.kind !== 'class' && `${symbol.label} ${symbol.file}`.toLowerCase().includes(needle))
    .sort((a, b) => Number(b.label.toLowerCase() === needle) - Number(a.label.toLowerCase() === needle) || a.label.length - b.label.length || a.id.localeCompare(b.id))
    .slice(0, limit)
}
