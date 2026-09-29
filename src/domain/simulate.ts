/**
 * Simulation: given a request and a flow, list the steps the request would take, each with a plain-language
 * explanation, as a synthetic simplicio.trace/v1 (every event has `attrs.simulated: true`). Nothing runs and no model is called.
 *
 *  - `loop`:  the simplicio-loop turbo pipeline. The steps and their texts live in simulation/simplicio-loop.flow.json;
 *             the branch (one task, fan-out, same file, queue, provider mode) is chosen from the request text.
 *  - `entry`: any project. The Mapper call graph is walked from an entry point in call order; explanations come only from
 *             what static analysis knows and every branch it cannot decide is marked `unknown`.
 */
import loopFlowJson from '../simulation/simplicio-loop.flow.json'
import walkJson from '../simulation/static-walk.json'
import type { EntryPoint } from './entrypoints'
import { edgeId, oneLine, type FlowEdge, type FlowGraph, type FlowNode } from './flow-graph'
import type { Locale, Localized } from './locale'
import { ambiguousOf, callsOf, describeSymbol, type Project, type ProjectCall } from './project'
import { analyzeRequest, type RequestShape } from './request'
import type { Guard } from './source'
import { buildEntryFlow } from './flows'
import { buildTrace, type Trace, type TraceKind, type TraceStatus } from './trace'

type Part = 'what' | 'why' | 'input' | 'output' | 'failure'
export interface LoopFlowNode { id: string; kind: TraceKind; label: Localized; explain: Record<Part, Localized>; variants?: Record<string, Partial<Record<Part, Localized>>> }
export interface LoopFlowDefinition {
  schema: string
  id: string
  version: string
  title: Localized
  labels: Record<'what' | 'why' | 'io' | 'failure' | 'unknown' | 'item' | 'happyPath' | 'noFile' | 'tail' | 'emptyRequest', Localized>
  nodes: LoopFlowNode[]
  edges: Array<{ from: string; to: string; label?: Localized }>
}
interface WalkTexts { kinds: Record<string, Localized>; labels: Record<'what' | 'why' | 'io' | 'failure' | 'notes' | 'unknown', Localized>; t: Record<string, Localized> }

export const LOOP_FLOW = loopFlowJson as unknown as LoopFlowDefinition
const WALK = walkJson as unknown as WalkTexts

export type SimulationFlow =
  | { kind: 'loop'; definition?: LoopFlowDefinition }
  | { kind: 'entry'; project: Project; entry: EntryPoint; depth?: number; maxSteps?: number }
export interface SimulationResult { flowId: string; graph: FlowGraph; trace: Trace; notes: string[]; shape?: RequestShape }
export interface ExplanationParts { what: string; why: string; io: string; failure: string; notes?: string[] }

const fill = (template: string, vars: Record<string, string | number>) => template.replace(/\{(\w+)\}/g, (whole, key: string) => (key in vars ? String(vars[key]) : whole))
const shorten = (text: string, max = 120) => oneLine(text, max)
const quote = (text: string) => `\`${text}\``

function compose(parts: ExplanationParts, labels: { what: string; why: string; io: string; failure: string; unknown: string }, unknown: boolean): string {
  const lines = [`${labels.what}: ${parts.what}`, `${labels.why}: ${parts.why}`]
  if (parts.io) lines.push(`${labels.io}: ${parts.io}`)
  if (parts.failure) lines.push(`${labels.failure}: ${parts.failure}`)
  lines.push(...(parts.notes ?? []))
  if (unknown) lines.push(`? ${labels.unknown}.`)
  return lines.join('\n\n')
}

interface RawEvent { id: string; parent: string | null; kind: TraceKind; name: string; start: number; end: number; status: TraceStatus; attrs: Record<string, unknown> }

function finish(events: RawEvent[], title: string, graph: FlowGraph, notes: string[], flowId: string, shape?: RequestShape): SimulationResult {
  const { trace, issues } = buildTrace(events, { title, source: 'simulation', synthetic: true })
  if (!trace) throw new Error(`simulation produced an invalid trace: ${issues.map((issue) => issue.message).join('; ')}`)
  return { flowId, graph, trace, notes, shape }
}

/* ───────────────────────────── simplicio-loop ───────────────────────────── */

interface Step { node: string; status: TraceStatus; variants: string[]; item?: number }

function loopSteps(shape: RequestShape): Step[] {
  const steps: Step[] = []
  const iterations = shape.queue ? 2 : 1
  const many = !shape.queue && shape.tasks.length > 1
  steps.push({ node: 'skill', status: 'ok', variants: [] }, { node: 'cli', status: 'ok', variants: shape.queue ? ['queue'] : [] })
  if (shape.queue) steps.push({ node: 'queue_list', status: 'ok', variants: [] })
  for (let item = 1; item <= iterations; item += 1) {
    // The number of queue items is unknown: the first pass is the illustration, later passes may not exist.
    const add = (node: string, status: TraceStatus = 'ok', variants: string[] = [...(shape.provider ? ['provider'] : []), ...(many ? ['many'] : []), ...(shape.queue ? ['queue'] : [])]) =>
      steps.push({ node, status: shape.queue && item > 1 ? 'unknown' : status, variants, item: shape.queue ? item : undefined })
    add('survey', 'ok', shape.queue ? ['queue'] : [])
    add('plan_request')
    if (shape.kind === 'independent' || shape.kind === 'mixed') add('fanout')
    if (shape.kind === 'ordered' || shape.kind === 'mixed') add('ordered')
    if (shape.provider) {
      if (many && shape.tasks.length > 3) add('provider_warm')
      add('provider_call')
      add('provider_hedge', 'unknown')
    } else add('host_model')
    add('apply')
    add('verify')
    add('fix', 'unknown')
    if (shape.queue) add('pr')
  }
  steps.push({ node: 'done', status: 'ok', variants: shape.queue ? ['queue'] : [] })
  return steps
}

function simulateLoop(request: string, definition: LoopFlowDefinition, locale: Locale): SimulationResult {
  const shape = analyzeRequest(request)
  const byNode = new Map(definition.nodes.map((node) => [node.id, node]))
  const labels = Object.fromEntries(Object.entries(definition.labels).map(([key, value]) => [key, value[locale]])) as Record<keyof LoopFlowDefinition['labels'], string>
  const requestText = shorten(request.trim() || labels.emptyRequest)
  const vars = { request: requestText, tasks: shape.queue ? '?' : shape.tasks.length, files: shape.files.length ? shape.files.join(', ') : labels.noFile, lanes: shape.lanes.length, items: 2 }
  const pick = (node: LoopFlowNode, part: Part, variants: string[]) => (variants.map((variant) => node.variants?.[variant]?.[part]).find(Boolean) ?? node.explain[part])[locale]

  const steps = loopSteps(shape)
  const events: RawEvent[] = steps.map((step, index) => {
    const node = byNode.get(step.node)
    if (!node) throw new Error(`simplicio-loop flow has no node "${step.node}"`)
    const local = { ...vars, item: step.item ?? 1 }
    const text = (part: Part) => fill(pick(node, part, step.variants), local)
    const parts: ExplanationParts = { what: text('what'), why: text('why'), io: `${text('input')} → ${text('output')}`, failure: text('failure') }
    const suffix = step.item ? ` · ${fill(labels.item, { item: step.item })}` : ''
    return {
      id: `s${index + 1}`, parent: null, kind: node.kind, name: `${node.label[locale]}${suffix}`, start: index, end: index + 1, status: step.status,
      attrs: { simulated: true, node: node.id, flow: definition.id, ...(step.item ? { item: step.item } : {}), ...(index === 0 ? { request: requestText } : {}), ...(step.status === 'unknown' ? { unknown: true } : {}), explanation: compose(parts, labels, step.status === 'unknown'), explanation_parts: parts },
    }
  })

  const graph: FlowGraph = {
    id: `sim:${definition.id}`, title: definition.title[locale], kind: 'simulation', direction: 'TB',
    nodes: definition.nodes.map((node): FlowNode => ({ id: node.id, label: node.label[locale], kind: node.kind })),
    edges: definition.edges.map((edge): FlowEdge => ({ id: edgeId(edge.from, edge.to, edge.label ? 'branch' : 'next'), from: edge.from, to: edge.to, kind: edge.label ? 'branch' : 'next', label: edge.label?.[locale], dashed: edge.label ? true : undefined })),
  }
  return finish(events, `${definition.title[locale]} · ${requestText}`, graph, [labels.happyPath, labels.tail], definition.id, shape)
}

/* ─────────────────────────── static walk of a project ─────────────────────────── */

function guardText(guards: Guard[], after: ProjectCall['after'], locale: Locale, tt: (key: string, vars?: Record<string, string | number>) => string): string {
  const pieces = guards.map((guard) => {
    if (guard.kind === 'else' || guard.kind === 'elif') return tt('guardElse', { text: guard.text, after: (guard.after ?? []).map(quote).join(', ') })
    if (guard.kind === 'for' || guard.kind === 'while' || guard.kind === 'foreach' || guard.kind === 'do') return tt('guardLoop', { text: guard.text })
    if (guard.kind === 'except' || guard.kind === 'catch') return tt('guardExcept', { text: guard.text })
    if (guard.kind === 'def') return tt('guardDef', { text: guard.text })
    return tt('guardIf', { text: guard.text })
  })
  if (after) pieces.push(tt('afterReturn', { text: after.text, line: after.line }))
  return pieces.join(WALK.t.and[locale])
}

function mentions(request: string, name: string): boolean {
  return name.length >= 4 && new RegExp(`(^|[^\\w])${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^\\w]|$)`, 'i').test(request)
}

function simulateEntry(request: string, flow: Extract<SimulationFlow, { kind: 'entry' }>, locale: Locale): SimulationResult {
  const { project, entry } = flow
  if (!project.symbols.has(entry.symbol)) throw new Error(`entry point "${entry.name}" has no symbol in this project`)
  const depth = flow.depth ?? 2
  const maxSteps = flow.maxSteps ?? 60
  const tt = (key: string, vars: Record<string, string | number> = {}) => fill(WALK.t[key][locale], vars)
  const labels = Object.fromEntries(Object.entries(WALK.labels).map(([key, value]) => [key, value[locale]])) as Record<'what' | 'why' | 'io' | 'failure' | 'notes' | 'unknown', string>
  const requestText = shorten(request.trim() || tt('request'))
  const base = buildEntryFlow(project, entry, { depth, maxNodes: 200 })
  const inGraph = new Set(base.nodes.map((node) => node.id))

  const level = new Map<string, number>([[entry.symbol, 0]])
  const queue = [entry.symbol]
  for (let at = 0; at < queue.length; at += 1) for (const edge of base.edges) if (edge.from === queue[at] && !level.has(edge.to)) { level.set(edge.to, level.get(queue[at])! + 1); queue.push(edge.to) }

  const events: RawEvent[] = []
  const visited = new Map<string, string>()
  const extraNodes: FlowNode[] = []
  const extraEdges: FlowEdge[] = []
  let clock = 0
  let truncated = false
  const label = (id: string) => project.symbols.get(id)?.label ?? id
  const kindLabel = WALK.kinds[entry.kind]?.[locale] ?? entry.kind

  const open = (event: Omit<RawEvent, 'start' | 'end'>): RawEvent | null => {
    if (events.length >= maxSteps) { truncated = true; return null }
    const created: RawEvent = { ...event, start: clock, end: clock + 1 }
    clock += 1
    events.push(created)
    return created
  }
  const close = (event: RawEvent) => { event.end = Math.max(event.end, clock) }
  const purpose = (id: string) => { const summary = describeSymbol(project, id)?.summary; return summary ? tt('callPurpose', { summary: shorten(summary, 90).replace(/[.。]+$/, '') }) : '' }

  const walk = (id: string, parent: RawEvent | null, call: ProjectCall | null) => {
    const symbol = project.symbols.get(id)!
    const details = describeSymbol(project, id)
    const isEntry = call === null
    const guarded = Boolean(call && (call.guards.length || call.after))
    const revisit = visited.has(id)
    const caller = call ? project.symbols.get(call.from) : undefined
    const guards = call ? guardText(call.guards, call.after, locale, tt) : ''
    const status: TraceStatus = guarded ? 'unknown' : 'ok'

    const why = isEntry
      ? tt('entryWhy', { kind: kindLabel, name: entry.name, function: label(id), evidence: entry.evidence, request: requestText })
      : [tt('callWhy', { caller: label(call!.from), line: call!.line, callerFile: caller?.file ?? '' }), guarded ? tt('guard', { guards }) : parent?.status === 'unknown' ? tt('parentUnknown') : ''].filter(Boolean).join(' ')

    let parts: ExplanationParts
    if (revisit) {
      parts = { what: tt('revisit', { label: label(id), caller: label(call!.from), line: call!.line }), why, io: '', failure: '' }
    } else {
      const expand = (level.get(id) ?? 0) < depth
      const sites = details?.callees.filter((site) => inGraph.has(site.to)) ?? []
      const callItems = sites.map((site) => tt('callItem', { label: label(site.to), line: site.line, purpose: purpose(site.to) }))
      const distinct = new Set(details?.callees.map((site) => site.to)).size
      const notes: string[] = []
      notes.push(expand ? (callItems.length ? tt('calls', { calls: callItems.join('; ') }) : tt('noCalls')) : distinct ? tt('moreCalls', { count: distinct }) : tt('noCalls'))
      if (details?.external.length) notes.push(tt('external', { names: details.external.map(quote).join(', ') }))
      if (details?.ambiguous.length) notes.push(tt('ambiguous', { names: details.ambiguous.map((item) => quote(item.candidates[0]?.split('::')[1] ?? '?')).join(', ') }))
      const io = details?.signature
        ? [details.params.length ? tt('params', { params: details.params.map(quote).join(', ') }) : tt('noParams'), details.returns ? tt('returns', { returns: details.returns }) : tt('returnsUnknown')].join(' ')
        : tt('signatureUnknown')
      const mention = mentions(request, symbol.name) ? ` ${tt('mentioned', { name: symbol.name })}` : ''
      parts = {
        what: `${details?.summary ?? tt('noDoc', { label: label(id), file: symbol.file, line: symbol.line })}${mention}`,
        why, io, failure: details?.raises.length ? tt('raises', { errors: details.raises.map(quote).join(', ') }) : tt('noRaise'), notes,
      }
    }

    const event = open({
      id: `s${events.length + 1}`, parent: parent?.id ?? null, kind: 'step', name: isEntry ? entry.name : label(id), status,
      attrs: { simulated: true, node: id, file: symbol.file, line: symbol.line, ...(call ? { edge: edgeId(call.from, id, 'calls'), call_line: call.line } : { entry: entry.id, request: requestText }), ...(revisit ? { revisit: true } : {}), ...(guarded ? { unknown: true, condition: guards } : {}), explanation: compose(parts, { ...labels, io: labels.io }, status === 'unknown'), explanation_parts: parts },
    })
    if (!event) return
    if (!revisit) {
      visited.set(id, event.id)
      if ((level.get(id) ?? 0) < depth) {
        const merged = [
          ...callsOf(project, id).filter((site) => inGraph.has(site.to)).map((site) => ({ line: site.line, call: site, ambiguous: undefined as undefined | { line: number; candidates: string[] } })),
          ...ambiguousOf(project, id).map((item) => ({ line: item.line, call: undefined as undefined | ProjectCall, ambiguous: item })),
        ].sort((a, b) => a.line - b.line)
        for (const item of merged) {
          if (item.call) walk(item.call.to, event, item.call)
          else if (item.ambiguous) ambiguousStep(id, event, item.ambiguous)
        }
      }
    }
    close(event)
  }

  const ambiguousStep = (from: string, parent: RawEvent, item: { line: number; candidates: string[] }) => {
    const name = item.candidates[0]?.split('::')[1] ?? '?'
    const nodeId = `ambiguous:${from}:${item.line}`
    const parts: ExplanationParts = {
      what: tt('ambiguousWhat', { caller: label(from), name, line: item.line, candidates: item.candidates.map(quote).join(', ') }),
      why: tt('ambiguousWhy', { line: item.line }), io: tt('ambiguousIo'), failure: tt('ambiguousFailure'),
    }
    const event = open({ id: `s${events.length + 1}`, parent: parent.id, kind: 'step', name: tt('ambiguousStep', { name }), status: 'unknown', attrs: { simulated: true, node: nodeId, edge: edgeId(from, nodeId, 'calls'), unknown: true, explanation: compose(parts, labels, true), explanation_parts: parts } })
    if (!event) return
    extraNodes.push({ id: nodeId, label: `? ${name}`, kind: 'external', subtitle: `${item.candidates.length}`, status: 'unknown' })
    extraEdges.push({ id: edgeId(from, nodeId, 'calls'), from, to: nodeId, kind: 'calls', dashed: true })
    close(event)
  }

  walk(entry.symbol, null, null)
  const notes = [tt('staticNote'), tt('depthNote', { depth })]
  if (truncated) notes.push(tt('stepLimit', { max: maxSteps }))
  const graph: FlowGraph = { ...base, id: `sim:${entry.id}`, kind: 'simulation', nodes: [...base.nodes, ...extraNodes], edges: [...base.edges, ...extraEdges], truncated: undefined }
  return finish(events, `${entry.name} · ${requestText}`, graph, notes, entry.id)
}

export function simulate(request: string, flow: SimulationFlow, options: { locale: Locale }): SimulationResult {
  return flow.kind === 'loop' ? simulateLoop(request, flow.definition ?? LOOP_FLOW, options.locale) : simulateEntry(request, flow, options.locale)
}
