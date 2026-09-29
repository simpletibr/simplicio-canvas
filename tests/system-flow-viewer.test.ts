import { execFile, execFileSync } from 'node:child_process'
import { cp, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import providerRun from '../fixtures/traces/turbo-provider.run.json?raw'
import { importRepository, defaultRunner, type BridgeRunner } from '../server/github-bridge'
import { EXAMPLE_ARTIFACTS } from '../src/example'
import { buildEntryFlow, buildArchitecture, defaultExpanded } from '../src/domain/flows'
import { layoutGraph } from '../src/domain/layout'
import { toMermaid } from '../src/domain/mermaid'
import { createPlayer, dwellFor, playerReducer } from '../src/domain/player'
import { buildProject } from '../src/domain/project'
import { simulate } from '../src/domain/simulate'
import { traceToFlow } from '../src/domain/trace-flow'
import { turboToTrace } from '../src/domain/turbo'
import { nodeOf, runState } from '../src/ui/run-state'

const run = promisify(execFile)
const exampleSource = path.resolve('fixtures/example/simplicio-loop')
const mapperAvailable = (() => { try { execFileSync('simplicio-mapper', ['--version'], { stdio: 'ignore' }); return true } catch { return false } })()

let workspace = ''
beforeEach(async () => { workspace = await mkdtemp(path.join(tmpdir(), 'canvas-system-')) })
afterEach(async () => { await rm(workspace, { recursive: true, force: true }) })

/** `git clone` is replaced by copying the bundled example, so the test needs no network. Everything else is the real bridge. */
const localClone: BridgeRunner['git'] = async (args) => {
  const target = args[args.length - 1]
  await cp(exampleSource, target, { recursive: true })
  await run('git', ['init', '-q', target])
  await run('git', ['-C', target, 'add', '-A'])
  await run('git', ['-C', target, '-c', 'user.email=canvas@example.invalid', '-c', 'user.name=canvas', 'commit', '-qm', 'snapshot'])
}

async function importThrough(mapper: BridgeRunner['mapper']) {
  const payload = await importRepository('https://github.com/octo/simplicio-loop-snapshot', { workspaceRoot: workspace, runner: { git: localClone, mapper } })
  return { payload, project: buildProject({ name: payload.name, files: payload.files, artifacts: payload.mapper.artifacts }) }
}

async function assertStaticFlowsAndSimulation(project: ReturnType<typeof buildProject>) {
  expect(project.entries.map((entry) => `${entry.kind}:${entry.name}`)).toEqual(['console_script:simplicio-loop', 'console_script:simplicio-loop-mcp', 'mcp_tool:simplicio_turbo', 'mcp_tool:simplicio_survey', 'main:main'])

  // Architecture: folders and imports; collapse-aware; exports to Mermaid.
  const architecture = buildArchitecture(project, defaultExpanded(project))
  expect(architecture.edges.some((edge) => edge.from.endsWith('turbo_cli.py') && edge.to.endsWith('turbo.py'))).toBe(true)
  expect(toMermaid(architecture)).toContain('subgraph g')

  // Flow of one entry point: entry → calls, laid out without overlap, exportable.
  const entry = project.entries[0]
  const flow = buildEntryFlow(project, entry, { depth: 3 })
  expect(flow.nodes[0]).toMatchObject({ kind: 'entry', label: 'simplicio-loop' })
  expect(flow.nodes.map((node) => node.label)).toEqual(expect.arrayContaining(['run_turbo_command', 'apply_plan', 'apply_operations']))
  expect(layoutGraph(flow).positions.size).toBe(flow.nodes.length)
  expect(toMermaid(flow).startsWith('flowchart LR')).toBe(true)

  // Simulation of a request along that entry point, replayed to the end.
  const result = simulate('turbo adicione um campo no cadastro.html', { kind: 'entry', project, entry, depth: 3 }, { locale: 'pt-BR' })
  expect(result.trace.events.length).toBeGreaterThan(10)
  let player = playerReducer(createPlayer(result.trace.events.map(dwellFor), 4), { type: 'play' })
  while (player.playing) player = playerReducer(player, { type: 'tick', dt: 50 })
  expect(player).toMatchObject({ finished: true, index: result.trace.events.length - 1 })
}

describe('system: GitHub link → local bridge → static flows → simulation', () => {
  it('works end to end with the Mapper artifacts of the bundled example (no Mapper needed)', async () => {
    const fake: BridgeRunner['mapper'] = async (target) => {
      await mkdir(path.join(target, '.simplicio-loop'), { recursive: true })
      const write = (name: string, value: unknown) => writeFile(path.join(target, '.simplicio-loop', name), JSON.stringify(value))
      await write('project-map.json', EXAMPLE_ARTIFACTS.projectMap)
      await write('call-graph.json', EXAMPLE_ARTIFACTS.callGraph)
      await write('symbol-index.json', EXAMPLE_ARTIFACTS.symbolIndex)
    }
    const { payload, project } = await importThrough(fake)
    expect(payload.mapper).toMatchObject({ available: true, status: 'completed' })
    expect(payload.files.some((file) => file.path.startsWith('.simplicio-loop'))).toBe(false)
    await assertStaticFlowsAndSimulation(project)
  })

  it.skipIf(!mapperAvailable)('works end to end with a real `simplicio-mapper scan`', async () => {
    const { payload, project } = await importThrough(defaultRunner.mapper)
    expect(payload.mapper.available).toBe(true)
    expect(project.symbols.size).toBeGreaterThan(30)
    await assertStaticFlowsAndSimulation(project)
  }, 180_000)

  it('degrades to the architecture view when Mapper is missing, and says why', async () => {
    const { payload, project } = await importThrough(async () => { throw Object.assign(new Error('spawn simplicio-mapper ENOENT'), { code: 'ENOENT' }) })
    expect(payload.mapper).toMatchObject({ available: false, status: 'basic-analysis' })
    expect(project.entries).toEqual([])
    expect(buildArchitecture(project, defaultExpanded(project)).nodes.length).toBeGreaterThan(10)
  })
})

describe('system: real run → trace → replay', () => {
  it('replays a turbo run step by step: exactly one active node per step, ending on the last event', () => {
    const { trace, issues } = turboToTrace(providerRun)
    expect(issues).toEqual([])
    const graph = traceToFlow(trace!)
    let player = playerReducer(createPlayer(trace!.events.map(dwellFor), 4), { type: 'play' })
    const seen: string[] = []
    while (player.playing) {
      const state = runState(graph, trace!.events, player.index)
      expect([...state.nodes.values()].filter((node) => node.cls === 'active')).toHaveLength(1)
      expect(state.activeNode).toBe(nodeOf(trace!.events[player.index]))
      if (seen.at(-1) !== state.activeNode) seen.push(state.activeNode!)
      player = playerReducer(player, { type: 'tick', dt: 40 })
    }
    expect(seen).toEqual(trace!.events.map((event) => event.id))
    expect(player.finished).toBe(true)
  })
})
