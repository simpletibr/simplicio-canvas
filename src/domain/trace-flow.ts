/** Trace → flow graph: every event is a node; `next` edges follow time, `contains` edges point at first children. */
import { edgeId, formatDuration, formatTokens, oneLine, type FlowEdge, type FlowGraph, type FlowNode } from './flow-graph'
import { traceIndex, type Trace, type TraceEvent } from './trace'

/** Siblings further apart than this are never considered concurrent: it keeps the pass linear for long traces. */
const WINDOW = 64

const str = (value: unknown) => (typeof value === 'string' && value ? value : undefined)
const count = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : undefined)

function nodeFor(event: TraceEvent): FlowNode {
  const { attrs } = event
  const duration = event.end === null ? undefined : formatDuration(event.end - event.start)
  const badges: string[] = []
  let subtitle = duration
  if (event.kind === 'llm_call') {
    subtitle = str(attrs.model) ?? duration
    const provider = str(attrs.provider)
    if (provider) badges.push(provider)
    const prompt = count(attrs.prompt_tokens)
    const completion = count(attrs.completion_tokens)
    if (prompt !== undefined || completion !== undefined) badges.push(`${prompt === undefined ? '?' : formatTokens(prompt)}→${completion === undefined ? '?' : formatTokens(completion)} tok`)
    const latency = count(attrs.latency_s)
    if (latency !== undefined) badges.push(formatDuration(latency))
    if (attrs.warm === true) badges.push('warm')
    if (attrs.hedged === true) badges.push('hedged')
  } else if (event.kind === 'tool') {
    const tool = str(attrs.tool)
    if (tool) badges.push(tool)
  } else if (event.kind === 'file_edit') {
    if (Array.isArray(attrs.applied) && attrs.applied.length) badges.push(`${attrs.applied.length} applied`)
    if (Array.isArray(attrs.failed) && attrs.failed.length) badges.push(`${attrs.failed.length} failed`)
  }
  return { id: event.id, label: event.name, kind: event.kind, status: event.status, subtitle, summary: str(attrs.summary) ? oneLine(str(attrs.summary), 140) : undefined, badges: badges.length ? badges : undefined }
}

/** Events X (earlier in order) that finished before E started, minus those already implied by a later one. */
function predecessors(siblings: TraceEvent[], at: number): TraceEvent[] {
  const event = siblings[at]
  const covering: TraceEvent[] = []
  for (let index = at - 1; index >= Math.max(0, at - WINDOW); index -= 1) {
    const candidate = siblings[index]
    if (candidate.end !== null && candidate.end > event.start) continue
    if (covering.some((later) => candidate.end === null || candidate.end <= later.start)) continue
    covering.push(candidate)
  }
  return covering.reverse()
}

export function traceToFlow(trace: Trace, id = 'trace'): FlowGraph {
  const index = traceIndex(trace)
  const edges: FlowEdge[] = []
  const link = (siblings: TraceEvent[], parent: TraceEvent | null) => {
    siblings.forEach((event, at) => {
      const before = predecessors(siblings, at)
      for (const previous of before) edges.push({ id: edgeId(previous.id, event.id, 'next'), from: previous.id, to: event.id, kind: 'next' })
      if (!before.length && parent) edges.push({ id: edgeId(parent.id, event.id, 'contains'), from: parent.id, to: event.id, kind: 'contains', dashed: true })
    })
  }
  link(index.roots, null)
  for (const event of trace.events) { const children = index.children.get(event.id); if (children) link(children, event) }
  return { id, title: trace.header.title ?? 'Trace', kind: 'trace', direction: 'TB', nodes: trace.events.map(nodeFor), edges }
}
