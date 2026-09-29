/** Static views built from a Project: the architecture (folders and imports) and the flow of one entry point. */
import { LAYERS, classifyPath } from './architecture'
import type { EntryPoint } from './entrypoints'
import { edgeId, oneLine, type FlowEdge, type FlowGraph, type FlowNode } from './flow-graph'
import { callsOf, describeSymbol, type Project } from './project'

const baseName = (path: string) => path.slice(path.lastIndexOf('/') + 1)
const dirOf = (path: string) => (path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '')

/** Every folder that holds files, as group ids (`dir:<path>`), shallowest first. */
export function groupIds(project: Project): string[] {
  const dirs = new Set<string>()
  for (const path of project.files.keys()) { let dir = dirOf(path); while (dir) { dirs.add(dir); dir = dirOf(dir) } }
  return [...dirs].sort((a, b) => a.split('/').length - b.split('/').length || a.localeCompare(b)).map((dir) => `dir:${dir}`)
}

/** Expand folders breadth-first until the overview would exceed a readable number of nodes. */
export function defaultExpanded(project: Project, budget = 45): Set<string> {
  const files = [...project.files.keys()]
  const directChildren = new Map<string, number>()
  const bump = (dir: string) => directChildren.set(dir, (directChildren.get(dir) ?? 0) + 1)
  for (const path of files) bump(dirOf(path))
  for (const id of groupIds(project)) bump(dirOf(id.slice(4)))
  const expanded = new Set<string>()
  let visible = directChildren.get('') ?? 0
  for (const id of groupIds(project)) {
    const dir = id.slice(4)
    if (dirOf(dir) && !expanded.has(`dir:${dirOf(dir)}`)) continue
    const next = visible - 1 + (directChildren.get(dir) ?? 0)
    if (next > budget) continue
    expanded.add(id)
    visible = next
  }
  return expanded
}

export function buildArchitecture(project: Project, expanded: ReadonlySet<string>, maxNodes = 600): FlowGraph {
  const paths = [...project.files.keys()].sort()
  const counts = new Map<string, number>()
  for (const path of paths) { let dir = dirOf(path); while (dir) { counts.set(dir, (counts.get(dir) ?? 0) + 1); dir = dirOf(dir) } }

  // The first collapsed ancestor (from the top) hides everything below it.
  const collapsedAncestor = (path: string): string | undefined => {
    const parts = path.split('/')
    for (let depth = 1; depth < parts.length; depth += 1) { const id = `dir:${parts.slice(0, depth).join('/')}`; if (!expanded.has(id)) return id }
    return undefined
  }
  const nodes: FlowNode[] = []
  const emitted = new Set<string>()
  let truncated = false
  const push = (node: FlowNode) => { if (nodes.length >= maxNodes) { truncated = true; return false } nodes.push(node); emitted.add(node.id); return true }

  for (const path of paths) {
    const parts = path.split('/')
    for (let depth = 1; depth < parts.length; depth += 1) {
      const dir = parts.slice(0, depth).join('/')
      const id = `dir:${dir}`
      if (emitted.has(id)) continue
      if (parts.slice(0, depth - 1).some((_, up) => !expanded.has(`dir:${parts.slice(0, up + 1).join('/')}`))) break
      const parent = depth > 1 ? `dir:${parts.slice(0, depth - 1).join('/')}` : undefined
      if (!push({ id, label: parts[depth - 1], kind: 'group', collapsed: !expanded.has(id), count: counts.get(dir), parent, subtitle: `${counts.get(dir)} file${counts.get(dir) === 1 ? '' : 's'}` })) break
    }
    if (collapsedAncestor(path)) continue
    const file = project.files.get(path)!
    const layer = classifyPath(path)
    push({ id: `file:${path}`, label: baseName(path), kind: 'file', parent: dirOf(path) ? `dir:${dirOf(path)}` : undefined, subtitle: file.language, tone: layer, summary: LAYERS[layer].label })
  }

  const rep = (path: string) => collapsedAncestor(path) ?? `file:${path}`
  const folded = new Map<string, FlowEdge>()
  for (const edge of project.imports) {
    const from = rep(edge.from)
    const to = rep(edge.to)
    if (from === to || !emitted.has(from) || !emitted.has(to)) continue
    const id = edgeId(from, to, 'imports')
    const found = folded.get(id)
    if (found) found.count = (found.count ?? 1) + 1
    else folded.set(id, { id, from, to, kind: 'imports' })
  }
  const edges = [...folded.values()].map((edge) => (edge.count === 1 ? { ...edge, count: undefined } : edge))
  return { id: 'architecture', title: project.name, kind: 'architecture', direction: 'LR', nodes, edges, truncated: truncated || undefined }
}

/** The static flow of one entry point: entry → called functions → their calls, cut at `depth` and expandable node by node. */
export function buildEntryFlow(project: Project, entry: EntryPoint, options: { depth?: number; expanded?: ReadonlySet<string>; maxNodes?: number } = {}): FlowGraph {
  const depth = options.depth ?? 2
  const maxNodes = options.maxNodes ?? 120
  const expanded = options.expanded ?? new Set<string>()
  const levels = new Map<string, number>([[entry.symbol, 0]])
  const order = [entry.symbol]
  const edges = new Map<string, FlowEdge>()
  let truncated = false

  for (let at = 0; at < order.length; at += 1) {
    const id = order[at]
    if (!((levels.get(id) ?? 0) < depth || expanded.has(id))) continue
    const sites = new Map<string, ReturnType<typeof callsOf>>()
    for (const call of callsOf(project, id)) (sites.get(call.to) ?? sites.set(call.to, []).get(call.to)!).push(call)
    for (const [target, calls] of sites) {
      if (!levels.has(target)) {
        if (order.length >= maxNodes) { truncated = true; continue }
        levels.set(target, (levels.get(id) ?? 0) + 1)
        order.push(target)
      }
      const key = edgeId(id, target, 'calls')
      edges.set(key, { id: key, from: id, to: target, kind: 'calls', count: calls.length > 1 ? calls.length : undefined, dashed: calls.every((call) => call.guards.length > 0) || undefined })
    }
  }

  const shown = new Set(order)
  const nodes: FlowNode[] = order.map((id) => {
    const symbol = project.symbols.get(id)!
    const details = describeSymbol(project, id)
    const hidden = new Set(callsOf(project, id).map((call) => call.to).filter((to) => !shown.has(to))).size
    const isEntry = id === entry.symbol
    return {
      id, label: isEntry ? entry.name : symbol.label, kind: isEntry ? 'entry' : symbol.kind === 'class' ? 'class' : symbol.owner ? 'method' : 'function',
      subtitle: `${baseName(symbol.file)}:${symbol.line}`, summary: details?.summary ? oneLine(details.summary, 140) : undefined, hidden: hidden || undefined,
    }
  })
  return { id: `entry:${entry.id}`, title: entry.name, kind: 'entry', direction: 'LR', nodes, edges: [...edges.values()], truncated: truncated || undefined }
}
