/** Flow graph → Mermaid flowchart text, ready to paste into docs or a GitHub comment. */
import type { FlowEdge, FlowGraph, FlowNode, FlowNodeKind } from './flow-graph'

const MAX_LABEL = 80

const STYLES: Record<string, string> = {
  entry: 'fill:#132a13,stroke:#bbff3c,color:#eaffc2',
  function: 'fill:#0f2a1f,stroke:#67e8a5,color:#dafbe9',
  method: 'fill:#0f2a1f,stroke:#67e8a5,color:#dafbe9',
  class: 'fill:#2b2410,stroke:#ffb547,color:#fff0d0',
  external: 'fill:#1b2430,stroke:#8b9aab,color:#d5dde6,stroke-dasharray:4 3',
  file: 'fill:#10233a,stroke:#58a6ff,color:#dcebff',
  group: 'fill:#161b22,stroke:#8b9aab,color:#d5dde6',
  step: 'fill:#161b22,stroke:#8b9aab,color:#e6edf3',
  llm_call: 'fill:#2b1424,stroke:#ff5d73,color:#ffe0e5',
  tool: 'fill:#10233a,stroke:#58a6ff,color:#dcebff',
  command: 'fill:#1b2430,stroke:#ffb547,color:#fff0d0',
  file_edit: 'fill:#0f2a1f,stroke:#67e8a5,color:#dafbe9',
  verify: 'fill:#2a1f3d,stroke:#c084fc,color:#eddcff',
  status_error: 'stroke:#ff5d73,stroke-width:3px',
  status_unknown: 'stroke-dasharray:5 4,stroke-width:2px',
  status_running: 'stroke:#ffb547,stroke-width:3px',
  status_skipped: 'opacity:0.55',
}

function escape(text: string, max = MAX_LABEL): string {
  const flat = text.length > max ? `${text.slice(0, max - 1)}…` : text
  return flat
    .replace(/#/g, '#35;').replace(/"/g, '#quot;').replace(/</g, '#lt;').replace(/>/g, '#gt;').replace(/`/g, '#96;').replace(/\|/g, '#124;')
    .replace(/\r?\n/g, '<br/>')
}

function shape(kind: FlowNodeKind, text: string): string {
  switch (kind) {
    case 'entry': return `(["${text}"])`
    case 'external': return `{{"${text}"}}`
    case 'verify': return `{"${text}"}`
    case 'llm_call': return `[["${text}"]]`
    case 'step': case 'tool': return `("${text}")`
    default: return `["${text}"]`
  }
}

function nodeText(node: FlowNode): string {
  if (node.kind === 'group') return escape(`${node.label}/${node.count !== undefined ? ` (${node.count} file${node.count === 1 ? '' : 's'})` : ''}`)
  return node.subtitle ? `${escape(node.label)}<br/>${escape(node.subtitle)}` : escape(node.label)
}

function arrow(edge: FlowEdge): string {
  const label = edge.count && edge.count > 1 ? `×${edge.count}` : edge.label
  const text = label ? `|"${escape(label, 40)}"|` : ''
  return `${edge.dashed || edge.kind === 'contains' || edge.kind === 'branch' ? '-.->' : '-->'}${text}`
}

export function toMermaid(graph: FlowGraph): string {
  const lines: string[] = [`flowchart ${graph.direction}`]
  if (graph.title) lines.push(`  %% ${graph.title.replace(/[\r\n]+/g, ' ')}`)
  if (!graph.nodes.length) { lines.push('  %% (empty)'); return `${lines.join('\n')}\n` }

  const ids = new Map<string, string>()
  const children = new Map<string, FlowNode[]>()
  const roots: FlowNode[] = []
  const known = new Set(graph.nodes.map((node) => node.id))
  let leaf = 0
  let group = 0
  const expanded = (node: FlowNode) => node.kind === 'group' && node.collapsed !== true
  for (const node of graph.nodes) {
    ids.set(node.id, expanded(node) ? `g${(group += 1)}` : `n${(leaf += 1)}`)
    if (node.parent && known.has(node.parent)) (children.get(node.parent) ?? children.set(node.parent, []).get(node.parent)!).push(node)
    else roots.push(node)
  }

  const emit = (node: FlowNode, depth: number) => {
    const pad = '  '.repeat(depth + 1)
    const id = ids.get(node.id)!
    if (expanded(node)) {
      lines.push(`${pad}subgraph ${id}["${escape(node.label)}"]`)
      for (const child of children.get(node.id) ?? []) emit(child, depth + 1)
      lines.push(`${pad}end`)
    } else lines.push(`${pad}${id}${shape(node.kind, nodeText(node))}`)
  }
  roots.forEach((node) => emit(node, 0))

  for (const edge of graph.edges) {
    const from = ids.get(edge.from)
    const to = ids.get(edge.to)
    if (from && to) lines.push(`  ${from} ${arrow(edge)} ${to}`)
  }

  const kinds = [...new Set(graph.nodes.filter((node) => !expanded(node)).map((node) => node.kind))].filter((kind) => STYLES[kind])
  const statuses = [...new Set(graph.nodes.filter((node) => node.status && STYLES[`status_${node.status}`] && node.status !== 'ok').map((node) => `status_${node.status}`))]
  for (const name of [...kinds, ...statuses]) lines.push(`  classDef ${name} ${STYLES[name]};`)
  for (const name of kinds) {
    const members = graph.nodes.filter((node) => !expanded(node) && node.kind === name).map((node) => ids.get(node.id)!)
    if (members.length) lines.push(`  class ${members.join(',')} ${name};`)
  }
  for (const name of statuses) {
    const members = graph.nodes.filter((node) => `status_${node.status}` === name).map((node) => ids.get(node.id)!)
    lines.push(`  class ${members.join(',')} ${name};`)
  }
  return `${lines.join('\n')}\n`
}
