import type { Trace } from './trace'

export interface TraceSummary {
  events: number
  llmCalls: number
  promptTokens?: number
  cachedTokens?: number
  completionTokens?: number
  costUsd?: number
  durationS: number
}

const num = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : undefined)

/** Totals for the run header. A total the source reports (turbo puts them on the root step) wins over a sum of per-call values. */
export function summarizeTrace(trace: Trace): TraceSummary {
  const calls = trace.events.filter((event) => event.kind === 'llm_call')
  // Totals live on a step that wraps the calls (turbo's root); a cost on an LLM call itself is that call's own.
  const reported = trace.events.find((event) => event.kind !== 'llm_call' && (isRecord(event.attrs.tokens) || num(event.attrs.cost_usd) !== undefined))
  const reportedTokens = reported && isRecord(reported.attrs.tokens) ? reported.attrs.tokens : undefined
  const sum = (key: string) => { const values = calls.map((call) => num(call.attrs[key])).filter((value): value is number => value !== undefined); return values.length ? values.reduce((a, b) => a + b, 0) : undefined }
  const costs = calls.map((call) => num(call.attrs.cost_usd))
  const summedCost = calls.length && costs.every((value) => value !== undefined) ? (costs as number[]).reduce((a, b) => a + b, 0) : undefined
  return {
    events: trace.events.length,
    llmCalls: calls.length,
    promptTokens: num(reportedTokens?.prompt_tokens) ?? sum('prompt_tokens'),
    cachedTokens: num(reportedTokens?.cached_tokens) ?? sum('cached_tokens'),
    completionTokens: num(reportedTokens?.completion_tokens) ?? sum('completion_tokens'),
    costUsd: num(reported?.attrs.cost_usd) ?? summedCost,
    durationS: Math.max(0, ...trace.events.map((event) => event.end ?? event.start)),
  }
}

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value) }
