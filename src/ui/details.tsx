import type { ReactNode } from 'react'
import { LAYERS, classifyPath, type LayerId } from '../domain/architecture'
import type { EntryPoint } from '../domain/entrypoints'
import { formatDuration, formatTokens } from '../domain/flow-graph'
import type { Locale } from '../domain/locale'
import { describeSymbol, type Project } from '../domain/project'
import type { TraceEvent, TraceHeader } from '../domain/trace'
import { summarizeTrace } from '../domain/trace-summary'
import { asNumber, asString, formatCost } from './format'
import { KindGlyph } from './nodes'
import type { Translate } from './messages'

const Section = ({ title, children }: { title: string; children: ReactNode }) => <section className="d-section"><h3>{title}</h3>{children}</section>
const Row = ({ label, children }: { label: string; children: ReactNode }) => <div className="d-row"><dt>{label}</dt><dd>{children}</dd></div>
const Chips = ({ items, empty }: { items: string[]; empty?: string }) => items.length ? <div className="chips">{items.map((item) => <span className="chip" key={item}>{item}</span>)}</div> : <p className="muted">{empty}</p>

function Code({ lines, start, mark }: { lines: string[]; start: number; mark?: number }) {
  return (
    <pre className="code" tabIndex={0}><code>{lines.map((line, index) => (
      <span key={start + index} className={start + index === mark ? 'code-line hl' : 'code-line'}><span className="ln" aria-hidden="true">{start + index}</span>{line || ' '}{'\n'}</span>
    ))}</code></pre>
  )
}

const layerOf = (path: string) => LAYERS[classifyPath(path) as LayerId]

/* ─────────────────────────── static views ─────────────────────────── */

interface StaticProps {
  t: Translate
  project: Project
  selectedId: string | null
  entry?: EntryPoint
  visible: ReadonlySet<string>
  onSelect(id: string): void
  onSimulate?(): void
}

function Overview({ t, project }: Pick<StaticProps, 't' | 'project'>) {
  const languages = Object.entries(project.analysis.languages).sort((a, b) => b[1] - a[1]).slice(0, 8)
  return (
    <>
      <h2>{project.name}</h2>
      <p className="muted">{t('details.empty')}</p>
      <Section title={t('details.overview')}>
        <dl className="d-list">
          <Row label={t('details.files')}>{project.files.size}</Row>
          <Row label={t('details.symbols')}>{project.symbols.size}</Row>
          {project.mapper?.producer?.version ? <Row label="Mapper">{project.mapper.producer.version}{project.mapper.coverage?.status ? ` · ${t('details.coverage', { status: project.mapper.coverage.status })}` : ''}</Row> : null}
        </dl>
        <Chips items={languages.map(([name, count]) => `${name} ${count}`)} />
      </Section>
    </>
  )
}

function FileDetails({ t, project, path }: { t: Translate; project: Project; path: string }) {
  const file = project.files.get(path)
  if (!file) return null
  const imports = project.imports.filter((edge) => edge.from === path).map((edge) => edge.to)
  const importedBy = project.imports.filter((edge) => edge.to === path).map((edge) => edge.from)
  const layer = layerOf(path)
  const symbols = project.symbolsByFile.get(path) ?? []
  const head = file.content.split('\n').slice(0, 40)
  return (
    <>
      <h2><KindGlyph kind="file" /> {path.split('/').pop()}</h2>
      <p className="path">{path}</p>
      <dl className="d-list">
        <Row label={t('details.language')}>{file.language}</Row>
        <Row label={t('details.layer')}><span className="layer-dot" style={{ background: layer.color }} aria-hidden="true" />{t(`layer.${classifyPath(path)}` as 'layer.domain')}</Row>
        <Row label={t('details.files')}>{file.lines} · {file.size} B</Row>
      </dl>
      <Section title={t('details.imports')}><Chips items={imports} empty={t('details.none')} /></Section>
      <Section title={t('details.importedBy')}><Chips items={importedBy} empty={t('details.none')} /></Section>
      {symbols.length ? <Section title={t('details.symbols')}><Chips items={symbols.map((symbol) => symbol.label)} /></Section> : null}
      <Section title={t('details.source')}><Code lines={head} start={1} />{file.lines > 40 ? <p className="muted">{t('details.truncated')}</p> : null}</Section>
    </>
  )
}

function GroupDetails({ t, project, dir }: { t: Translate; project: Project; dir: string }) {
  const files = [...project.files.values()].filter((file) => file.path.startsWith(`${dir}/`))
  const languages = new Map<string, number>()
  for (const file of files) languages.set(file.language, (languages.get(file.language) ?? 0) + 1)
  return (
    <>
      <h2><KindGlyph kind="group" /> {dir.split('/').pop()}/</h2>
      <p className="path">{dir}</p>
      <dl className="d-list"><Row label={t('details.files')}>{files.length}</Row></dl>
      <Chips items={[...languages].sort((a, b) => b[1] - a[1]).map(([name, count]) => `${name} ${count}`)} />
      <Section title={t('details.files')}><ul className="plain">{files.slice(0, 14).map((file) => <li key={file.path}>{file.path.slice(dir.length + 1)}</li>)}</ul>{files.length > 14 ? <p className="muted">+{files.length - 14}</p> : null}</Section>
    </>
  )
}

function SymbolDetails({ t, project, id, entry, visible, onSelect, onSimulate }: StaticProps & { id: string }) {
  const details = describeSymbol(project, id)
  if (!details) return null
  const { symbol } = details
  const isEntry = entry?.symbol === id
  const link = (target: string, label: string, line: number, guarded: boolean, clickable: boolean) => (
    <li key={`${target}:${line}`}>
      {clickable ? <button type="button" className="link" onClick={() => onSelect(target)}>{label}</button> : <span>{label}</span>}
      <span className="muted"> · {t('details.line', { line })}{guarded ? ' · ?' : ''}</span>
    </li>
  )
  return (
    <>
      <h2><KindGlyph kind={isEntry ? 'entry' : symbol.kind === 'class' ? 'class' : 'function'} /> {isEntry ? entry!.name : symbol.label}</h2>
      <p className="path">{symbol.file}:{symbol.line}</p>
      {isEntry ? <p className="chips"><span className="chip chip-entry">{t(`entry.${entry!.kind}` as 'entry.main')}</span><span className="muted">{entry!.evidence}</span></p> : null}
      {isEntry && onSimulate ? <button type="button" className="btn small primary" onClick={onSimulate}>{t('flow.simulate')}</button> : null}
      <Section title={t('details.summary')}>{details.summary ? <p>{details.doc && details.doc !== details.summary ? details.doc : details.summary}</p> : <p className="muted">{t('details.noSummary')}</p>}</Section>
      {details.signature ? <Section title={t('details.signature')}><pre className="code sig"><code>{details.signature}</code></pre></Section> : null}
      {details.raises.length ? <Section title={t('details.raises')}><Chips items={details.raises} /></Section> : null}
      <Section title={t('details.calls')}>
        {details.callees.length ? <ul className="plain">{details.callees.map((call) => link(call.to, project.symbols.get(call.to)?.label ?? call.to, call.line, call.guards.length > 0 || Boolean(call.after), true))}</ul> : <p className="muted">{t('details.none')}</p>}
        {details.ambiguous.length ? <p className="muted">{t('details.ambiguous')}: {details.ambiguous.map((item) => `${item.candidates[0]?.split('::')[1] ?? '?'} (${t('details.line', { line: item.line })})`).join(', ')}</p> : null}
      </Section>
      {details.external.length ? <Section title={t('details.external')}><Chips items={details.external} /></Section> : null}
      <Section title={t('details.calledBy')}>
        {details.callers.length ? <ul className="plain">{details.callers.map((call) => link(call.from, project.symbols.get(call.from)?.label ?? call.from, call.line, false, visible.has(call.from)))}</ul> : <p className="muted">{t('details.none')}</p>}
      </Section>
      {details.excerpt ? <Section title={t('details.source')}><Code lines={details.excerpt.lines} start={details.excerpt.start} mark={symbol.line} />{details.excerpt.truncated ? <p className="muted">{t('details.truncated')}</p> : null}</Section> : null}
      <p className="muted small-print">{t('details.staticNote')}</p>
    </>
  )
}

export function StaticDetails(props: StaticProps) {
  const { selectedId } = props
  if (!selectedId) return <Overview t={props.t} project={props.project} />
  if (selectedId.startsWith('file:')) return <FileDetails t={props.t} project={props.project} path={selectedId.slice(5)} />
  if (selectedId.startsWith('dir:')) return <GroupDetails t={props.t} project={props.project} dir={selectedId.slice(4)} />
  return <SymbolDetails {...props} id={selectedId} />
}

/* ─────────────────────────────── run replay ─────────────────────────────── */

const KNOWN = new Set(['note', 'model', 'provider', 'prompt_tokens', 'cached_tokens', 'completion_tokens', 'latency_s', 'cost_usd', 'prompt_preview', 'response_preview', 'warm', 'hedged', 'explanation', 'explanation_parts', 'simulated', 'node', 'edge', 'flow', 'unknown', 'request', 'command', 'passed', 'returncode', 'output_tail', 'applied', 'failed'])

function Preview({ label, text, missing }: { label: string; text?: string; missing: string }) {
  return <Section title={label}>{text ? <pre className="code wrap" tabIndex={0}><code>{text}</code></pre> : <p className="muted">{missing}</p>}</Section>
}

function LlmDetails({ t, event, totals }: { t: Translate; event: TraceEvent; totals?: number }) {
  const a = event.attrs
  const cost = asNumber(a.cost_usd)
  const latency = asNumber(a.latency_s) ?? (event.end === null ? undefined : event.end - event.start)
  return (
    <>
      <dl className="d-list">
        <Row label={t('llm.model')}>{asString(a.model) ?? '—'}</Row>
        <Row label={t('llm.provider')}>{asString(a.provider) ?? '—'}</Row>
        <Row label={t('llm.promptTokens')}>{asNumber(a.prompt_tokens) !== undefined ? formatTokens(asNumber(a.prompt_tokens)!) : '—'}</Row>
        <Row label={t('llm.cachedTokens')}>{asNumber(a.cached_tokens) !== undefined ? formatTokens(asNumber(a.cached_tokens)!) : '—'}</Row>
        <Row label={t('llm.completionTokens')}>{asNumber(a.completion_tokens) !== undefined ? formatTokens(asNumber(a.completion_tokens)!) : '—'}</Row>
        <Row label={t('llm.latency')}>{latency !== undefined ? formatDuration(latency) : '—'}</Row>
        <Row label={t('llm.cost')}>{cost !== undefined ? formatCost(cost) : <span className="muted">{totals !== undefined ? `${t('llm.noCost')} ${formatCost(totals)}` : t('llm.notReported')}</span>}</Row>
      </dl>
      {a.warm === true || a.hedged === true ? <div className="chips">{a.warm === true ? <span className="chip">warm-up</span> : null}{a.hedged === true ? <span className="chip">hedged</span> : null}</div> : null}
      <Preview label={t('llm.prompt')} text={asString(a.prompt_preview)} missing={t('llm.notCaptured')} />
      <Preview label={t('llm.response')} text={asString(a.response_preview)} missing={t('llm.notCaptured')} />
    </>
  )
}

function KindDetails({ t, event }: { t: Translate; event: TraceEvent }) {
  const a = event.attrs
  const failed = Array.isArray(a.failed) ? a.failed.filter((entry): entry is Record<string, unknown> => typeof entry === 'object' && entry !== null) : []
  return (
    <>
      {asString(a.command) ? <Section title={t('kind.command')}><pre className="code wrap"><code>{asString(a.command)}</code></pre></Section> : null}
      {typeof a.passed === 'boolean' ? <dl className="d-list"><Row label="passed">{String(a.passed)}</Row>{asNumber(a.returncode) !== undefined ? <Row label="returncode">{asNumber(a.returncode)}</Row> : null}</dl> : null}
      {asString(a.output_tail) ? <Section title="output"><pre className="code wrap" tabIndex={0}><code>{asString(a.output_tail)}</code></pre></Section> : null}
      {Array.isArray(a.applied) ? <Section title="applied"><Chips items={a.applied.map(String)} empty={t('details.none')} /></Section> : null}
      {failed.length ? <Section title="failed"><ul className="plain">{failed.map((entry, index) => <li key={index}><strong>{String(entry.reason ?? '')}</strong>{entry.excerpt ? <pre className="code wrap"><code>{String(entry.excerpt)}</code></pre> : null}</li>)}</ul></Section> : null}
    </>
  )
}

function Explanation({ t, event }: { t: Translate; event: TraceEvent }) {
  const parts = event.attrs.explanation_parts as { what?: string; why?: string; io?: string; failure?: string; notes?: string[] } | undefined
  if (!parts) return <pre className="code wrap"><code>{asString(event.attrs.explanation)}</code></pre>
  return (
    <div className="explain">
      {parts.what ? <Section title={t('explain.what')}><p>{parts.what}</p></Section> : null}
      {parts.why ? <Section title={t('explain.why')}><p>{parts.why}</p></Section> : null}
      {parts.io ? <Section title={t('explain.io')}><p>{parts.io}</p></Section> : null}
      {parts.failure ? <Section title={t('explain.failure')}><p>{parts.failure}</p></Section> : null}
      {parts.notes?.length ? <Section title={t('explain.notes')}>{parts.notes.map((note) => <p key={note}>{note}</p>)}</Section> : null}
      {event.status === 'unknown' ? <p className="unknown-note">? {t('run.unknown')}</p> : null}
    </div>
  )
}

export interface RunDetailsProps {
  t: Translate
  locale: Locale
  events: TraceEvent[]
  index: number
  header: TraceHeader
  source: 'simulated' | 'real'
  notes: string[]
}

export function RunDetails({ t, events, index, header, source, notes }: RunDetailsProps) {
  const event = events[Math.min(index, events.length - 1)]
  if (!event) return <p className="muted">{t('details.empty')}</p>
  const simulated = event.attrs.simulated === true
  const totals = source === 'real' ? summarizeTrace({ schema: 'simplicio.trace/v1', header, events }) : undefined
  const extra = Object.entries(event.attrs).filter(([key]) => !KNOWN.has(key))
  return (
    <>
      {totals ? (
        <section className="summary" aria-label={t('summary.title')}>
          <h3>{t('summary.title')}</h3>
          <dl className="d-list compact">
            <Row label={t('summary.events')}>{totals.events}</Row>
            <Row label={t('summary.llmCalls')}>{totals.llmCalls}</Row>
            {totals.promptTokens !== undefined ? <Row label={t('summary.tokens')}>{formatTokens(totals.promptTokens)} → {formatTokens(totals.completionTokens ?? 0)}</Row> : null}
            {totals.costUsd !== undefined ? <Row label={t('summary.cost')}>{formatCost(totals.costUsd)}</Row> : null}
            <Row label={t('summary.duration')}>{formatDuration(totals.durationS)}</Row>
          </dl>
        </section>
      ) : null}
      <div className="step-head">
        <span className="chip">{t('player.step', { n: index + 1, total: events.length, name: '' }).replace(/:\s*$/, '')}</span>
        <span className="chip"><KindGlyph kind={event.kind} /> {t(`kind.${event.kind}` as 'kind.step')}</span>
        <span className={`chip chip-${event.status}`}>{event.status === 'unknown' ? '? ' : ''}{t(`status.${event.status}` as 'status.ok')}</span>
        {simulated ? <span className="chip chip-sim">{t('run.simulatedBadge')}</span> : null}
        {header.synthetic && !simulated ? <span className="chip chip-sim">{t('run.sampleBadge')}</span> : null}
      </div>
      <h2>{event.name}</h2>
      <p className="muted">{t('step.time', { time: formatDuration(event.start) })}{event.end !== null ? ` · ${formatDuration(event.end - event.start)}` : ''}</p>
      {!simulated && asString(event.attrs.note) ? <p className="note">{asString(event.attrs.note)}</p> : null}
      {simulated ? <Explanation t={t} event={event} /> : (
        <>
          {event.kind === 'llm_call' ? <LlmDetails t={t} event={event} totals={totals?.costUsd} /> : <KindDetails t={t} event={event} />}
          {asString(event.attrs.explanation) ? <Explanation t={t} event={event} /> : null}
        </>
      )}
      {!simulated && extra.length ? (
        <details className="d-section"><summary>{t('attrs.more')}</summary>
          <dl className="d-list">{extra.map(([key, value]) => <Row key={key} label={key}>{typeof value === 'string' ? value : JSON.stringify(value)}</Row>)}</dl>
        </details>
      ) : null}
      {simulated ? <p className="muted small-print">{t('explain.simulatedNote')}</p> : null}
      {notes.map((note) => <p className="muted small-print" key={note}>{note}</p>)}
    </>
  )
}
