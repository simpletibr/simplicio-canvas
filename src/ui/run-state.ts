/** Which nodes and edges the canvas highlights at a given replay step. Pure: the canvas only maps it to CSS classes. */
import { flowIndex, type FlowGraph } from '../domain/flow-graph'
import type { TraceEvent, TraceStatus } from '../domain/trace'

export type RunClass = 'active' | 'done' | 'future' | 'off'
export interface RunState {
  activeNode?: string
  nodes: Map<string, { cls: RunClass; status?: TraceStatus }>
  edges: Map<string, RunClass>
}

/** A simulated step names its node in the flow; a real event is its own node. */
export const nodeOf = (event: TraceEvent): string => (typeof event.attrs.node === 'string' ? event.attrs.node : event.id)

export function runState(graph: FlowGraph, events: TraceEvent[], index: number): RunState {
  const state: RunState = { nodes: new Map(), edges: new Map() }
  if (!events.length) return state
  const at = Math.min(Math.max(0, Math.trunc(index)), events.length - 1)
  const { out, incoming } = flowIndex(graph)

  /** Edges walked to arrive at step k. */
  const arrival = (k: number): string[] => {
    const event = events[k]
    const node = nodeOf(event)
    if (typeof event.attrs.edge === 'string') return [event.attrs.edge]
    if (graph.kind === 'trace') return (incoming.get(node) ?? []).map((edge) => edge.id)
    if (k === 0) return []
    const previous = nodeOf(events[k - 1])
    return (out.get(previous) ?? []).filter((edge) => edge.to === node).map((edge) => edge.id)
  }

  const firstStatus = new Map<string, TraceStatus>()
  const latestStatus = new Map<string, TraceStatus>()
  events.forEach((event, k) => { const node = nodeOf(event); if (!firstStatus.has(node)) firstStatus.set(node, event.status); if (k <= at) latestStatus.set(node, event.status) })

  const active = nodeOf(events[at])
  const done = new Set(events.slice(0, at).map(nodeOf))
  const future = new Set(events.slice(at + 1).map(nodeOf))
  for (const node of graph.nodes) {
    const cls: RunClass = node.id === active ? 'active' : done.has(node.id) ? 'done' : future.has(node.id) ? 'future' : 'off'
    state.nodes.set(node.id, { cls, status: latestStatus.get(node.id) ?? firstStatus.get(node.id) })
  }

  const activeEdges = new Set(arrival(at))
  const doneEdges = new Set(events.slice(0, at).flatMap((_, k) => arrival(k)))
  const futureEdges = new Set(events.slice(at + 1).flatMap((_, k) => arrival(k + at + 1)))
  for (const edge of graph.edges) state.edges.set(edge.id, activeEdges.has(edge.id) ? 'active' : doneEdges.has(edge.id) ? 'done' : futureEdges.has(edge.id) ? 'future' : 'off')
  state.activeNode = active
  return state
}
