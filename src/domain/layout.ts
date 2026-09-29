/**
 * Auto-layout of a flow graph with dagre (mature, small, synchronous). Groups are laid out bottom-up: an expanded
 * group is sized from its own layout, then laid out as one node next to its siblings. Every edge is used at the
 * level where its endpoints' containers become siblings, so links between folders steer the folders' order.
 */
import dagre from '@dagrejs/dagre'
import type { FlowGraph, FlowNode } from './flow-graph'

export interface Box { x: number; y: number; width: number; height: number }
export interface Layout { positions: Map<string, Box>; width: number; height: number }

const CARD_WIDTH = 240
const GROUP_PADDING = 18
const GROUP_HEADER = 40

export function nodeSize(node: FlowNode): { width: number; height: number } {
  if (node.kind === 'group') return { width: CARD_WIDTH, height: 68 }
  const rows = 1 + (node.subtitle ? 1 : 0) + (node.summary ? 2 : 0)
  return { width: CARD_WIDTH, height: 40 + rows * 18 + (node.badges?.length ? 26 : 0) }
}

export function layoutGraph(graph: FlowGraph): Layout {
  const byId = new Map(graph.nodes.map((node) => [node.id, node]))
  const children = new Map<string, FlowNode[]>()
  for (const node of graph.nodes) {
    const parent = node.parent && byId.has(node.parent) ? node.parent : ''
    ;(children.get(parent) ?? children.set(parent, []).get(parent)!).push(node)
  }
  const parentOf = (id: string) => { const parent = byId.get(id)?.parent; return parent && byId.has(parent) ? parent : '' }
  const chain = (id: string) => { const path: string[] = []; for (let current: string | undefined = id; current; current = parentOf(current) || undefined) path.unshift(current); return path }

  // Assign every edge to the container where both endpoints' ancestors are siblings.
  const edgesAt = new Map<string, Array<[string, string]>>()
  for (const edge of graph.edges) {
    if (!byId.has(edge.from) || !byId.has(edge.to)) continue
    const a = chain(edge.from)
    const b = chain(edge.to)
    let depth = 0
    while (depth < a.length && depth < b.length && a[depth] === b[depth]) depth += 1
    if (depth >= a.length || depth >= b.length) continue
    const container = depth === 0 ? '' : a[depth - 1]
    ;(edgesAt.get(container) ?? edgesAt.set(container, []).get(container)!).push([a[depth], b[depth]])
  }

  const sizes = new Map<string, { width: number; height: number }>()
  const relative = new Map<string, Box>()

  const place = (container: string): { width: number; height: number } => {
    const members = children.get(container) ?? []
    if (!members.length) return { width: 0, height: 0 }
    for (const member of members) sizes.set(member.id, member.kind === 'group' && member.collapsed === false && (children.get(member.id)?.length ?? 0) > 0 ? wrap(place(member.id)) : nodeSize(member))
    const pairs = [...new Set((edgesAt.get(container) ?? []).filter(([from, to]) => from !== to).map(([from, to]) => `${from}\0${to}`))].map((key) => key.split('\0') as [string, string])
    const connected = new Set(pairs.flat())
    const linked = members.filter((member) => connected.has(member.id))
    // Nodes without any edge would stack into one endless column: pack them in a grid below the connected part instead.
    const loose = members.filter((member) => !connected.has(member.id))
    const offsetX = container ? GROUP_PADDING : 0
    const offsetY = container ? GROUP_PADDING + GROUP_HEADER : 0
    let width = 0
    let height = 0
    if (linked.length) {
      const g = new dagre.graphlib.Graph()
      g.setGraph({ rankdir: graph.direction, nodesep: container ? 24 : 36, ranksep: container ? 56 : 90, marginx: 0, marginy: 0 })
      g.setDefaultEdgeLabel(() => ({}))
      for (const member of linked) g.setNode(member.id, { ...sizes.get(member.id)! })
      for (const [from, to] of pairs) g.setEdge(from, to)
      dagre.layout(g)
      for (const member of linked) {
        const at = g.node(member.id)
        relative.set(member.id, { x: at.x - at.width / 2 + offsetX, y: at.y - at.height / 2 + offsetY, width: at.width, height: at.height })
      }
      ;({ width = 0, height = 0 } = g.graph())
    }
    if (loose.length) {
      // Aim for a block about as wide as a screen: columns ≈ √(count × cell height ÷ cell width × 1.7).
      const cellWidth = Math.max(...loose.map((member) => sizes.get(member.id)!.width)) + 24
      const cellHeight = loose.reduce((sum, member) => sum + sizes.get(member.id)!.height, 0) / loose.length + 24
      const columns = Math.max(1, Math.min(10, Math.round(Math.sqrt((loose.length * cellHeight * 1.7) / cellWidth))))
      const rows: FlowNode[][] = []
      for (let at = 0; at < loose.length; at += columns) rows.push(loose.slice(at, at + columns))
      const startY = height ? height + 48 : 0
      let y = startY
      for (const row of rows) {
        let x = 0
        for (const member of row) { const size = sizes.get(member.id)!; relative.set(member.id, { x: x + offsetX, y: y + offsetY, width: size.width, height: size.height }); x += size.width + 24 }
        width = Math.max(width, x - 24)
        y += Math.max(...row.map((member) => sizes.get(member.id)!.height)) + 24
      }
      height = y - 24
    }
    return { width, height }
  }
  const wrap = (inner: { width: number; height: number }) => ({ width: Math.max(CARD_WIDTH, inner.width + GROUP_PADDING * 2), height: inner.height + GROUP_PADDING * 2 + GROUP_HEADER })

  const top = place('')
  return { positions: relative, width: top.width, height: top.height }
}
