/**
 * `simplicio-loop turbo` documents → simplicio.trace/v1.
 *
 * Two shapes exist:
 *  - provider mode (3.45.0, or `mode: "provider"`): one `simplicio.turbo-run/v1` document with `calls[]`;
 *  - host mode (3.45.1): a `simplicio.turbo-request/v1` document (`needs_plan`), then one or more
 *    `simplicio.turbo-run/v1` apply results (`mode: "host"`, no `calls[]`) — the invoking agent's model
 *    writes the plan, so the loop itself makes no LLM call.
 *
 * turbo-run/v1 carries no timestamps, no per-call cost and no prompt text. The converter lays events out
 * from the measured latencies only and never invents the rest.
 */
import { buildTrace, type TraceIssue, type TraceParseResult, type TraceStatus } from './trace'

export interface TurboOptions { synthetic?: boolean }

type Doc = Record<string, unknown>
interface RawEvent { id: string; parent: string | null; kind: string; name: string; start: number; end?: number; status: TraceStatus; attrs: Record<string, unknown> }

const RUN_SCHEMA = 'simplicio.turbo-run/v1'
const REQUEST_SCHEMA = 'simplicio.turbo-request/v1'
const isRecord = (value: unknown): value is Doc => typeof value === 'object' && value !== null && !Array.isArray(value)
const num = (value: unknown): number | undefined => (typeof value === 'number' && Number.isFinite(value) ? value : undefined)
const str = (value: unknown): string | undefined => (typeof value === 'string' ? value : undefined)
const isRun = (doc: Doc) => doc.schema === RUN_SCHEMA
const isRequest = (doc: Doc) => doc.schema === REQUEST_SCHEMA
export const isTurboDocument = (value: unknown): value is Doc => isRecord(value) && (isRun(value) || isRequest(value))

/** Only the last path segment is kept: traces must not leak machine paths such as /Users/name. */
const baseName = (path: unknown) => (typeof path === 'string' ? path.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || undefined : undefined)
const preview = (text: unknown, max = 600) => { const value = str(text) ?? ''; return value.length > max ? `${value.slice(0, max)}…` : value }
const withoutUndefined = (attrs: Record<string, unknown>) => Object.fromEntries(Object.entries(attrs).filter(([, value]) => value !== undefined))

function readDocuments(input: unknown, issues: TraceIssue[]): Doc[] {
  let values: unknown[]
  if (typeof input === 'string') {
    const text = input.trim()
    try {
      const parsed: unknown = JSON.parse(text)
      values = Array.isArray(parsed) ? parsed : [parsed]
    } catch {
      values = []
      text.split(/\r?\n/).forEach((raw, index) => {
        if (!raw.trim()) return
        try { values.push(JSON.parse(raw)) } catch (error) { issues.push({ line: index + 1, severity: 'error', message: `invalid JSON: ${error instanceof Error ? error.message : String(error)}` }) }
      })
    }
  } else values = Array.isArray(input) ? input : [input]
  const docs: Doc[] = []
  values.forEach((value, index) => {
    if (isTurboDocument(value)) docs.push(value)
    else issues.push({ line: index + 1, severity: 'error', message: `document ${index + 1} is not a simplicio.turbo-run/v1 or simplicio.turbo-request/v1 document` })
  })
  return docs
}

/** True when the text holds turbo documents, so the loader can choose this importer over the JSONL parser. */
export function looksLikeTurbo(text: string): boolean {
  const issues: TraceIssue[] = []
  try { return readDocuments(text, issues).length > 0 } catch { return false }
}

const rootStatus = (doc: Doc): TraceStatus => (doc.status === 'ok' ? 'ok' : 'error')

interface Built { events: RawEvent[]; end: number }

/** Failed lanes are reported by turbo either as objects (`reason`, `excerpt`, `tasks`) or as plain strings. */
function failedLanes(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) return []
  return value.map((entry) => isRecord(entry) ? withoutUndefined({ tasks: Array.isArray(entry.tasks) ? entry.tasks : undefined, reason: str(entry.reason), excerpt: str(entry.excerpt) }) : { reason: String(entry) })
}

function verifyEvent(id: string, doc: Doc, start: number, root: string, name = 'Verify', status?: TraceStatus, extra: Record<string, unknown> = {}): RawEvent | null {
  const verify = doc.verify
  if (!isRecord(verify)) return null
  const passed = verify.passed === true
  return { id, parent: root, kind: 'verify', name, start, status: status ?? (passed ? 'ok' : 'error'), attrs: withoutUndefined({ command: str(verify.command), passed, returncode: num(verify.returncode), output_tail: str(verify.output_tail), ...extra }) }
}

function providerRun(doc: Doc, prefix: string, offset: number): Built {
  const id = (local: string) => `${prefix}${local}`
  const root = id('run')
  const events: RawEvent[] = []
  const wall = num(doc.wall_s)
  const head = withoutUndefined({ mode: 'provider', model: str(doc.model), reasoning: str(doc.reasoning), session_pinned: typeof doc.session_pinned === 'boolean' ? doc.session_pinned : undefined, repo: baseName(doc.repo) })
  const rootEvent: RawEvent = { id: root, parent: null, kind: 'step', name: 'simplicio-loop turbo', start: offset, status: rootStatus(doc), attrs: head }
  events.push(rootEvent)

  if (doc.status === 'blocked') {
    events.push({ id: id('blocked'), parent: root, kind: 'step', name: 'Blocked before any work', start: offset, status: 'error', attrs: withoutUndefined({ reason_code: str(doc.reason_code), detail: str(doc.detail), fix: str(doc.fix) }) })
    rootEvent.end = offset
    return { events, end: offset }
  }

  let cursor = offset
  events.push({ id: id('survey'), parent: root, kind: 'tool', name: 'Mapper survey', start: cursor, status: 'ok', attrs: { tool: 'simplicio-mapper', note: 'The repository map is surveyed once and is the byte-identical header of every model call.' } })

  const calls = (Array.isArray(doc.calls) ? doc.calls : []).filter(isRecord)
  const retry = isRecord(doc.verify_retry) && doc.verify_retry.attempted === true && isRecord(doc.verify) ? doc.verify_retry : undefined
  const repairCall = retry && calls.length ? calls[calls.length - 1] : undefined
  const laneCalls = repairCall ? calls.slice(0, -1) : calls
  const llm = (local: string, call: Doc, index: number, purpose?: string) => {
    const latency = num(call.latency_s)
    const flags = [call.warm === true ? 'warm-up' : '', call.hedged === true ? 'hedged' : '', purpose ?? ''].filter(Boolean)
    const event: RawEvent = {
      id: id(local), parent: root, kind: 'llm_call', name: `Model call ${index}${flags.length ? ` · ${flags.join(' · ')}` : ''}`, start: cursor, status: 'ok',
      attrs: withoutUndefined({ model: str(doc.model), provider: str(call.provider), prompt_tokens: num(call.prompt_tokens), cached_tokens: num(call.cached_tokens), completion_tokens: num(call.completion_tokens), latency_s: latency, warm: call.warm === true, hedged: call.hedged === true, purpose }),
    }
    if (latency !== undefined) { event.end = cursor + latency; cursor += latency }
    events.push(event)
  }
  laneCalls.forEach((call, index) => llm(`call-${index + 1}`, call, index + 1))

  const failed = failedLanes(doc.failed)
  events.push({ id: id('apply'), parent: root, kind: 'file_edit', name: 'dev-cli apply', start: cursor, status: failed.length ? 'error' : 'ok', attrs: withoutUndefined({ applied: Array.isArray(doc.applied) ? doc.applied : undefined, failed, tasks: num(doc.tasks) }) })
  failed.forEach((lane, index) => events.push({ id: id(`apply-failed-${index + 1}`), parent: id('apply'), kind: 'file_edit', name: `Plan rejected${typeof lane.reason === 'string' ? `: ${lane.reason}` : ''}`, start: cursor, status: 'error', attrs: lane }))

  if (isRecord(doc.verify)) {
    if (retry && repairCall) {
      events.push(verifyEvent(id('verify-1'), doc, cursor, root, 'Verify (first run)', 'error', { passed: false, note: 'First verify run failed. turbo-run/v1 only keeps the output of the last run.', output_tail: undefined, returncode: undefined })!)
      llm('repair', repairCall, calls.length, 'repair')
      events.push({ id: id('reapply'), parent: root, kind: 'file_edit', name: 'dev-cli re-apply (repair plan)', start: cursor, status: retry.applied === true ? 'ok' : 'error', attrs: withoutUndefined({ applied: retry.applied === true, reason: str(retry.reason) }) })
      if (retry.applied === true) events.push(verifyEvent(id('verify-2'), doc, cursor, root, 'Verify (after repair)')!)
    } else events.push(verifyEvent(id('verify-1'), doc, cursor, root)!)
  }

  const end = Math.max(offset + (wall ?? 0), cursor)
  rootEvent.end = end
  Object.assign(rootEvent.attrs, withoutUndefined({ tasks: num(doc.tasks), model_calls: num(doc.model_calls), retries: num(doc.retries), hedged_calls: num(doc.hedged_calls), tokens: isRecord(doc.tokens) ? doc.tokens : undefined, cache_hit_pct: num(doc.cache_hit_pct), cost_usd: num(doc.cost_usd), wall_s: wall }))
  return { events, end }
}

function hostRun(request: Doc | undefined, applies: Doc[], prefix: string, offset: number): Built {
  const id = (local: string) => `${prefix}${local}`
  const root = id('run')
  const events: RawEvent[] = []
  const last = applies[applies.length - 1]
  const status: TraceStatus = last ? rootStatus(last) : 'running'
  const rootEvent: RawEvent = { id: root, parent: null, kind: 'step', name: 'simplicio-loop turbo (host mode)', start: offset, status, attrs: withoutUndefined({ mode: 'host', repo: baseName((request ?? applies[0])?.repo) }) }
  events.push(rootEvent)
  let cursor = offset

  if (request) {
    events.push({ id: id('survey'), parent: root, kind: 'tool', name: 'Mapper survey', start: cursor, status: 'ok', attrs: { tool: 'simplicio-mapper', note: 'Reads the repository once; the map is cached while the tree is unchanged. Files named in the request become target and context.' } })
    const tasks = Array.isArray(request.tasks) ? request.tasks.length : num(request.tasks)
    events.push({ id: id('plan-request'), parent: root, kind: 'step', name: 'Plan request', start: cursor, status: 'ok', attrs: withoutUndefined({ mode: 'host', status: str(request.status), plan_path: str(request.plan_path), apply: str(request.apply), tasks, prompt_chars: str(request.prompt)?.length }) })
    events.push({
      id: id('host-plan'), parent: root, kind: 'llm_call', name: 'Host model writes the plan', start: cursor, status: applies.length ? 'ok' : 'running',
      attrs: withoutUndefined({ provider: 'host', model: 'invoking agent (host model)', note: 'Host mode makes no LLM call in the loop: the model of the invoking agent writes the plan itself, so there is no token or cost data.', plan_path: str(request.plan_path), prompt_preview: preview(request.prompt) || undefined }),
    })
  }

  applies.forEach((doc, index) => {
    const n = index + 1
    if (index > 0) events.push({ id: id(index === 1 ? 'host-fix' : `host-fix-${index}`), parent: root, kind: 'llm_call', name: 'Host model fixes the plan', start: cursor, status: 'ok', attrs: { provider: 'host', model: 'invoking agent (host model)', note: 'The failure reason goes back to the invoking agent, which fixes the plan once.' } })
    const failed = failedLanes(doc.failed)
    const wall = num(doc.wall_s)
    // A run can fail because the plan was rejected (apply failed) or because verify failed (apply itself worked).
    const verifyFailed = isRecord(doc.verify) && doc.verify.passed === false
    const applied = !failed.length && doc.status !== 'blocked' && (doc.status === 'ok' || verifyFailed)
    const apply: RawEvent = {
      id: id(`apply-${n}`), parent: root, kind: 'file_edit', name: index > 0 ? 'dev-cli re-apply' : 'dev-cli apply', start: cursor, status: applied ? 'ok' : 'error',
      attrs: withoutUndefined({ applied: Array.isArray(doc.applied) ? doc.applied : undefined, failed, reapply: index > 0 ? true : undefined, reason_code: str(doc.reason_code), detail: str(doc.detail), wall_s: wall }),
    }
    if (wall !== undefined) { apply.end = cursor + wall; cursor += wall }
    events.push(apply)
    const verify = verifyEvent(id(`verify-${n}`), doc, cursor, root, index > 0 ? 'Verify (after re-apply)' : 'Verify')
    if (verify) events.push(verify)
  })

  const end = last ? cursor : undefined
  if (end !== undefined) rootEvent.end = end
  return { events, end: end ?? cursor }
}

export function turboToTrace(input: unknown, options: TurboOptions = {}): TraceParseResult {
  const issues: TraceIssue[] = []
  const docs = readDocuments(input, issues)
  if (!docs.length) {
    if (!issues.length) issues.push({ line: 1, severity: 'error', message: 'no simplicio.turbo-run/v1 or simplicio.turbo-request/v1 document found' })
    return { trace: null, issues }
  }
  if (issues.some((issue) => issue.severity === 'error')) return { trace: null, issues }

  type Group = { request?: Doc; applies: Doc[]; provider?: Doc }
  const groups: Group[] = []
  for (const doc of docs) {
    const current = groups[groups.length - 1]
    if (isRequest(doc)) groups.push({ request: doc, applies: [] })
    else if (doc.mode === 'host') { if (current && !current.provider) current.applies.push(doc); else groups.push({ applies: [doc] }) }
    else groups.push({ provider: doc, applies: [] })
  }

  const events: RawEvent[] = []
  let offset = 0
  groups.forEach((group, index) => {
    const prefix = groups.length > 1 ? `r${index + 1}.` : ''
    const built = group.provider ? providerRun(group.provider, prefix, offset) : hostRun(group.request, group.applies, prefix, offset)
    events.push(...built.events)
    offset = built.end
  })

  const modes = new Set(groups.map((group) => (group.provider ? 'provider mode' : 'host mode')))
  const header = { title: `simplicio-loop turbo · ${[...modes].join(' + ')}`, source: `${docs.some(isRequest) ? `${REQUEST_SCHEMA} + ` : ''}${RUN_SCHEMA} (converted)`, ...(options.synthetic ? { synthetic: true } : {}) }
  const built = buildTrace(events, header)
  return { trace: built.trace, issues: [...issues, ...built.issues] }
}
