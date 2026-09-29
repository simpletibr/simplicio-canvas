import { describe, expect, it } from 'vitest'
import blockedRaw from '../fixtures/traces/turbo-blocked.run.json?raw'
import hostRaw from '../fixtures/traces/turbo-host.docs.jsonl?raw'
import providerRaw from '../fixtures/traces/turbo-provider.run.json?raw'
import { parseTrace, serializeTrace, type TraceEvent } from '../src/domain/trace'
import { looksLikeTurbo, turboToTrace } from '../src/domain/turbo'

const byId = (events: TraceEvent[]) => new Map(events.map((event) => [event.id, event]))
const provider = () => JSON.parse(providerRaw) as Record<string, unknown>
const converted = (input: unknown, synthetic = false) => {
  const result = turboToTrace(input, { synthetic })
  expect(result.issues.filter((issue) => issue.severity === 'error')).toEqual([])
  return result.trace!
}

describe('turbo-run → trace (provider mode, simplicio-loop 3.45.0)', () => {
  const trace = converted(providerRaw, true)
  const events = byId(trace.events)

  it('lays out the fixed turbo flow: survey → model calls → apply → verify → repair → re-apply → verify', () => {
    expect(trace.events.map((event) => `${event.kind}:${event.id}`)).toEqual([
      'step:run', 'tool:survey', 'llm_call:call-1', 'llm_call:call-2', 'llm_call:call-3', 'llm_call:call-4',
      'file_edit:apply', 'verify:verify-1', 'llm_call:repair', 'file_edit:reapply', 'verify:verify-2',
    ])
    expect(trace.events.filter((event) => event.parent === 'run')).toHaveLength(trace.events.length - 1)
  })

  it('carries every LLM call with model, provider, tokens, latency and the warm/hedged flags', () => {
    expect(events.get('call-1')).toMatchObject({ kind: 'llm_call', status: 'ok', attrs: { model: 'deepseek/deepseek-v4.1-flash', provider: 'DeepInfra', prompt_tokens: 5120, cached_tokens: 0, completion_tokens: 96, latency_s: 2.84, warm: true, hedged: false } })
    expect(events.get('call-1')?.name).toMatch(/warm/i)
    expect(events.get('call-3')?.attrs).toMatchObject({ hedged: true, provider: 'Together' })
    expect(events.get('call-3')?.name).toMatch(/hedged/i)
    const first = events.get('call-1')!
    expect((first.end ?? 0) - first.start).toBeCloseTo(2.84, 5)
    expect(events.get('call-2')!.start).toBeCloseTo(2.84, 5)
  })

  it('does not invent per-call cost or previews that turbo-run/v1 does not report', () => {
    for (const id of ['call-1', 'call-2', 'call-3', 'call-4', 'repair']) {
      expect(events.get(id)!.attrs).not.toHaveProperty('cost_usd')
      expect(events.get(id)!.attrs).not.toHaveProperty('prompt_preview')
    }
  })

  it('puts the run totals on the root step', () => {
    expect(events.get('run')).toMatchObject({ kind: 'step', status: 'ok', start: 0, attrs: { model: 'deepseek/deepseek-v4.1-flash', tasks: 4, model_calls: 5, hedged_calls: 1, cost_usd: 0.001884, cache_hit_pct: 73.7, wall_s: 11.42, repo: 'calc-demo', reasoning: 'off' } })
    expect(events.get('run')!.attrs.tokens).toEqual({ prompt_tokens: 27785, cached_tokens: 20480, completion_tokens: 664, reasoning_tokens: 0 })
    expect(events.get('run')!.end).toBeCloseTo(11.42, 5)
  })

  it('models the verify retry: first verify fails, the last call is the repair call, then apply and verify again', () => {
    expect(events.get('verify-1')).toMatchObject({ status: 'error', attrs: { command: 'python -m pytest -q', passed: false } })
    expect(events.get('repair')).toMatchObject({ kind: 'llm_call', attrs: { latency_s: 1.78, purpose: 'repair' } })
    expect(events.get('reapply')).toMatchObject({ kind: 'file_edit', status: 'ok' })
    expect(events.get('verify-2')).toMatchObject({ status: 'ok', attrs: { passed: true, returncode: 0 } })
    expect(String(events.get('verify-2')!.attrs.output_tail)).toContain('6 passed')
  })

  it('marks the trace as a sample and never leaks the machine path of the repository', () => {
    expect(trace.header).toMatchObject({ synthetic: true, source: expect.stringContaining('turbo-run/v1') })
    expect(serializeTrace(trace)).not.toContain('/work/')
    const other = serializeTrace(converted({ ...provider(), repo: '/Users/alice/private-project' }))
    expect(other).not.toContain('/Users/alice')
    expect(other).toContain('private-project')
  })

  it('is valid simplicio.trace/v1 after a serialization round trip', () => {
    const again = parseTrace(serializeTrace(trace))
    expect(again.issues).toEqual([])
    expect(again.trace?.events).toEqual(trace.events)
  })
})

describe('turbo-run → trace (other outcomes)', () => {
  it('shows rejected lanes under the apply step and marks the run failed', () => {
    const trace = converted({ ...provider(), status: 'failed', applied: [1], failed: [{ tasks: [2], applied: false, reason: 'plan_find_not_found' }], verify: null, verify_retry: undefined, calls: (provider().calls as unknown[]).slice(0, 2), model_calls: 2 })
    const events = byId(trace.events)
    expect(events.get('run')?.status).toBe('error')
    expect(events.get('apply')).toMatchObject({ status: 'error', attrs: { applied: [1] } })
    expect(events.get('apply-failed-1')).toMatchObject({ parent: 'apply', status: 'error', attrs: { tasks: [2], reason: 'plan_find_not_found' } })
    expect(trace.events.some((event) => event.kind === 'verify')).toBe(false)
  })

  it('ends after apply when no verify command was given', () => {
    const trace = converted({ ...provider(), verify: null, verify_retry: undefined, calls: (provider().calls as unknown[]).slice(0, 4), model_calls: 4 })
    expect(trace.events.at(-1)).toMatchObject({ id: 'apply', status: 'ok' })
  })

  it('reports a blocked run (the real document printed without OPENROUTER_API_KEY)', () => {
    const trace = converted(blockedRaw)
    expect(trace.events.map((event) => event.id)).toEqual(['run', 'blocked'])
    expect(trace.events[0].status).toBe('error')
    expect(trace.events[1]).toMatchObject({ kind: 'step', status: 'error', attrs: { reason_code: 'turbo_provider_key_missing', fix: expect.stringContaining('OPENROUTER_API_KEY') } })
    expect(trace.events.some((event) => event.kind === 'llm_call')).toBe(false)
  })

  it('lays out several runs one after another when the input is a list of documents', () => {
    const trace = converted([provider(), provider()])
    const roots = trace.events.filter((event) => event.parent === null)
    expect(roots.map((event) => event.id)).toEqual(['r1.run', 'r2.run'])
    expect(roots[1].start).toBeGreaterThanOrEqual(roots[0].end ?? 0)
  })
})

describe('turbo-request/run → trace (host mode, simplicio-loop 3.45.1)', () => {
  const trace = converted(hostRaw, true)
  const events = byId(trace.events)

  it('shows survey → plan request → host model writes the plan → apply → re-apply → verify', () => {
    expect(trace.events.map((event) => `${event.kind}:${event.id}`)).toEqual([
      'step:run', 'tool:survey', 'step:plan-request', 'llm_call:host-plan', 'file_edit:apply-1', 'llm_call:host-fix', 'file_edit:apply-2', 'verify:verify-2',
    ])
  })

  it('labels the plan author as the invoking agent and reports no token data', () => {
    const plan = events.get('host-plan')!
    expect(plan.attrs).toMatchObject({ provider: 'host' })
    expect(String(plan.attrs.model)).toMatch(/invoking agent/i)
    expect(plan.name).toMatch(/host model/i)
    for (const key of ['prompt_tokens', 'completion_tokens', 'cached_tokens', 'cost_usd']) expect(plan.attrs).not.toHaveProperty(key)
    expect(String(plan.attrs.prompt_preview)).toContain('Task 1')
  })

  it('records the plan request document', () => {
    expect(events.get('plan-request')).toMatchObject({ kind: 'step', attrs: { mode: 'host', status: 'needs_plan', plan_path: '.simplicio-loop/turbo-plan.json', tasks: 1 } })
    expect(String(events.get('plan-request')!.attrs.apply)).toContain('turbo --apply')
  })

  it('keeps the reason and excerpt of a rejected plan and marks the second apply as a re-apply', () => {
    expect(events.get('apply-1')).toMatchObject({ status: 'error', attrs: { failed: [{ tasks: [1], reason: 'plan_find_not_unique', excerpt: 'return a' }] } })
    expect(events.get('apply-2')).toMatchObject({ status: 'ok', attrs: { applied: [1], reapply: true } })
    expect(events.get('host-fix')?.name).toMatch(/fix/i)
    expect(events.get('verify-2')).toMatchObject({ status: 'ok', attrs: { passed: true } })
  })

  it('root reflects the final outcome and the trace is a sample', () => {
    expect(events.get('run')).toMatchObject({ status: 'ok', attrs: { mode: 'host' } })
    expect(trace.header.synthetic).toBe(true)
  })

  it('stops at a running host-model step when only the request document exists', () => {
    const first = hostRaw.split('\n')[0]
    const waiting = converted(first)
    expect(waiting.events.map((event) => event.id)).toEqual(['run', 'survey', 'plan-request', 'host-plan'])
    expect(byId(waiting.events).get('host-plan')?.status).toBe('running')
    expect(byId(waiting.events).get('run')?.status).toBe('running')
  })

  it('converts an apply result on its own', () => {
    const last = hostRaw.trim().split('\n').at(-1)!
    const alone = converted(last)
    expect(alone.events.map((event) => `${event.kind}:${event.id}`)).toEqual(['step:run', 'file_edit:apply-1', 'verify:verify-1'])
  })

  it('handles apply → verify failure → fixed plan → second apply and verify', () => {
    const request = JSON.parse(hostRaw.split('\n')[0])
    const first = { schema: 'simplicio.turbo-run/v1', mode: 'host', status: 'failed', applied: [1], failed: [], verify: { command: 'pytest -q', passed: false, returncode: 1, output_tail: '1 failed' }, wall_s: 2 }
    const second = { schema: 'simplicio.turbo-run/v1', mode: 'host', status: 'ok', applied: [1], failed: [], verify: { command: 'pytest -q', passed: true, returncode: 0, output_tail: '2 passed' }, wall_s: 2 }
    const trace2 = converted([request, first, second])
    expect(trace2.events.map((event) => event.id)).toEqual(['run', 'survey', 'plan-request', 'host-plan', 'apply-1', 'verify-1', 'host-fix', 'apply-2', 'verify-2'])
    expect(byId(trace2.events).get('verify-1')?.status).toBe('error')
  })
})

describe('turbo document input', () => {
  it('accepts a single document, a JSON array and one document per line', () => {
    expect(converted(providerRaw).events.length).toBeGreaterThan(5)
    expect(converted(`[${providerRaw.trim()}]`).events.length).toBeGreaterThan(5)
    expect(converted(hostRaw).events.length).toBeGreaterThan(5)
  })

  it('reports unsupported documents and invalid JSON instead of guessing', () => {
    const unsupported = turboToTrace({ schema: 'something/else' })
    expect(unsupported.trace).toBeNull()
    expect(unsupported.issues[0]).toMatchObject({ severity: 'error', message: expect.stringMatching(/turbo/i) })
    const broken = turboToTrace('{"schema": "simplicio.turbo-run/v1"\n{nope')
    expect(broken.trace).toBeNull()
    expect(broken.issues.some((issue) => issue.severity === 'error')).toBe(true)
  })

  it('sniffs turbo documents so the loader can pick the right importer', () => {
    expect(looksLikeTurbo(providerRaw)).toBe(true)
    expect(looksLikeTurbo(hostRaw)).toBe(true)
    expect(looksLikeTurbo('{"id":"a","kind":"step","name":"n","start":0}')).toBe(false)
    expect(looksLikeTurbo('not json')).toBe(false)
  })
})
