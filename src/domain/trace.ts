/** simplicio.trace/v1 — one JSON event per line. See docs/trace-format.md. */
export const TRACE_SCHEMA = 'simplicio.trace/v1'
export const TRACE_KINDS = ['step', 'llm_call', 'tool', 'command', 'file_edit', 'verify'] as const
export const TRACE_STATUSES = ['ok', 'error', 'running', 'skipped', 'unknown'] as const
/** A runaway file must not freeze the page: larger traces are rejected up front. */
export const MAX_TRACE_EVENTS = 20_000

export type TraceKind = (typeof TRACE_KINDS)[number]
export type TraceStatus = (typeof TRACE_STATUSES)[number]
export type TraceAttrs = Record<string, unknown>

export interface TraceEvent {
  id: string
  parent: string | null
  kind: TraceKind
  name: string
  /** Seconds from the first event of the trace. */
  start: number
  /** Seconds from the first event; null when the duration was not measured. */
  end: number | null
  status: TraceStatus
  attrs: TraceAttrs
}

export interface TraceHeader { title?: string; source?: string; synthetic?: boolean }
export interface Trace { schema: typeof TRACE_SCHEMA; header: TraceHeader; events: TraceEvent[] }
export interface TraceIssue { line: number; severity: 'error' | 'warning'; message: string }
export interface TraceParseResult { trace: Trace | null; issues: TraceIssue[] }

export const hasErrors = (issues: TraceIssue[]) => issues.some((issue) => issue.severity === 'error')

const KINDS = new Set<string>(TRACE_KINDS)
const STATUSES = new Set<string>(TRACE_STATUSES)
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const round6 = (value: number) => Math.round(value * 1e6) / 1e6

/** Accepts seconds (number or numeric string) and ISO-8601 strings; returns seconds or null. */
function parseTime(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value !== 'string') return null
  const text = value.trim()
  if (/^-?\d+(?:\.\d+)?(?:e[+-]?\d+)?$/i.test(text)) return Number(text)
  const millis = Date.parse(text)
  return Number.isNaN(millis) ? null : millis / 1000
}

interface Record_ { line: number; value: unknown }
interface Draft { id: string; parent: string | null; kind: TraceKind; name: string; start: number; end: number | null; status: TraceStatus; attrs: TraceAttrs; line: number }

const tooLarge = (count: number): TraceIssue => ({ line: 1, severity: 'error', message: `trace too large: ${count} events exceeds the limit of ${MAX_TRACE_EVENTS}` })

function validate(records: Record_[], header: TraceHeader, issues: TraceIssue[]): Trace | null {
  const add = (line: number, severity: TraceIssue['severity'], message: string) => issues.push({ line, severity, message })
  if (records.length > MAX_TRACE_EVENTS) { issues.push(tooLarge(records.length)); return null }
  const drafts: Draft[] = []
  const seen = new Set<string>()
  for (const { line, value } of records) {
    if (!isRecord(value)) { add(line, 'error', 'event must be a JSON object'); continue }
    const rawId = value.id
    const id = typeof rawId === 'string' ? rawId : typeof rawId === 'number' && Number.isInteger(rawId) ? String(rawId) : ''
    if (!id) { add(line, 'error', 'event is missing a string "id"'); continue }
    if (seen.has(id)) { add(line, 'error', `duplicate id "${id}"`); continue }
    if (typeof value.kind !== 'string' || !KINDS.has(value.kind)) { add(line, 'error', `event "${id}" has an unknown or missing "kind" (expected one of ${TRACE_KINDS.join(', ')})`); continue }
    if (typeof value.name !== 'string' || !value.name.trim()) { add(line, 'error', `event "${id}" is missing a "name"`); continue }
    const start = parseTime(value.start)
    if (start === null) { add(line, 'error', `event "${id}" needs a numeric or ISO-8601 "start"`); continue }
    let end: number | null = null
    if (value.end !== undefined && value.end !== null) {
      end = parseTime(value.end)
      if (end === null) { add(line, 'warning', `event "${id}" has an unreadable "end"; treated as not measured`) }
      else if (end < start) { add(line, 'warning', `event "${id}" ends before it starts; end clamped to start`); end = start }
    }
    let status: TraceStatus = 'ok'
    if (value.status !== undefined && value.status !== null) {
      if (typeof value.status === 'string' && STATUSES.has(value.status)) status = value.status as TraceStatus
      else add(line, 'warning', `event "${id}" has unknown status ${JSON.stringify(value.status)}; using "ok"`)
    }
    let attrs: TraceAttrs = {}
    if (value.attrs !== undefined && value.attrs !== null) {
      if (isRecord(value.attrs)) attrs = value.attrs
      else add(line, 'warning', `event "${id}" has non-object "attrs"; ignored`)
    }
    const parent = typeof value.parent === 'string' && value.parent ? value.parent : typeof value.parent === 'number' && Number.isInteger(value.parent) ? String(value.parent) : null
    seen.add(id)
    drafts.push({ id, parent, kind: value.kind as TraceKind, name: value.name, start, end, status, attrs, line })
  }
  if (!drafts.length && !hasErrors(issues)) add(records[0]?.line ?? 1, 'error', 'trace has no events')
  if (hasErrors(issues)) return null

  for (const draft of drafts) {
    if (draft.parent === null) continue
    if (draft.parent === draft.id) { add(draft.line, 'warning', `event "${draft.id}" names itself as parent; treated as a root`); draft.parent = null }
    else if (!seen.has(draft.parent)) { add(draft.line, 'warning', `event "${draft.id}" refers to unknown parent "${draft.parent}"; treated as a root`); draft.parent = null }
  }
  const byId = new Map(drafts.map((draft) => [draft.id, draft]))
  for (const draft of drafts) {
    const path = new Set<string>([draft.id])
    let current = draft
    while (current.parent !== null) {
      if (path.has(current.parent)) { add(current.line, 'warning', `parent cycle through "${current.id}"; treated as a root`); current.parent = null; break }
      path.add(current.parent)
      current = byId.get(current.parent)!
    }
  }

  const origin = Math.min(...drafts.map((draft) => draft.start))
  // Order by start time. Events that start at the same instant follow the call tree (parent first, then children),
  // then file order: span emitters write a parent when it ends, so its children usually come first in the file.
  const fileOrder = new Map(drafts.map((draft, index) => [draft.id, index]))
  const kids = new Map<string | null, Draft[]>()
  for (const draft of drafts) (kids.get(draft.parent) ?? kids.set(draft.parent, []).get(draft.parent)!).push(draft)
  const byStart = (a: Draft, b: Draft) => a.start - b.start || fileOrder.get(a.id)! - fileOrder.get(b.id)!
  const treeOrder = new Map<string, number>()
  const stack = [...(kids.get(null) ?? [])].sort(byStart).reverse()
  while (stack.length) {
    const draft = stack.pop()!
    treeOrder.set(draft.id, treeOrder.size)
    stack.push(...[...(kids.get(draft.id) ?? [])].sort(byStart).reverse())
  }
  const events: TraceEvent[] = [...drafts]
    .sort((a, b) => a.start - b.start || treeOrder.get(a.id)! - treeOrder.get(b.id)!)
    .map((draft) => ({ id: draft.id, parent: draft.parent, kind: draft.kind, name: draft.name, start: round6(draft.start - origin), end: draft.end === null ? null : round6(draft.end - origin), status: draft.status, attrs: draft.attrs }))
  return { schema: TRACE_SCHEMA, header, events }
}

function readHeader(value: Record<string, unknown>): TraceHeader {
  const header: TraceHeader = {}
  if (typeof value.title === 'string') header.title = value.title
  if (typeof value.source === 'string') header.source = value.source
  if (typeof value.synthetic === 'boolean') header.synthetic = value.synthetic
  return header
}

/** Parse a JSONL document. `trace` is null when any error was found; every problem is reported with its line. */
export function parseTrace(text: string): TraceParseResult {
  const issues: TraceIssue[] = []
  const lines = text.split(/\r?\n/)
  const populated = lines.filter((entry) => entry.trim()).length
  if (populated > MAX_TRACE_EVENTS + 1) return { trace: null, issues: [tooLarge(populated)] }
  const records: Record_[] = []
  let header: TraceHeader = {}
  let headerSeen = false
  lines.forEach((raw, index) => {
    const line = index + 1
    if (!raw.trim()) return
    let value: unknown
    try { value = JSON.parse(raw) } catch (error) { issues.push({ line, severity: 'error', message: `invalid JSON: ${error instanceof Error ? error.message : String(error)}` }); return }
    if (isRecord(value) && 'schema' in value && !('id' in value) && !('kind' in value)) {
      if (headerSeen || records.length) { issues.push({ line, severity: 'warning', message: 'header line ignored: it must be the first record' }); return }
      headerSeen = true
      if (value.schema !== TRACE_SCHEMA) { issues.push({ line, severity: 'error', message: `unsupported schema ${JSON.stringify(value.schema)}; expected "${TRACE_SCHEMA}"` }); return }
      header = readHeader(value)
      return
    }
    records.push({ line, value })
  })
  if (hasErrors(issues)) return { trace: null, issues }
  return { trace: validate(records, header, issues), issues }
}

/** Validate events that are already in memory (converters, simulators). `line` is the 1-based event position. */
export function buildTrace(events: unknown[], header: TraceHeader = {}): TraceParseResult {
  const issues: TraceIssue[] = []
  const records = events.map((value, index) => ({ line: index + 1, value }))
  return { trace: validate(records, header, issues), issues }
}

export function serializeTrace(trace: Trace): string {
  const lines: unknown[] = [{ schema: TRACE_SCHEMA, ...trace.header }]
  for (const event of trace.events) {
    const record: Record<string, unknown> = { id: event.id, parent: event.parent, kind: event.kind, name: event.name, start: event.start }
    if (event.end !== null) record.end = event.end
    record.status = event.status
    if (Object.keys(event.attrs).length) record.attrs = event.attrs
    lines.push(record)
  }
  return `${lines.map((entry) => JSON.stringify(entry)).join('\n')}\n`
}

export interface TraceIndex {
  byId: Map<string, TraceEvent>
  children: Map<string, TraceEvent[]>
  roots: TraceEvent[]
  depth: Map<string, number>
}

export function traceIndex(trace: Trace): TraceIndex {
  const byId = new Map(trace.events.map((event) => [event.id, event]))
  const children = new Map<string, TraceEvent[]>()
  const roots: TraceEvent[] = []
  for (const event of trace.events) {
    if (event.parent === null) { roots.push(event); continue }
    const list = children.get(event.parent)
    if (list) list.push(event)
    else children.set(event.parent, [event])
  }
  const depth = new Map<string, number>()
  const walk = (event: TraceEvent, level: number) => { depth.set(event.id, level); for (const child of children.get(event.id) ?? []) walk(child, level + 1) }
  for (const root of roots) walk(root, 0)
  return { byId, children, roots, depth }
}
