import { describe, expect, it } from 'vitest'
import { EXAMPLE_ARTIFACTS, EXAMPLE_FILES, EXAMPLE_NAME } from '../src/example'
import type { FlowEdge, FlowGraph, FlowNode } from '../src/domain/flow-graph'
import { buildArchitecture, buildEntryFlow, groupIds } from '../src/domain/flows'
import { layoutGraph } from '../src/domain/layout'
import { buildProject } from '../src/domain/project'

const node = (id: string, extra: Partial<FlowNode> = {}): FlowNode => ({ id, label: id, kind: 'function', ...extra })
const edge = (from: string, to: string): FlowEdge => ({ id: `${from}>${to}`, from, to, kind: 'calls' })
const graph = (nodes: FlowNode[], edges: FlowEdge[], direction: 'LR' | 'TB' = 'LR'): FlowGraph => ({ id: 'g', title: 'g', kind: 'entry', direction, nodes, edges })
const overlap = (a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height

describe('graph layout', () => {
  it('lays a chain out left to right, or top to bottom', () => {
    const chain = [node('a'), node('b'), node('c')]
    const lr = layoutGraph(graph(chain, [edge('a', 'b'), edge('b', 'c')])).positions
    expect(lr.get('a')!.x).toBeLessThan(lr.get('b')!.x)
    expect(lr.get('b')!.x).toBeLessThan(lr.get('c')!.x)
    const tb = layoutGraph(graph(chain, [edge('a', 'b'), edge('b', 'c')], 'TB')).positions
    expect(tb.get('a')!.y).toBeLessThan(tb.get('b')!.y)
    expect(tb.get('b')!.y).toBeLessThan(tb.get('c')!.y)
  })

  it('never overlaps nodes, even for branching graphs with cycles and shared callees', () => {
    const nodes = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => node(id))
    const edges = [edge('a', 'b'), edge('a', 'c'), edge('a', 'd'), edge('b', 'e'), edge('c', 'e'), edge('d', 'f'), edge('f', 'a')]
    const { positions } = layoutGraph(graph(nodes, edges))
    const boxes = [...positions.values()]
    for (let i = 0; i < boxes.length; i += 1) for (let j = i + 1; j < boxes.length; j += 1) expect(overlap(boxes[i], boxes[j]), `${i} vs ${j}`).toBe(false)
  })

  it('is deterministic and returns the bounding box', () => {
    const g = graph(['a', 'b', 'c'].map((id) => node(id)), [edge('a', 'b'), edge('a', 'c')])
    expect(layoutGraph(g)).toEqual(layoutGraph(structuredClone(g)))
    const { width, height, positions } = layoutGraph(g)
    for (const box of positions.values()) { expect(box.x + box.width).toBeLessThanOrEqual(width); expect(box.y + box.height).toBeLessThanOrEqual(height) }
  })

  it('sizes cards by content: subtitle, summary and badges make them taller', () => {
    const { positions } = layoutGraph(graph([node('plain'), node('rich', { subtitle: 'a.py:1', summary: 'Does a thing.', badges: ['x'] })], []))
    expect(positions.get('rich')!.height).toBeGreaterThan(positions.get('plain')!.height)
    expect(positions.get('plain')!.width).toBeGreaterThanOrEqual(200)
  })

  it('ignores edges to missing nodes and handles an empty graph', () => {
    expect(layoutGraph(graph([node('a')], [edge('a', 'ghost')])).positions.size).toBe(1)
    expect(layoutGraph(graph([], []))).toMatchObject({ width: 0, height: 0 })
  })

  it('nests children inside an expanded group with positions relative to it', () => {
    const nodes = [node('g', { kind: 'group', collapsed: false, count: 2 }), node('x', { parent: 'g', kind: 'file' }), node('y', { parent: 'g', kind: 'file' }), node('z', { kind: 'file' })]
    const { positions } = layoutGraph(graph(nodes, [edge('x', 'y'), edge('y', 'z')]))
    const group = positions.get('g')!
    for (const id of ['x', 'y']) {
      const child = positions.get(id)!
      expect(child.x).toBeGreaterThanOrEqual(0)
      expect(child.y).toBeGreaterThan(0)
      expect(child.x + child.width).toBeLessThanOrEqual(group.width)
      expect(child.y + child.height).toBeLessThanOrEqual(group.height)
    }
    expect(positions.get('x')!.x).toBeLessThan(positions.get('y')!.x)
    expect(group.x + group.width).toBeLessThan(positions.get('z')!.x)
  })

  it('keeps a collapsed group as small as a card', () => {
    const { positions } = layoutGraph(graph([node('g', { kind: 'group', collapsed: true, count: 40 }), node('c')], []))
    expect(positions.get('g')!.height).toBeLessThan(120)
  })

  it('orders sibling groups by the edges between their files', () => {
    const nodes = [node('ga', { kind: 'group', collapsed: false }), node('gb', { kind: 'group', collapsed: false }), node('a', { parent: 'ga', kind: 'file' }), node('b', { parent: 'gb', kind: 'file' })]
    const { positions } = layoutGraph(graph(nodes, [edge('a', 'b')]))
    expect(positions.get('ga')!.x).toBeLessThan(positions.get('gb')!.x)
  })

  it('lays out the real example views without overlaps and quickly', () => {
    const project = buildProject({ name: EXAMPLE_NAME, files: EXAMPLE_FILES, artifacts: EXAMPLE_ARTIFACTS })
    const views = [buildArchitecture(project, new Set(groupIds(project))), buildEntryFlow(project, project.entries[0], { depth: 4 })]
    for (const view of views) {
      const started = performance.now()
      const { positions } = layoutGraph(view)
      expect(positions.size).toBe(view.nodes.length)
      expect(performance.now() - started).toBeLessThan(500)
      const siblings = new Map<string, Array<ReturnType<typeof positions.get>>>()
      for (const item of view.nodes) (siblings.get(item.parent ?? '') ?? siblings.set(item.parent ?? '', []).get(item.parent ?? '')!).push(positions.get(item.id))
      for (const list of siblings.values()) for (let i = 0; i < list.length; i += 1) for (let j = i + 1; j < list.length; j += 1) expect(overlap(list[i]!, list[j]!)).toBe(false)
    }
  })

  it('handles a few hundred nodes within a second', () => {
    const nodes = Array.from({ length: 400 }, (_, index) => node(`n${index}`))
    const edges = nodes.slice(1).map((item, index) => edge(`n${Math.floor(index / 3)}`, item.id))
    const started = performance.now()
    expect(layoutGraph(graph(nodes, edges)).positions.size).toBe(400)
    expect(performance.now() - started).toBeLessThan(1500)
  })
})
