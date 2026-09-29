import { describe, expect, it } from 'vitest'
import agentDemo from '../fixtures/traces/agent-demo.trace.jsonl?raw'
import blockedRun from '../fixtures/traces/turbo-blocked.run.json?raw'
import blockedTrace from '../fixtures/traces/turbo-blocked.trace.jsonl?raw'
import hostDocs from '../fixtures/traces/turbo-host.docs.jsonl?raw'
import hostTrace from '../fixtures/traces/turbo-host.trace.jsonl?raw'
import providerRun from '../fixtures/traces/turbo-provider.run.json?raw'
import providerTrace from '../fixtures/traces/turbo-provider.trace.jsonl?raw'
import { loadTraceText, SAMPLE_TRACES } from '../src/ui/loaders'
import { parseTrace, serializeTrace, traceIndex } from '../src/domain/trace'
import { turboToTrace } from '../src/domain/turbo'

describe('trace fixtures', () => {
  it.each([
    ['turbo-provider', providerRun, providerTrace, true],
    ['turbo-host', hostDocs, hostTrace, true],
    ['turbo-blocked', blockedRun, blockedTrace, false],
  ])('%s.trace.jsonl is exactly what the converter makes of its source document (run `npm run fixtures` after changing it)', (_name, source, committed, synthetic) => {
    const { trace, issues } = turboToTrace(source, { synthetic })
    expect(issues).toEqual([])
    expect(serializeTrace(trace!)).toBe(committed)
  })

  it('every committed trace is valid simplicio.trace/v1', () => {
    for (const text of [providerTrace, hostTrace, blockedTrace, agentDemo]) expect(parseTrace(text).issues.filter((issue) => issue.severity === 'error')).toEqual([])
  })

  it('the agent demo trace (written by the documented Python emitter) is out of order on purpose: children come before parents', () => {
    const { trace, issues } = parseTrace(agentDemo)
    expect(issues).toEqual([])
    expect(agentDemo.trim().split('\n').at(-1)).toContain('"parent": null')
    const index = traceIndex(trace!)
    expect(index.roots).toHaveLength(1)
    expect(index.children.get(index.roots[0].id)).toHaveLength(6)
    expect(trace!.events.filter((event) => event.kind === 'llm_call').every((event) => typeof event.attrs.prompt_preview === 'string' && typeof event.attrs.response_preview === 'string' && typeof event.attrs.cost_usd === 'number')).toBe(true)
    expect(trace!.events.find((event) => event.kind === 'command')?.status).toBe('error')
  })

  it('bundled samples are labelled as samples and load through the same path as user files', () => {
    expect(SAMPLE_TRACES).toHaveLength(3)
    for (const sample of SAMPLE_TRACES) {
      const { trace, issues } = loadTraceText(sample.text)
      expect(issues.filter((issue) => issue.severity === 'error'), sample.id).toEqual([])
      expect(trace?.header.synthetic, sample.id).toBe(true)
      expect(sample.title).toMatch(/sample/)
    }
  })

  it('loadTraceText picks the right importer for turbo documents and traces, and rejects garbage', () => {
    expect(loadTraceText(providerRun).trace?.events.length).toBe(11)
    expect(loadTraceText(agentDemo).trace?.events.length).toBe(7)
    expect(loadTraceText('').trace).toBeNull()
    expect(loadTraceText('hello world').trace).toBeNull()
  })
})
