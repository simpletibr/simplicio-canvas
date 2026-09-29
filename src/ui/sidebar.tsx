import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { LAYERS, type LayerId } from '../domain/architecture'
import type { EntryKind, EntryPoint } from '../domain/entrypoints'
import type { RequestShape } from '../domain/request'
import type { TraceEvent } from '../domain/trace'
import { callRoots, findSymbols, type Project } from '../domain/project'
import { SAMPLE_TRACES } from './loaders'
import type { Translate } from './messages'
import { KindGlyph } from './nodes'

const ENTRY_ORDER: EntryKind[] = ['console_script', 'cli_command', 'mcp_tool', 'main', 'function']

export function ArchitectureSide({ t, project, onExpandAll, onCollapseAll }: { t: Translate; project: Project; onExpandAll(): void; onCollapseAll(): void }) {
  return (
    <div className="side-body">
      <p className="muted">{t('arch.hint')}</p>
      <div className="row">
        <button type="button" className="btn small" onClick={onExpandAll}>{t('arch.expandAll')}</button>
        <button type="button" className="btn small" onClick={onCollapseAll}>{t('arch.collapseAll')}</button>
      </div>
      <ul className="legend" aria-label={t('details.layer')}>
        {(Object.keys(LAYERS) as LayerId[]).map((layer) => <li key={layer}><span className="layer-dot" style={{ background: LAYERS[layer].color }} aria-hidden="true" />{t(`layer.${layer}` as 'layer.domain')}</li>)}
      </ul>
      <p className="muted">{t('side.stats', { files: project.files.size, symbols: project.symbols.size, calls: project.mapper?.calls.length ?? 0 })}</p>
    </div>
  )
}

export interface FlowsSideProps { t: Translate; project: Project; entries: EntryPoint[]; entryId: string | null; onEntry(id: string): void; onPickFunction(symbolId: string): void; depth: number; onDepth(value: number): void }

export function FlowsSide({ t, project, entries, entryId, onEntry, onPickFunction, depth, onDepth }: FlowsSideProps) {
  const [filter, setFilter] = useState('')
  const groups = useMemo(() => {
    const needle = filter.trim().toLowerCase()
    const matching = entries.filter((entry) => !needle || `${entry.name} ${entry.file}`.toLowerCase().includes(needle))
    return ENTRY_ORDER.map((kind) => ({ kind, entries: matching.filter((entry) => entry.kind === kind) })).filter((group) => group.entries.length)
  }, [entries, filter])
  const matches = useMemo(() => findSymbols(project, filter), [project, filter])
  const roots = useMemo(() => (project.symbols.size ? callRoots(project, 8).filter((root) => !entries.some((entry) => entry.symbol === root.id)) : []), [project, entries])
  const suggestions = filter.trim().length >= 2 ? matches : roots
  const hasFlows = Boolean(project.mapper && project.symbols.size)
  return (
    <div className="side-body">
      <p className="muted">{t('flow.hint')}</p>
      {hasFlows ? (
        <>
          <input type="search" className="input" value={filter} onChange={(event) => setFilter(event.target.value)} placeholder={t('side.filter')} aria-label={t('side.filter')} />
          <label className="inline">{t('flow.depth')}
            <select value={depth} onChange={(event) => onDepth(Number(event.target.value))}>{[1, 2, 3, 4, 5].map((value) => <option key={value} value={value}>{value}</option>)}</select>
          </label>
          {groups.map((group) => (
            <section key={group.kind} className="entry-group">
              <h3>{t(`entry.${group.kind}` as 'entry.main')} <span className="count">{group.entries.length}</span></h3>
              <ul className="entries">
                {group.entries.map((entry) => (
                  <li key={entry.id}>
                    <button type="button" className={entry.id === entryId ? 'entry active' : 'entry'} aria-pressed={entry.id === entryId} onClick={() => onEntry(entry.id)}>
                      <KindGlyph kind="entry" /><span className="entry-name">{entry.name}</span>{' '}<span className="entry-file">{entry.file}:{entry.line}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
          {!groups.length && !suggestions.length ? <p className="muted">{t('side.noEntries')}</p> : null}
          {suggestions.length ? (
            <section className="entry-group">
              <h3>{filter.trim().length >= 2 ? t('side.functions') : t('side.roots')} <span className="count">{suggestions.length}</span></h3>
              <ul className="entries">
                {suggestions.map((symbol) => (
                  <li key={symbol.id}>
                    <button type="button" className="entry" onClick={() => onPickFunction(symbol.id)}>
                      <KindGlyph kind="function" /><span className="entry-name">{symbol.label}</span>{' '}<span className="entry-file">{symbol.file}:{symbol.line}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      ) : <p className="muted">{t('side.noMapper')}</p>}
      {project.mapper?.coverage?.truncated ? <p className="warn">{t('side.truncated', { emitted: project.mapper.coverage.emitted ?? '?', observed: project.mapper.coverage.observed ?? '?' })}</p> : null}
      <p className="muted small-print">{t('side.stats', { files: project.files.size, symbols: project.symbols.size, calls: project.mapper?.calls.length ?? 0 })}{project.mapper?.producer?.version ? ` · ${t('side.mapper', { version: project.mapper.producer.version })}` : ''}</p>
    </div>
  )
}

export interface RunSideProps {
  t: Translate
  mode: 'simulated' | 'real'
  onMode(mode: 'simulated' | 'real'): void
  request: string
  onRequest(value: string): void
  entries: EntryPoint[]
  simChoice: string
  onSimChoice(value: string): void
  depth: number
  onDepth(value: number): void
  onSimulate(): void
  shape?: RequestShape
  events: TraceEvent[]
  index: number
  onSeek(index: number): void
  realTitle?: string
  realSample: boolean
  sampleId: string
  onSample(id: string): void
  onTraceFile(file: File): void
  canLoadTrace: boolean
}

function shapeText(t: Translate, shape: RequestShape): string {
  const base = shape.kind === 'single' ? t('run.shape.single') : shape.kind === 'queue' ? t('run.shape.queue')
    : t(`run.shape.${shape.kind}` as 'run.shape.mixed', { count: shape.tasks.length, lanes: shape.lanes.length })
  return shape.provider ? `${base} · ${t('run.provider')}` : base
}

function StepList({ t, events, index, onSeek }: Pick<RunSideProps, 't' | 'events' | 'index' | 'onSeek'>) {
  const active = useRef<HTMLButtonElement>(null)
  useEffect(() => { active.current?.scrollIntoView?.({ block: 'nearest' }) }, [index, events])
  if (!events.length) return null
  return (
    <section className="steps-box">
      <h3>{t('run.steps')} <span className="count">{events.length}</span></h3>
      <ol className="steps" aria-label={t('run.steps')}>
        {events.map((event, at) => (
          <li key={event.id}>
            <button type="button" ref={at === index ? active : undefined} className={`step${at === index ? ' active' : ''}${at < index ? ' past' : ''} status-${event.status}`} aria-current={at === index ? 'step' : undefined} onClick={() => onSeek(at)}>
              <span className="step-n">{at + 1}</span><KindGlyph kind={event.kind} /><span className="step-name">{event.name}</span>
              {event.status === 'unknown' ? <span className="step-mark" title={t('run.unknown')}>?</span> : event.status === 'error' ? <span className="step-mark err" title={t('status.error')}>!</span> : null}
            </button>
          </li>
        ))}
      </ol>
    </section>
  )
}

export function RunSide(props: RunSideProps) {
  const { t, mode, onMode, request, onRequest, entries, simChoice, onSimChoice, depth, onDepth, onSimulate, shape, events, index, onSeek } = props
  const examples = [t('run.example1'), t('run.example2'), t('run.example3'), t('run.example4')]
  const pickFile = (event: ChangeEvent<HTMLInputElement>) => { const file = event.target.files?.[0]; if (file) props.onTraceFile(file); event.target.value = '' }
  return (
    <div className="side-body run-side">
      <div className="segmented" role="group" aria-label={t('run.mode')}>
        <button type="button" className={mode === 'simulated' ? 'on' : ''} aria-pressed={mode === 'simulated'} onClick={() => onMode('simulated')}>{t('run.simulated')}</button>
        <button type="button" className={mode === 'real' ? 'on' : ''} aria-pressed={mode === 'real'} onClick={() => onMode('real')}>{t('run.real')}</button>
      </div>

      {mode === 'simulated' ? (
        <form className="sim-form" onSubmit={(event) => { event.preventDefault(); onSimulate() }}>
          <label htmlFor="sim-request">{t('run.request')}</label>
          <textarea id="sim-request" className="input" rows={3} value={request} onChange={(event) => onRequest(event.target.value)} placeholder={t('run.requestPlaceholder')} onKeyDown={(event) => { if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) { event.preventDefault(); onSimulate() } }} />
          <div className="chips examples" aria-label={t('run.examples')}>
            {examples.map((text) => <button type="button" className="chip chip-button" key={text} onClick={() => onRequest(text)} title={text}>{text.length > 34 ? `${text.slice(0, 33)}…` : text}</button>)}
          </div>
          <label className="inline" htmlFor="sim-flow">{t('run.flow')}
            <select id="sim-flow" value={simChoice} onChange={(event) => onSimChoice(event.target.value)}>
              <option value="loop">{t('run.flowLoop')}</option>
              {entries.map((entry) => <option key={entry.id} value={entry.id}>{entry.name} · {t(`entry.${entry.kind}` as 'entry.main')}</option>)}
            </select>
          </label>
          {simChoice !== 'loop' ? (
            <label className="inline" htmlFor="sim-depth">{t('run.depth')}
              <select id="sim-depth" value={depth} onChange={(event) => onDepth(Number(event.target.value))}>{[1, 2, 3, 4].map((value) => <option key={value} value={value}>{value}</option>)}</select>
            </label>
          ) : null}
          <button type="submit" className="btn primary wide">{t('run.simulate')}</button>
          {shape ? <p className="muted read-as">{t('run.readAs', { shape: shapeText(t, shape) })}{shape.files.length ? ` · ${shape.files.join(', ')}` : ''}</p> : null}
        </form>
      ) : (
        <div className="real-form">
          {props.canLoadTrace ? (
            <label className="btn wide file-btn">{t('trace.load')}<input type="file" accept=".jsonl,.json,.ndjson,.txt,application/json" onChange={pickFile} /></label>
          ) : null}
          <label className="inline" htmlFor="sample-trace">{t('run.samples')}
            <select id="sample-trace" value={props.sampleId} onChange={(event) => { if (event.target.value) props.onSample(event.target.value) }}>
              <option value="">{t('run.pickSample')}</option>
              {SAMPLE_TRACES.map((sample) => <option key={sample.id} value={sample.id}>{sample.title}</option>)}
            </select>
          </label>
          {props.realTitle ? <p className="real-title"><strong>{props.realTitle}</strong>{props.realSample ? <span className="chip chip-sim">{t('run.sampleBadge')}</span> : null}</p> : <p className="muted">{t('run.noTrace')}</p>}
        </div>
      )}
      <StepList t={t} events={events} index={index} onSeek={onSeek} />
    </div>
  )
}
