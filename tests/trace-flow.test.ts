import { describe, expect, it } from 'vitest'
import providerRaw from '../fixtures/traces/turbo-provider.run.json?raw'
import { flowIndex } from '../src/domain/flow-graph'
import { buildTrace } from '../src/domain/trace'
import { traceToFlow } from '../src/domain/trace-flow'
import { turboToTrace } from '../src/domain/turbo'

const trace = (events: unknown[]) => { const result = buildTrace(events); expect(result.issues).toEqual([]); return result.trace! }
const pairs = (graph: ReturnType<typeof traceToFlow>, kind?: string) => graph.edges.filter((edge) => !kind || edge.kind === kind).map((edge) => `${edge.from}>${edge.to}`)

describe('trace → flow graph', () => {
  it('chains sequential siblings and hangs first children off their parent', () => {
    const graph = traceToFlow(trace([
      { id: 'run', kind: 'step', name: 'run', start: 0, end: 10 },
      { id: 's1', parent: 'run', kind: 'tool', name: 'survey', start: 0, end: 1 },
      { id: 's2', parent: 'run', kind: 'llm_call', name: 'plan', start: 1, end: 4 },
      { id: 's3', parent: 'run', kind: 'verify', name: 'verify', start: 4, end: 5 },
      { id: 'c1', parent: 's2', kind: 'tool', name: 'inner', start: 1.5, end: 2 },
    ]))
    expect(pairs(graph, 'next')).toEqual(['s1>s2', 's2>s3'])
    expect(pairs(graph, 'contains').sort()).toEqual(['run>s1', 's2>c1'])
    expect(graph.edges.filter((edge) => edge.kind === 'contains').every((edge) => edge.dashed)).toBe(true)
    expect(graph.kind).toBe('trace')
    expect(graph.direction).toBe('TB')
  })

  it('forks and joins overlapping siblings instead of inventing an order between them', () => {
    const graph = traceToFlow(trace([
      { id: 'a', kind: 'step', name: 'A', start: 0, end: 1 },
      { id: 'b', kind: 'llm_call', name: 'B', start: 1, end: 5 },
      { id: 'c', kind: 'llm_call', name: 'C', start: 2, end: 4 },
      { id: 'd', kind: 'step', name: 'D', start: 6, end: 7 },
    ]))
    expect(pairs(graph, 'next').sort()).toEqual(['a>b', 'a>c', 'b>d', 'c>d'])
  })

  it('treats events without an end as points, ordered by start then file order', () => {
    const graph = traceToFlow(trace([
      { id: 'a', kind: 'step', name: 'A', start: 0 },
      { id: 'b', kind: 'step', name: 'B', start: 0 },
      { id: 'c', kind: 'step', name: 'C', start: 0 },
    ]))
    expect(pairs(graph, 'next')).toEqual(['a>b', 'b>c'])
  })

  it('links several roots one after the other', () => {
    const graph = traceToFlow(trace([
      { id: 'r1', kind: 'step', name: 'first', start: 0, end: 2 },
      { id: 'r2', kind: 'step', name: 'second', start: 2, end: 3 },
    ]))
    expect(pairs(graph, 'next')).toEqual(['r1>r2'])
  })

  it('summarises LLM calls on their card: provider, tokens and latency', () => {
    const graph = traceToFlow(trace([{ id: 'l', kind: 'llm_call', name: 'plan', start: 0, end: 1.9, status: 'ok', attrs: { model: 'm', provider: 'DeepInfra', prompt_tokens: 2400, completion_tokens: 120, latency_s: 1.9 } }]))
    const node = flowIndex(graph).byId.get('l')!
    expect(node).toMatchObject({ kind: 'llm_call', label: 'plan', status: 'ok' })
    expect(node.badges).toEqual(expect.arrayContaining(['DeepInfra', '1.9s']))
    expect(node.badges?.join(' ')).toMatch(/2\.4k.*120/)
  })

  it('carries the status and shows measured durations as the subtitle', () => {
    const graph = traceToFlow(trace([{ id: 'x', kind: 'command', name: 'pytest', start: 0, end: 0.42, status: 'error' }]))
    expect(flowIndex(graph).byId.get('x')).toMatchObject({ status: 'error', subtitle: '420ms' })
  })

  it('never links siblings across different parents', () => {
    const graph = traceToFlow(trace([
      { id: 'p', kind: 'step', name: 'p', start: 0, end: 9 },
      { id: 'q', kind: 'step', name: 'q', start: 0, end: 9 },
      { id: 'p1', parent: 'p', kind: 'step', name: 'p1', start: 1, end: 2 },
      { id: 'q1', parent: 'q', kind: 'step', name: 'q1', start: 3, end: 4 },
    ]))
    expect(pairs(graph, 'next')).not.toContain('p1>q1')
  })

  it('renders the converted turbo run as a readable chain', () => {
    const converted = turboToTrace(providerRaw).trace!
    const graph = traceToFlow(converted)
    expect(graph.nodes).toHaveLength(converted.events.length)
    expect(pairs(graph, 'next')).toEqual(['survey>call-1', 'call-1>call-2', 'call-2>call-3', 'call-3>call-4', 'call-4>apply', 'apply>verify-1', 'verify-1>repair', 'repair>reapply', 'reapply>verify-2'])
    expect(pairs(graph, 'contains')).toEqual(['run>survey'])
  })

  it('stays fast and linear-ish for a long sequential trace', () => {
    const events = Array.from({ length: 3000 }, (_, index) => ({ id: `e${index}`, kind: 'step', name: `s${index}`, start: index, end: index + 0.5 }))
    const started = performance.now()
    const graph = traceToFlow(trace(events))
    expect(graph.edges).toHaveLength(2999)
    expect(performance.now() - started).toBeLessThan(1500)
  })
})
