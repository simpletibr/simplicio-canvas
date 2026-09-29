import { describe, expect, it } from 'vitest'
import providerTrace from '../fixtures/traces/turbo-provider.trace.jsonl?raw'
import { flowIndex } from '../src/domain/flow-graph'
import { simulate } from '../src/domain/simulate'
import { parseTrace } from '../src/domain/trace'
import { traceToFlow } from '../src/domain/trace-flow'
import { nodeOf, runState } from '../src/ui/run-state'

describe('run state (what the canvas highlights at each replay step)', () => {
  const sim = simulate('adicione um campo telefone no cadastro.html', { kind: 'loop' }, { locale: 'en' })
  const events = sim.trace.events

  it('marks earlier nodes done, the current one active, later ones future and untouched branches off', () => {
    const state = runState(sim.graph, events, 3)
    expect(state.activeNode).toBe('plan_request')
    expect(['skill', 'cli', 'survey'].map((id) => state.nodes.get(id)?.cls)).toEqual(['done', 'done', 'done'])
    expect(state.nodes.get('plan_request')?.cls).toBe('active')
    expect(['host_model', 'apply', 'verify', 'fix', 'done'].map((id) => state.nodes.get(id)?.cls)).toEqual(['future', 'future', 'future', 'future', 'future'])
    expect(['fanout', 'ordered', 'provider_call', 'queue_list', 'pr'].map((id) => state.nodes.get(id)?.cls)).toEqual(['off', 'off', 'off', 'off', 'off'])
  })

  it('highlights the edge that leads into the active step, earlier edges as done and later ones as future', () => {
    const state = runState(sim.graph, events, 3)
    expect(state.edges.get('survey->plan_request:next')).toBe('active')
    expect(state.edges.get('skill->cli:next')).toBe('done')
    expect(state.edges.get('plan_request->host_model:next')).toBe('future')
    expect(state.edges.get('plan_request->fanout:branch')).toBe('off')
  })

  it('carries the uncertainty of a step onto its node, even before the replay reaches it', () => {
    expect(runState(sim.graph, events, 0).nodes.get('fix')?.status).toBe('unknown')
    expect(runState(sim.graph, events, 0).nodes.get('apply')?.status).toBe('ok')
  })

  it('handles a queue that visits the same node twice', () => {
    const queue = simulate('resolva todas as issues', { kind: 'loop' }, { locale: 'en' })
    const firstPass = queue.trace.events.findIndex((event) => event.attrs.node === 'survey')
    const secondPass = queue.trace.events.findIndex((event, at) => at > firstPass && event.attrs.node === 'survey')
    expect(runState(queue.graph, queue.trace.events, firstPass).nodes.get('survey')?.cls).toBe('active')
    expect(runState(queue.graph, queue.trace.events, firstPass + 1).nodes.get('survey')?.cls).toBe('done')
    expect(runState(queue.graph, queue.trace.events, secondPass).nodes.get('survey')?.cls).toBe('active')
    expect(runState(queue.graph, queue.trace.events, secondPass).edges.get('pr->survey:branch')).toBe('active')
  })

  it('for a real trace every event is its own node and the active edges are the incoming ones', () => {
    const trace = parseTrace(providerTrace).trace!
    const graph = traceToFlow(trace)
    const index = flowIndex(graph)
    const at = trace.events.findIndex((event) => event.id === 'call-2')
    expect(nodeOf(trace.events[at])).toBe('call-2')
    const state = runState(graph, trace.events, at)
    expect(state.activeNode).toBe('call-2')
    expect(state.edges.get('call-1->call-2:next')).toBe('active')
    expect(state.nodes.get('call-1')?.cls).toBe('done')
    expect(state.nodes.get('verify-2')?.cls).toBe('future')
    for (const id of index.byId.keys()) expect(state.nodes.has(id)).toBe(true)
  })

  it('clamps an out-of-range index', () => {
    expect(runState(sim.graph, events, 999).activeNode).toBe(nodeOf(events[events.length - 1]))
    expect(runState(sim.graph, [], 0).activeNode).toBeUndefined()
  })
})
