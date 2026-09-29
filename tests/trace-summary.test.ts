import { describe, expect, it } from 'vitest'
import providerTrace from '../fixtures/traces/turbo-provider.trace.jsonl?raw'
import hostTrace from '../fixtures/traces/turbo-host.trace.jsonl?raw'
import { parseTrace } from '../src/domain/trace'
import { summarizeTrace } from '../src/domain/trace-summary'

describe('run summary', () => {
  it('reads the totals turbo reports on the root step', () => {
    const summary = summarizeTrace(parseTrace(providerTrace).trace!)
    expect(summary).toMatchObject({ events: 11, llmCalls: 5, costUsd: 0.001884, promptTokens: 27785, completionTokens: 664, cachedTokens: 20480, durationS: 11.42 })
  })

  it('sums per-call tokens and cost when there are no reported totals', () => {
    const trace = parseTrace([
      { id: 'a', kind: 'llm_call', name: 'one', start: 0, end: 1, attrs: { prompt_tokens: 100, completion_tokens: 10, cost_usd: 0.001 } },
      { id: 'b', kind: 'llm_call', name: 'two', start: 1, end: 3, attrs: { prompt_tokens: 50, completion_tokens: 5, cost_usd: 0.002 } },
      { id: 'c', kind: 'tool', name: 'tool', start: 3 },
    ].map((event) => JSON.stringify(event)).join('\n')).trace!
    expect(summarizeTrace(trace)).toMatchObject({ llmCalls: 2, promptTokens: 150, completionTokens: 15, durationS: 3 })
    expect(summarizeTrace(trace).costUsd).toBeCloseTo(0.003, 6)
  })

  it('leaves cost and tokens undefined when the source reports none (host mode, simulations)', () => {
    const summary = summarizeTrace(parseTrace(hostTrace).trace!)
    expect(summary).toMatchObject({ llmCalls: 2 })
    expect(summary.costUsd).toBeUndefined()
    expect(summary.promptTokens).toBeUndefined()
  })
})
