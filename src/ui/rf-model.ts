/** FlowGraph + layout + replay state → React Flow nodes and edges. Pure, so the canvas component stays thin. */
import { MarkerType, Position, type Edge, type Node } from '@xyflow/react'
import { LAYERS, type LayerId } from '../domain/architecture'
import type { FlowGraph, FlowNode } from '../domain/flow-graph'
import type { Layout } from '../domain/layout'
import type { RunState } from './run-state'

export interface CardData extends Record<string, unknown> {
  node: FlowNode
  vertical: boolean
  run?: { cls: 'active' | 'done' | 'future' | 'off'; status?: string }
  accent?: string
}

const ACCENTS: Record<string, string> = {
  entry: '#bbff3c', function: '#67e8a5', method: '#67e8a5', class: '#ffb547', external: '#8b9aab', file: '#58a6ff', group: '#8b9aab',
  step: '#8b9aab', llm_call: '#ff5d73', tool: '#58a6ff', command: '#ffb547', file_edit: '#67e8a5', verify: '#c084fc',
}

export function accentFor(node: FlowNode): string {
  if (node.kind === 'file' && node.tone && node.tone in LAYERS) return LAYERS[node.tone as LayerId].color
  return ACCENTS[node.kind] ?? '#8b9aab'
}

export interface ModelOptions { runState?: RunState; overrides?: ReadonlyMap<string, { x: number; y: number }>; draggable: boolean; selectedId?: string | null; reducedMotion?: boolean }

export function toReactFlow(graph: FlowGraph, layout: Layout, options: ModelOptions): { nodes: Node<CardData>[]; edges: Edge[] } {
  const vertical = graph.direction === 'TB'
  const byId = new Map(graph.nodes.map((node) => [node.id, node]))
  const depth = (node: FlowNode): number => (node.parent && byId.has(node.parent) ? 1 + depth(byId.get(node.parent)!) : 0)
  const ordered = [...graph.nodes].sort((a, b) => depth(a) - depth(b))

  const nodes = ordered.flatMap((node): Node<CardData>[] => {
    const box = layout.positions.get(node.id)
    if (!box) return []
    const expandedGroup = node.kind === 'group' && node.collapsed === false
    const run = options.runState?.nodes.get(node.id)
    const position = options.overrides?.get(node.id) ?? { x: box.x, y: box.y }
    return [{
      id: node.id, type: expandedGroup ? 'folder' : 'card', position,
      ...(node.parent && byId.has(node.parent) ? { parentId: node.parent, extent: 'parent' as const } : {}),
      width: box.width, height: box.height, style: { width: box.width, height: box.height },
      draggable: options.draggable, selectable: true, selected: options.selectedId === node.id,
      data: { node, vertical, run, accent: accentFor(node) },
      ariaLabel: `${node.label}${node.subtitle ? `, ${node.subtitle}` : ''}`,
      zIndex: expandedGroup ? 0 : 1,
    }]
  })

  const edges = graph.edges.filter((edge) => layout.positions.has(edge.from) && layout.positions.has(edge.to)).map((edge): Edge => {
    const state = options.runState?.edges.get(edge.id)
    const color = state === 'active' ? '#bbff3c' : state === 'off' ? '#3a4650' : '#8b9aab'
    const label = edge.count && edge.count > 1 ? `×${edge.count}` : edge.label
    return {
      id: edge.id, source: edge.from, target: edge.to, type: 'default', label,
      animated: state === 'active' && !options.reducedMotion,
      className: `edge edge-${edge.kind}${edge.dashed ? ' edge-dashed' : ''}${state ? ` edge-${state}` : ''}`,
      style: { stroke: color, strokeWidth: state === 'active' ? 3 : 1.6, strokeDasharray: edge.dashed ? '6 5' : undefined },
      markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16, color },
      labelStyle: { fill: '#c9d4dc', fontSize: 11 }, labelBgStyle: { fill: '#0b1614' }, labelBgPadding: [4, 2], labelBgBorderRadius: 4,
      zIndex: state === 'active' ? 10 : 2,
    }
  })
  return { nodes, edges }
}

export const handlePositions = (vertical: boolean) => (vertical ? { target: Position.Top, source: Position.Bottom } : { target: Position.Left, source: Position.Right })
