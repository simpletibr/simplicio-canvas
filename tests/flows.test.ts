import { describe, expect, it } from 'vitest'
import { EXAMPLE_ARTIFACTS, EXAMPLE_FILES, EXAMPLE_NAME } from '../src/example'
import { flowIndex } from '../src/domain/flow-graph'
import { buildArchitecture, buildEntryFlow, defaultExpanded, groupIds } from '../src/domain/flows'
import { buildProject } from '../src/domain/project'

const project = buildProject({ name: EXAMPLE_NAME, files: EXAMPLE_FILES, artifacts: EXAMPLE_ARTIFACTS })
const ids = (graph: { nodes: Array<{ id: string }> }) => graph.nodes.map((node) => node.id)
const pair = (edge: { from: string; to: string }) => `${edge.from} > ${edge.to}`

describe('architecture view', () => {
  it('shows every folder collapsed when nothing is expanded, with file counts and aggregated import edges', () => {
    const graph = buildArchitecture(project, new Set())
    expect(graph).toMatchObject({ kind: 'architecture', direction: 'LR', title: EXAMPLE_NAME })
    const groups = graph.nodes.filter((node) => node.kind === 'group')
    expect(groups.map((node) => `${node.label}:${node.count}:${node.collapsed}`).sort()).toEqual(['docs:1:true', 'hooks:1:true', 'simplicio_loop:14:true', 'tests:2:true'])
    expect(graph.nodes.filter((node) => node.kind === 'file').map((node) => node.label).sort()).toEqual(['README.md', 'pyproject.toml'])
    const tests = graph.edges.find((edge) => edge.from === 'dir:tests' && edge.to === 'dir:simplicio_loop')
    expect(tests).toMatchObject({ kind: 'imports', count: 2 })
  })

  it('expands a folder in place: its files appear with the folder as parent and file-level edges appear', () => {
    const graph = buildArchitecture(project, new Set(['dir:simplicio_loop']))
    const folder = graph.nodes.find((node) => node.id === 'dir:simplicio_loop')!
    expect(folder).toMatchObject({ kind: 'group', collapsed: false, count: 14 })
    const files = graph.nodes.filter((node) => node.parent === 'dir:simplicio_loop')
    expect(files).toHaveLength(14)
    expect(graph.nodes.find((node) => node.id === 'file:simplicio_loop/cli.py')).toMatchObject({ kind: 'file', label: 'cli.py', parent: 'dir:simplicio_loop', subtitle: 'Python' })
    expect(graph.edges.map(pair)).toContain('file:simplicio_loop/cli.py > file:simplicio_loop/turbo_cli.py')
    expect(graph.edges.map(pair)).toContain('dir:tests > file:simplicio_loop/dev_cli.py')
  })

  it('colours files by architectural layer and never emits an edge to a missing node', () => {
    const graph = buildArchitecture(project, new Set(groupIds(project)))
    const index = flowIndex(graph)
    expect(index.byId.get('file:tests/test_dev_cli.py')?.tone).toBe('tests')
    expect(index.byId.get('file:docs/ARCHITECTURE.md')?.tone).toBe('docs')
    expect(index.byId.get('file:pyproject.toml')?.tone).toBe('config')
    for (const edge of graph.edges) { expect(index.byId.has(edge.from)).toBe(true); expect(index.byId.has(edge.to)).toBe(true) }
  })

  it('expands small projects fully and large ones only as far as a readable number of nodes', () => {
    expect(defaultExpanded(project).size).toBe(groupIds(project).length)
    const many = Array.from({ length: 300 }, (_, index) => ({ path: `pkg${index % 10}/sub${index % 3}/file${index}.py`, content: 'x = 1\n', size: 6 }))
    const big = buildProject({ name: 'big', files: many })
    const expanded = defaultExpanded(big)
    const graph = buildArchitecture(big, expanded)
    expect(graph.nodes.length).toBeLessThanOrEqual(60)
    expect(graph.nodes.filter((node) => node.kind === 'group' && node.collapsed).length).toBeGreaterThan(0)
  })

  it('caps the node count and says so', () => {
    const many = Array.from({ length: 50 }, (_, index) => ({ path: `f${index}.py`, content: 'x = 1\n', size: 6 }))
    const graph = buildArchitecture(buildProject({ name: 'flat', files: many }), new Set(), 10)
    expect(graph.nodes).toHaveLength(10)
    expect(graph.truncated).toBe(true)
  })
})

describe('entry flow view', () => {
  const entry = project.entries.find((candidate) => candidate.name === 'simplicio-loop')!

  it('starts at the entry point and follows calls to the depth limit', () => {
    const graph = buildEntryFlow(project, entry, { depth: 2 })
    expect(graph).toMatchObject({ kind: 'entry', direction: 'LR', title: 'simplicio-loop' })
    expect(graph.nodes[0]).toMatchObject({ id: 'simplicio_loop/cli.py::main', kind: 'entry', label: 'simplicio-loop' })
    const labels = graph.nodes.map((node) => node.label)
    expect(labels).toEqual(expect.arrayContaining(['print_usage', 'orient', 'run_turbo_command', 'parse_options', 'build_tasks', 'apply_plan', 'run_with_provider', 'request_plan', 'run_verify', 'repair_plan', 'emit', 'survey']))
    expect(labels).not.toContain('mentioned_paths')
    expect(graph.edges.map(pair)).toContain('simplicio_loop/cli.py::main > simplicio_loop/turbo_cli.py::run_turbo_command')
  })

  it('counts callees that are not shown yet so a node can be expanded', () => {
    const graph = buildEntryFlow(project, entry, { depth: 2 })
    const buildTasks = flowIndex(graph).byId.get('simplicio_loop/turbo_cli.py::build_tasks')!
    expect(buildTasks.hidden).toBe(2)
    const expanded = buildEntryFlow(project, entry, { depth: 2, expanded: new Set([buildTasks.id]) })
    expect(expanded.nodes.map((node) => node.label)).toEqual(expect.arrayContaining(['split_request', 'mentioned_paths']))
    expect(flowIndex(expanded).byId.get(buildTasks.id)?.hidden).toBeUndefined()
  })

  it('draws conditional calls as dashed edges and merges shared callees into one node', () => {
    const graph = buildEntryFlow(project, entry, { depth: 3 })
    const index = flowIndex(graph)
    const guarded = graph.edges.find((edge) => edge.from.endsWith('::run_turbo_command') && edge.to.endsWith('::apply_plan'))!
    const plain = graph.edges.find((edge) => edge.from.endsWith('::run_turbo_command') && edge.to.endsWith('::parse_options'))!
    expect(guarded.dashed).toBe(true)
    expect(plain.dashed).toBeFalsy()
    expect(graph.nodes.filter((node) => node.label === 'emit')).toHaveLength(1)
    expect(index.incoming.get('simplicio_loop/report.py::emit')!.length).toBeGreaterThan(2)
  })

  it('adds a subtitle with file and line and a one-line summary from the docstring', () => {
    const node = flowIndex(buildEntryFlow(project, entry, { depth: 2 })).byId.get('simplicio_loop/turbo_cli.py::run_turbo_command')!
    expect(node.subtitle).toBe('turbo_cli.py:9')
    expect(node.summary).toBe('Survey the repository, plan each task, apply the plans and verify the result.')
  })

  it('stops at the node cap and marks the graph truncated', () => {
    const graph = buildEntryFlow(project, entry, { depth: 5, maxNodes: 6 })
    expect(graph.nodes).toHaveLength(6)
    expect(graph.truncated).toBe(true)
  })

  it('handles an entry whose symbol has no calls', () => {
    const lone = project.entries.find((candidate) => candidate.name === 'main')!
    const graph = buildEntryFlow(project, lone, { depth: 2 })
    expect(ids(graph)).toContain(lone.symbol)
    expect(graph.truncated).toBeFalsy()
  })
})
