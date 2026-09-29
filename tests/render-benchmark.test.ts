import { describe, expect, it } from 'vitest'
import { buildArchitecture, buildEntryFlow, defaultExpanded, groupIds } from '../src/domain/flows'
import { layoutGraph } from '../src/domain/layout'
import { buildProject } from '../src/domain/project'
import { simulate } from '../src/domain/simulate'
import { parseTrace } from '../src/domain/trace'
import { traceToFlow } from '../src/domain/trace-flow'

/** Best of a few runs: one sample on a shared machine is noisy, the minimum is what the budget should judge. */
function best(times: number, work: () => void): number {
  let elapsed = Infinity
  for (let attempt = 0; attempt < times; attempt += 1) { const started = performance.now(); work(); elapsed = Math.min(elapsed, performance.now() - started) }
  return elapsed
}

/** A synthetic Python project: `packages` folders of `perPackage` modules with three functions each that call the next module. */
function bigProject(packages = 25, perPackage = 60) {
  const files: Array<{ path: string; content: string; size: number }> = []
  const symbols: unknown[] = []
  const edges: unknown[] = []
  for (let pkg = 0; pkg < packages; pkg += 1) {
    for (let mod = 0; mod < perPackage; mod += 1) {
      const path = `pkg${pkg}/mod${mod}.py`
      const next = mod + 1 < perPackage ? `pkg${pkg}/mod${mod + 1}.py` : null
      const content = `"""Module ${path}."""\nimport os\n${next ? `from pkg${pkg} import mod${mod + 1}\n` : ''}\n\ndef run():\n    """Run."""\n    return step()\n\n\ndef step():\n    return finish()\n\n\ndef finish():\n    return 1\n`
      files.push({ path, content, size: content.length })
      for (const [name, line] of [['run', 6], ['step', 10], ['finish', 14]] as const) symbols.push({ name, qualified_name: `${path}::${name}`, kind: 'function', language: 'python', defined_in: path, line })
      edges.push({ type: 'calls', source_file: path, source_symbol: `${path}::run`, target_file: path, target_symbol: `${path}::step`, line: 8, resolution_status: 'resolved' })
      edges.push({ type: 'calls', source_file: path, source_symbol: `${path}::step`, target_file: path, target_symbol: `${path}::finish`, line: 12, resolution_status: 'resolved' })
      if (next) edges.push({ type: 'calls', source_file: path, source_symbol: `${path}::finish`, target_file: next, target_symbol: `${next}::run`, line: 15, resolution_status: 'resolved' })
    }
  }
  files.push({ path: 'pyproject.toml', content: '[project.scripts]\ncli = "pkg0.mod0:run"\n', size: 40 })
  return buildProject({ name: 'big', files, artifacts: { symbolIndex: { schema: 'simplicio.symbol-index/v1', symbols }, callGraph: { schema: 'simplicio.call-graph/v1', edges } } })
}

describe('viewer performance budgets', () => {
  const started = performance.now()
  const project = bigProject()
  const buildMs = performance.now() - started

  it('models a 1,500-file, 4,500-symbol project quickly and detects its entry point', () => {
    expect(project.files.size).toBe(1501)
    expect(project.symbols.size).toBe(4500)
    expect(project.entries.map((entry) => entry.name)).toContain('cli')
    console.info(`benchmark: project model of 1,501 files / 4,500 symbols / 4,498 calls in ${buildMs.toFixed(0)}ms`)
    expect(buildMs).toBeLessThan(4000)
  })

  it('draws the architecture overview (collapsed folders) and a fully expanded 300-file slice interactively', () => {
    const overview = best(3, () => layoutGraph(buildArchitecture(project, defaultExpanded(project))))
    const some = new Set(groupIds(project).slice(0, 5))
    const expanded = best(3, () => layoutGraph(buildArchitecture(project, some)))
    console.info(`benchmark: architecture overview ${overview.toFixed(1)}ms, five folders expanded ${expanded.toFixed(1)}ms`)
    expect(overview).toBeLessThan(400)
    expect(expanded).toBeLessThan(800)
  })

  it('builds and lays out an entry flow that is cut at the node cap', () => {
    const entry = project.entries.find((candidate) => candidate.name === 'cli')!
    let nodes = 0
    const elapsed = best(3, () => { const graph = buildEntryFlow(project, entry, { depth: 500, maxNodes: 120 }); nodes = graph.nodes.length; layoutGraph(graph) })
    console.info(`benchmark: entry flow of ${nodes} nodes in ${elapsed.toFixed(1)}ms`)
    expect(nodes).toBe(120)
    expect(elapsed).toBeLessThan(400)
  })

  it('simulates a project entry point (60 steps) without a model', () => {
    const entry = project.entries.find((candidate) => candidate.name === 'cli')!
    const elapsed = best(3, () => { expect(simulate('run it', { kind: 'entry', project, entry, depth: 60 }, { locale: 'en' }).trace.events).toHaveLength(60) })
    console.info(`benchmark: 60-step simulation in ${elapsed.toFixed(1)}ms`)
    expect(elapsed).toBeLessThan(600)
  })

  it('parses, graphs and lays out a 2,000-event trace', () => {
    const text = Array.from({ length: 2000 }, (_, index) => JSON.stringify({ id: `e${index}`, parent: index % 50 === 0 ? null : `e${index - (index % 50)}`, kind: index % 3 === 0 ? 'llm_call' : 'tool', name: `event ${index}`, start: index * 0.1, end: index * 0.1 + 0.05, attrs: { prompt_tokens: 100 } })).join('\n')
    let events = 0
    const elapsed = best(3, () => { const { trace } = parseTrace(text); events = trace!.events.length; layoutGraph(traceToFlow(trace!)) })
    console.info(`benchmark: 2,000-event trace parsed, graphed and laid out in ${elapsed.toFixed(0)}ms`)
    expect(events).toBe(2000)
    expect(elapsed).toBeLessThan(4000)
  }, 60_000)
})
