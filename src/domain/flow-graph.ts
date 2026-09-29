/** Renderer-neutral flow graph consumed by the 2D canvas, the Mermaid export and the simulator. */
import type { TraceKind, TraceStatus } from './trace'

export type FlowDirection = 'LR' | 'TB'
export type FlowNodeKind = 'entry' | 'function' | 'method' | 'class' | 'external' | 'file' | 'group' | TraceKind
export type FlowEdgeKind = 'calls' | 'imports' | 'next' | 'contains' | 'branch'
export type FlowGraphKind = 'architecture' | 'entry' | 'trace' | 'simulation'

export interface FlowNode {
  id: string
  label: string
  kind: FlowNodeKind
  /** Small grey line under the label: `cli.py:7`, `12 files`, `1.9s`. */
  subtitle?: string
  /** One sentence describing what the node does. */
  summary?: string
  /** Id of the containing group (architecture view). */
  parent?: string
  collapsed?: boolean
  /** Files inside a group. */
  count?: number
  /** Callees not shown yet; the node can be expanded. */
  hidden?: number
  status?: TraceStatus
  /** Architecture layer id, used for colour. */
  tone?: string
  /** Short chips: `deepseek-v4`, `2.4k tok`, `1.9s`. */
  badges?: string[]
}

export interface FlowEdge {
  id: string
  from: string
  to: string
  kind: FlowEdgeKind
  label?: string
  /** Number of underlying edges folded into this one (collapsed groups). */
  count?: number
  dashed?: boolean
}

export interface FlowGraph {
  id: string
  title: string
  kind: FlowGraphKind
  direction: FlowDirection
  nodes: FlowNode[]
  edges: FlowEdge[]
  /** True when a node cap cut the graph. */
  truncated?: boolean
}

export const edgeId = (from: string, to: string, kind: FlowEdgeKind) => `${from}->${to}:${kind}`

export interface FlowIndex {
  byId: Map<string, FlowNode>
  out: Map<string, FlowEdge[]>
  incoming: Map<string, FlowEdge[]>
}

export function flowIndex(graph: FlowGraph): FlowIndex {
  const byId = new Map(graph.nodes.map((node) => [node.id, node]))
  const out = new Map<string, FlowEdge[]>()
  const incoming = new Map<string, FlowEdge[]>()
  for (const edge of graph.edges) {
    ;(out.get(edge.from) ?? out.set(edge.from, []).get(edge.from)!).push(edge)
    ;(incoming.get(edge.to) ?? incoming.set(edge.to, []).get(edge.to)!).push(edge)
  }
  return { byId, out, incoming }
}

const clean = (value: string | undefined, max: number) => {
  if (!value) return ''
  const text = value.replace(/\s+/g, ' ').trim()
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

/** `1.9s`, `420ms`, `2m 5s` — short durations for chips and the timeline. */
export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return ''
  if (seconds < 1) return `${Math.round(seconds * 1000)}ms`
  if (seconds < 60) return `${Number(seconds.toFixed(seconds < 10 ? 2 : 1))}s`
  return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`
}

export function formatTokens(count: number): string {
  return count >= 10_000 ? `${(count / 1000).toFixed(0)}k` : count >= 1000 ? `${(count / 1000).toFixed(1)}k` : String(count)
}

export const oneLine = clean
