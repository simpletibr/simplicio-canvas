import { describe, expect, it } from 'vitest'
import { EXAMPLE_ARTIFACTS, EXAMPLE_FILES, EXAMPLE_NAME } from '../src/example'
import { flowIndex } from '../src/domain/flow-graph'
import { LOCALES } from '../src/domain/locale'
import { createPlayer, dwellFor, playerReducer } from '../src/domain/player'
import { buildProject } from '../src/domain/project'
import { LOOP_FLOW, simulate, type SimulationResult } from '../src/domain/simulate'
import { parseTrace, serializeTrace } from '../src/domain/trace'

const loop = (request: string, locale: 'pt-BR' | 'en' = 'en') => simulate(request, { kind: 'loop' }, { locale })
const nodes = (result: SimulationResult) => result.trace.events.map((event) => event.attrs.node as string)

describe('simplicio-loop simulation: branch choice from the request text', () => {
  it('one task: the host path with no fan-out or ordering', () => {
    const result = loop('adicione um campo telefone no cadastro.html')
    expect(nodes(result)).toEqual(['skill', 'cli', 'survey', 'plan_request', 'host_model', 'apply', 'verify', 'fix', 'done'])
    expect(result.shape).toMatchObject({ kind: 'single', provider: false, queue: false })
  })

  it('several independent tasks: fan-out before the plan is written', () => {
    const result = loop('1) adicione telefone no cadastro.html 2) corrija o teste em tests/test_api.py')
    expect(nodes(result)).toEqual(['skill', 'cli', 'survey', 'plan_request', 'fanout', 'host_model', 'apply', 'verify', 'fix', 'done'])
    expect(result.shape?.kind).toBe('independent')
  })

  it('tasks on the same file: run in order', () => {
    const result = loop('adicione validação em app.py; depois renomeie a função em app.py')
    expect(nodes(result)).toEqual(['skill', 'cli', 'survey', 'plan_request', 'ordered', 'host_model', 'apply', 'verify', 'fix', 'done'])
  })

  it('mixed lanes: fan-out then in-order', () => {
    expect(nodes(loop('- ajustar a.py\n- ajustar b.py\n- testar a.py'))).toEqual(['skill', 'cli', 'survey', 'plan_request', 'fanout', 'ordered', 'host_model', 'apply', 'verify', 'fix', 'done'])
  })

  it('a queue request: list the items, then the same steps per item with a PR each', () => {
    const result = loop('resolva todas as issues')
    expect(nodes(result)).toEqual([
      'skill', 'cli', 'queue_list',
      'survey', 'plan_request', 'host_model', 'apply', 'verify', 'fix', 'pr',
      'survey', 'plan_request', 'host_model', 'apply', 'verify', 'fix', 'pr',
      'done',
    ])
    expect(result.trace.events.filter((event) => event.attrs.node === 'pr')).toHaveLength(2)
    const second = result.trace.events.filter((event) => event.attrs.item === 2)
    expect(second.length).toBeGreaterThan(5)
    expect(second.every((event) => event.status === 'unknown')).toBe(true)
    expect(result.trace.events.filter((event) => event.attrs.item === 1).some((event) => event.status === 'ok')).toBe(true)
  })

  it('an explicit provider mode: the engine calls the model itself, with a hedged request that may or may not happen', () => {
    const result = loop('adicione telefone no cadastro.html --provider openrouter')
    expect(nodes(result)).toEqual(['skill', 'cli', 'survey', 'plan_request', 'provider_call', 'provider_hedge', 'apply', 'verify', 'fix', 'done'])
    expect(result.trace.events.find((event) => event.attrs.node === 'provider_hedge')?.status).toBe('unknown')
    expect(nodes(result)).not.toContain('host_model')
  })

  it('provider mode with more than three tasks warms the cache first', () => {
    const result = loop('- a.py x\n- b.py x\n- c.py x\n- d.py x\n- e.py x --provider openrouter')
    expect(nodes(result)).toEqual(expect.arrayContaining(['fanout', 'provider_warm', 'provider_call']))
    expect(nodes(result).indexOf('provider_warm')).toBeLessThan(nodes(result).indexOf('provider_call'))
    expect(nodes(loop('a.py x; b.py y --provider openrouter'))).not.toContain('provider_warm')
  })

  it('marks the repair step as unknown: it only happens if something fails', () => {
    const result = loop('adicione telefone no cadastro.html')
    expect(result.trace.events.find((event) => event.attrs.node === 'fix')?.status).toBe('unknown')
    expect(result.trace.events.find((event) => event.attrs.node === 'apply')?.status).toBe('ok')
  })
})

describe('simulation output contract', () => {
  const requests = ['adicione um campo telefone no cadastro.html', '1) a.py x 2) b.py y', 'a.py x; depois a.py y', 'resolva todas as issues', 'x em app.py --provider openrouter', '']

  it.each(LOCALES.flatMap((locale) => requests.map((request) => [locale, request] as const)))('every step has an explanation and a node that exists in the flow (%s, %j)', (locale, request) => {
    const result = loop(request, locale)
    const known = flowIndex(result.graph)
    expect(result.trace.events.length).toBeGreaterThan(4)
    for (const event of result.trace.events) {
      expect(event.attrs.simulated).toBe(true)
      expect(typeof event.attrs.explanation).toBe('string')
      expect((event.attrs.explanation as string).length).toBeGreaterThan(80)
      expect(event.attrs.explanation as string).not.toMatch(/\{[a-z]+\}|undefined|NaN/)
      expect(known.byId.has(event.attrs.node as string), `${event.id} → ${event.attrs.node}`).toBe(true)
    }
  })

  it('walks only along edges of the flow, so the active edge can always be highlighted', () => {
    for (const request of requests) {
      const result = loop(request)
      const known = flowIndex(result.graph)
      const path = nodes(result)
      for (let at = 1; at < path.length; at += 1) {
        expect(known.out.get(path[at - 1])?.some((edge) => edge.to === path[at]), `${request}: ${path[at - 1]} → ${path[at]}`).toBe(true)
      }
    }
  })

  it('emits a synthetic simplicio.trace/v1 that survives a round trip', () => {
    const result = loop('resolva todas as issues')
    const again = parseTrace(serializeTrace(result.trace))
    expect(again.issues).toEqual([])
    expect(again.trace?.header.synthetic).toBe(true)
    expect(again.trace?.events).toEqual(result.trace.events)
  })

  it('writes the explanation in the requested language and includes every part', () => {
    const pt = loop('adicione um campo telefone no cadastro.html', 'pt-BR').trace.events[1].attrs.explanation as string
    const en = loop('adicione um campo telefone no cadastro.html', 'en').trace.events[1].attrs.explanation as string
    expect(pt).toContain('O que acontece:')
    expect(pt).toContain('Por quê:')
    expect(pt).toContain('Entrada → saída:')
    expect(pt).toContain('Se falhar:')
    expect(pt).toContain('cadastro.html')
    expect(en).toContain('What happens:')
    expect(en).toContain('If it fails:')
    expect(pt).not.toEqual(en)
  })

  it('has both languages for every text of the flow data file', () => {
    const missing: string[] = []
    const visit = (value: unknown, path: string) => {
      if (value && typeof value === 'object') {
        const record = value as Record<string, unknown>
        if ('pt-BR' in record || 'en' in record) { for (const locale of LOCALES) if (typeof record[locale] !== 'string' || !(record[locale] as string).trim()) missing.push(`${path}.${locale}`); return }
        for (const [key, child] of Object.entries(record)) visit(child, `${path}.${key}`)
      }
    }
    visit(LOOP_FLOW, 'flow')
    expect(missing).toEqual([])
    expect(LOOP_FLOW.nodes.every((node) => ['what', 'why', 'input', 'output', 'failure'].every((part) => node.explain[part as 'what'] !== undefined))).toBe(true)
  })

  it('never reports a token count or cost for a simulated model step', () => {
    for (const event of loop('x em app.py --provider openrouter').trace.events) for (const key of ['prompt_tokens', 'completion_tokens', 'cost_usd', 'latency_s']) expect(event.attrs).not.toHaveProperty(key)
  })

  it('lets the player drive a simulated trace to the end', () => {
    const { trace } = loop('resolva todas as issues')
    let state = playerReducer(createPlayer(trace.events.map(dwellFor), 4), { type: 'play' })
    for (let frame = 0; frame < 5000 && state.playing; frame += 1) state = playerReducer(state, { type: 'tick', dt: 16 })
    expect(state).toMatchObject({ index: trace.events.length - 1, finished: true, playing: false })
  })
})

describe('static walk of a project entry point', () => {
  const project = buildProject({ name: EXAMPLE_NAME, files: EXAMPLE_FILES, artifacts: EXAMPLE_ARTIFACTS })
  const entry = project.entries.find((candidate) => candidate.name === 'simplicio-loop')!
  const walk = (request: string, locale: 'pt-BR' | 'en' = 'pt-BR', depth = 2) => simulate(request, { kind: 'entry', project, entry, depth }, { locale })
  const label = (id: string) => id.split('::')[1] ?? id

  it('walks the call graph from the entry point in call order, depth-limited', () => {
    const result = walk('turbo adicione um campo no cadastro.html')
    expect(nodes(result).map(label)).toEqual(['main', 'print_usage', 'emit', 'run_turbo_command', 'parse_options', 'build_tasks', 'survey', 'apply_plan', 'run_with_provider', 'request_plan', 'run_verify', 'repair_plan', 'emit', 'orient', 'survey', 'emit'])
    expect(result.graph.kind).toBe('simulation')
    expect(result.trace.events[0]).toMatchObject({ parent: null, kind: 'step' })
    expect(result.trace.events[1].parent).toBe(result.trace.events[0].id)
  })

  it('marks branches that static analysis cannot decide as unknown and leaves unconditional calls certain', () => {
    const result = walk('turbo x')
    const status = (name: string, nth = 0) => result.trace.events.filter((event) => label(event.attrs.node as string) === name)[nth].status
    expect(status('main')).toBe('ok')
    expect(status('print_usage')).toBe('unknown')
    expect(status('run_turbo_command')).toBe('unknown')
    expect(status('parse_options')).toBe('ok')
    expect(status('apply_plan')).toBe('unknown')
    expect(status('run_with_provider')).toBe('unknown')
    expect(status('request_plan')).toBe('unknown')
    expect(status('orient')).toBe('unknown')
    const guarded = result.trace.events.find((event) => label(event.attrs.node as string) === 'apply_plan')!
    expect(guarded.attrs.explanation as string).toContain('options["apply"]')
    const orient = result.trace.events.find((event) => label(event.attrs.node as string) === 'orient')!
    expect(orient.attrs.explanation as string).toContain('return')
  })

  it('explains each step from static facts only: docstring, signature, callers and callees', () => {
    const result = walk('turbo x')
    const run = result.trace.events.find((event) => label(event.attrs.node as string) === 'run_turbo_command')!
    const text = run.attrs.explanation as string
    expect(text).toContain('Survey the repository, plan each task, apply the plans and verify the result.')
    expect(text).toContain('`main`')
    expect(text).toContain('parse_options')
    expect(text).toContain('argv')
    const parts = run.attrs.explanation_parts as Record<string, unknown>
    expect(Object.keys(parts)).toEqual(expect.arrayContaining(['what', 'why', 'io', 'failure']))
  })

  it('shows the request at the entry step and notes when the request names something in the code', () => {
    const result = walk('rode o orient no repositório')
    expect(result.trace.events[0].attrs.explanation as string).toContain('rode o orient no repositório')
    expect(result.trace.events.find((event) => label(event.attrs.node as string) === 'orient')?.attrs.explanation as string).toContain('O pedido menciona `orient`')
  })

  it('every step has an explanation, a node in the graph and (except the entry) an edge from its caller', () => {
    for (const locale of LOCALES) {
      const result = walk('turbo x', locale)
      const known = flowIndex(result.graph)
      const byId = new Map(result.trace.events.map((event) => [event.id, event]))
      for (const event of result.trace.events) {
        expect(event.attrs.simulated).toBe(true)
        expect((event.attrs.explanation as string).length).toBeGreaterThan(30)
        expect(known.byId.has(event.attrs.node as string)).toBe(true)
        if (event.parent) expect(known.out.get(byId.get(event.parent)!.attrs.node as string)?.some((edge) => edge.to === event.attrs.node)).toBe(true)
      }
    }
  })

  it('repeated callees are explained once and marked as revisits afterwards', () => {
    const emits = walk('turbo x').trace.events.filter((event) => label(event.attrs.node as string) === 'emit')
    expect(emits.map((event) => Boolean(event.attrs.revisit))).toEqual([false, true, true])
  })

  it('follows deeper when asked and stops at the step budget', () => {
    expect(walk('x', 'pt-BR', 3).trace.events.length).toBeGreaterThan(walk('x', 'pt-BR', 2).trace.events.length)
    const short = simulate('x', { kind: 'entry', project, entry, depth: 6, maxSteps: 5 }, { locale: 'en' })
    expect(short.trace.events).toHaveLength(5)
    expect(short.notes.join(' ')).toMatch(/5/)
  })

  it('turns an ambiguous call into an unknown step instead of guessing a target', () => {
    const files = [{ path: 'a.py', content: 'def start():\n    """Start."""\n    go()\n', size: 40 }, { path: 'b.py', content: 'def go():\n    pass\n', size: 20 }, { path: 'c.py', content: 'def go():\n    pass\n', size: 20 }]
    const artifacts = {
      symbolIndex: { schema: 'simplicio.symbol-index/v1', symbols: ['a.py::start:1', 'b.py::go:1', 'c.py::go:1'].map((item) => { const [id, line] = [item.slice(0, item.lastIndexOf(':')), Number(item.slice(item.lastIndexOf(':') + 1))]; return { name: id.split('::')[1], qualified_name: id, kind: 'function', language: 'python', defined_in: id.split('::')[0], line } }) },
      callGraph: { schema: 'simplicio.call-graph/v1', edges: [{ type: 'calls', source_file: 'a.py', source_symbol: 'a.py::start', target_file: 'b.py', target_symbol: 'b.py::go', line: 3, resolution_status: 'ambiguous', target_candidates: ['b.py::go', 'c.py::go'] }] },
    }
    const small = buildProject({ name: 'small', files, artifacts })
    const result = simulate('x', { kind: 'entry', project: small, entry: { id: 'main:start', kind: 'main', name: 'start', symbol: 'a.py::start', file: 'a.py', line: 1, evidence: 'test' }, depth: 2 }, { locale: 'en' })
    expect(result.trace.events).toHaveLength(2)
    expect(result.trace.events[1]).toMatchObject({ status: 'unknown', parent: result.trace.events[0].id })
    expect(result.trace.events[1].attrs.explanation as string).toMatch(/more than one target/i)
    expect(flowIndex(result.graph).byId.get(result.trace.events[1].attrs.node as string)?.kind).toBe('external')
  })
})
