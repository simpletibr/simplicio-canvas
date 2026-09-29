import { ReactFlowProvider } from '@xyflow/react'
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { policyFor } from '../domain/demo-policy'
import { functionEntry, type EntryPoint } from '../domain/entrypoints'
import { normalizeGitHubRepository } from '../domain/github-import'
import { buildArchitecture, buildEntryFlow, defaultExpanded, groupIds } from '../domain/flows'
import type { FlowGraph } from '../domain/flow-graph'
import { layoutGraph } from '../domain/layout'
import { detectLocale, type Locale } from '../domain/locale'
import { toMermaid } from '../domain/mermaid'
import { createPlayer, dwellFor, playerReducer } from '../domain/player'
import { buildProject, type Project } from '../domain/project'
import { simulate, type SimulationResult } from '../domain/simulate'
import { type Trace } from '../domain/trace'
import { traceToFlow } from '../domain/trace-flow'
import { EXAMPLE_ARTIFACTS, EXAMPLE_FILES, EXAMPLE_NAME } from '../example'
import { FlowCanvas } from './FlowCanvas'
import { MermaidDialog } from './MermaidDialog'
import { PlayerBar } from './PlayerBar'
import { TopBar, type View } from './TopBar'
import { RunDetails, StaticDetails } from './details'
import { SAMPLE_TRACES, loadTraceText, readFolder } from './loaders'
import { translator } from './messages'
import { nodeOf, runState as computeRunState } from './run-state'
import { ArchitectureSide, FlowsSide, RunSide } from './sidebar'

const LOCALE_KEY = 'simplicio-canvas.locale'
type Notice = { kind: 'info' | 'error' | 'success'; text: string }
interface SimParams { request: string; choice: string; depth: number }
interface RealRun { trace: Trace; title: string; sampleId: string }

const bundledProject = () => buildProject({ name: EXAMPLE_NAME, files: EXAMPLE_FILES, artifacts: EXAMPLE_ARTIFACTS })

function useLocale(): [Locale, (locale: Locale) => void] {
  const [locale, setLocale] = useState<Locale>(() => {
    let stored: string | null = null
    try { stored = localStorage.getItem(LOCALE_KEY) } catch { /* storage may be blocked */ }
    return detectLocale(stored, typeof navigator === 'undefined' ? undefined : navigator.language)
  })
  useEffect(() => { document.documentElement.lang = locale }, [locale])
  return [locale, (next) => { setLocale(next); try { localStorage.setItem(LOCALE_KEY, next) } catch { /* storage may be blocked */ } }]
}

function useReducedMotion(): boolean {
  const query = typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-reduced-motion: reduce)') : null
  const [reduced, setReduced] = useState(query?.matches ?? false)
  useEffect(() => {
    if (!query) return
    const listener = () => setReduced(query.matches)
    query.addEventListener?.('change', listener)
    return () => query.removeEventListener?.('change', listener)
  }, [query])
  return reduced
}

export function App({ demo = __DEMO_MODE__ }: { demo?: boolean }) {
  const policy = policyFor(demo)
  const [locale, setLocale] = useLocale()
  const t = useMemo(() => translator(locale), [locale])
  const reducedMotion = useReducedMotion()

  const [project, setProject] = useState<Project>(bundledProject)
  const [view, setView] = useState<View>('flows')
  const [expanded, setExpanded] = useState<Set<string>>(() => defaultExpanded(project))
  const [entryId, setEntryId] = useState<string | null>(project.entries[0]?.id ?? null)
  const [entryDepth, setEntryDepth] = useState(2)
  const [entryOpen, setEntryOpen] = useState<Set<string>>(new Set())
  const [picked, setPicked] = useState<EntryPoint[]>([])
  const [selected, setSelected] = useState<string | null>(() => project.entries[0]?.symbol ?? null)

  const [runMode, setRunMode] = useState<'simulated' | 'real'>('simulated')
  const [request, setRequest] = useState('')
  const [simChoice, setSimChoice] = useState('loop')
  const [simDepth, setSimDepth] = useState(3)
  const [sim, setSim] = useState<{ params: SimParams; result: SimulationResult } | null>(null)
  const [real, setReal] = useState<RealRun | null>(null)
  const [player, dispatch] = useReducer(playerReducer, undefined, () => createPlayer([]))
  const [follow, setFollow] = useState(true)

  const [link, setLink] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [exporting, setExporting] = useState(false)
  const [dragging, setDragging] = useState(false)

  const entries = useMemo(() => [...project.entries, ...picked], [project, picked])
  const entry = entries.find((candidate) => candidate.id === entryId) ?? null
  const notify = useCallback((kind: Notice['kind'], text: string) => setNotice({ kind, text }), [])
  useEffect(() => {
    if (!notice || notice.kind === 'error') return
    const timer = window.setTimeout(() => setNotice(null), 7000)
    return () => window.clearTimeout(timer)
  }, [notice])

  /* ─────────────── derived graph, layout and replay ─────────────── */
  const realGraph = useMemo(() => (real ? traceToFlow(real.trace, 'real') : null), [real])
  const run = runMode === 'simulated' ? (sim ? { graph: sim.result.graph, trace: sim.result.trace, notes: sim.result.notes } : null) : real && realGraph ? { graph: realGraph, trace: real.trace, notes: [] as string[] } : null
  const events = useMemo(() => run?.trace.events ?? [], [run?.trace])
  const graph: FlowGraph | null = useMemo(() => {
    if (view === 'architecture') return buildArchitecture(project, expanded)
    if (view === 'flows') return entry ? buildEntryFlow(project, entry, { depth: entryDepth, expanded: entryOpen }) : null
    return run?.graph ?? null
  }, [view, project, expanded, entry, entryDepth, entryOpen, run?.graph])
  const layout = useMemo(() => (graph ? layoutGraph(graph) : null), [graph])
  const runState = useMemo(() => (view === 'run' && graph && events.length ? computeRunState(graph, events, player.index) : undefined), [view, graph, events, player.index])

  useEffect(() => { dispatch({ type: 'load', dwell: events.map(dwellFor) }) }, [events])
  // The clock runs outside React: state only changes when the current step is due, not on every animation frame.
  const { playing, index: activeIndex, speed, elapsed, dwell } = player
  useEffect(() => {
    if (!playing) return
    let last = performance.now()
    let waited = 0
    let frame = 0
    const step = (now: number) => {
      waited += Math.min(250, now - last)
      last = now
      if (waited * speed >= (dwell[activeIndex] ?? 0) - elapsed) { dispatch({ type: 'tick', dt: waited }); waited = 0 }
      frame = requestAnimationFrame(step)
    }
    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [playing, activeIndex, speed, elapsed, dwell])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (view !== 'run' || !events.length || event.metaKey || event.ctrlKey || event.altKey) return
      const target = event.target instanceof Element ? event.target : null
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return
      if (event.key === 'ArrowRight') { dispatch({ type: 'next' }); event.preventDefault() }
      else if (event.key === 'ArrowLeft') { dispatch({ type: 'prev' }); event.preventDefault() }
      else if (event.key === 'Home') { dispatch({ type: 'restart' }); event.preventDefault() }
      else if (event.key === ' ' && !target?.closest('button, a, summary')) { dispatch({ type: 'toggle' }); event.preventDefault() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [view, events.length])

  /* ─────────────── loading things ─────────────── */
  const adopt = useCallback((next: Project, message: string) => {
    setProject(next)
    setExpanded(defaultExpanded(next))
    setEntryId(next.entries[0]?.id ?? null)
    setEntryOpen(new Set())
    setPicked([])
    setSelected(next.entries[0]?.symbol ?? null)
    setSim((current) => (current?.params.choice === 'loop' ? current : null))
    setSimChoice('loop')
    setView(next.entries.length ? 'flows' : 'architecture')
    notify('success', message)
  }, [notify])

  const importGitHub = async () => {
    if (!policy.canImportGitHub) return
    let repo
    try { repo = normalizeGitHubRepository(link) } catch (error) { notify('error', error instanceof Error ? error.message : String(error)); return }
    setBusy(true)
    notify('info', t('github.busy', { repo: repo.slug }))
    try {
      const response = await fetch('/api/github/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ repository: repo.slug }) })
      let payload: { name?: string; files?: Array<{ path: string; content: string; size: number }>; mapper?: { available?: boolean; note?: string; artifacts?: unknown }; error?: string }
      try { payload = JSON.parse(await response.text()) } catch { throw new Error(t('github.bridge')) }
      if (!response.ok) throw new Error(payload.error ?? `HTTP ${response.status}`)
      const next = buildProject({ name: payload.name ?? repo.slug, files: payload.files ?? [], artifacts: (payload.mapper?.artifacts ?? undefined) as never })
      adopt(next, next.mapper && next.symbols.size
        ? t('github.done', { name: next.name, files: next.files.size, symbols: next.symbols.size, entries: next.entries.length })
        : t('github.basic', { name: next.name, files: next.files.size, note: payload.mapper?.note ?? '' }))
    } catch (error) {
      notify('error', error instanceof TypeError ? t('github.bridge') : error instanceof Error ? error.message : String(error))
    } finally { setBusy(false) }
  }

  const openFolder = async (list: FileList) => {
    if (!policy.canImportFolder) return
    setBusy(true)
    try {
      const folder = await readFolder(list)
      const next = buildProject(folder)
      adopt(next, t('folder.done', { name: next.name, files: next.files.size, symbols: next.symbols.size, entries: next.entries.length }))
    } catch (error) { notify('error', error instanceof Error ? error.message : String(error)) } finally { setBusy(false) }
  }

  const adoptTrace = useCallback((text: string, fallbackTitle: string, sampleId = '') => {
    const { trace, issues } = loadTraceText(text)
    if (!trace) {
      const first = issues.find((issue) => issue.severity === 'error')
      notify('error', t('trace.invalid', { message: first ? `${first.message} (${first.line})` : '' }))
      return
    }
    setReal({ trace, title: trace.header.title ?? fallbackTitle, sampleId })
    setRunMode('real')
    setView('run')
    const warnings = issues.filter((issue) => issue.severity === 'warning')
    notify(warnings.length ? 'info' : 'success', warnings.length ? t('trace.warnings', { count: warnings.length, message: warnings[0].message }) : t('trace.loaded', { title: trace.header.title ?? fallbackTitle, events: trace.events.length }))
  }, [notify, t])

  const loadTraceFile = useCallback(async (file: File) => { adoptTrace(await file.text(), file.name) }, [adoptTrace])
  const loadSample = (id: string) => { const sample = SAMPLE_TRACES.find((item) => item.id === id); if (sample) adoptTrace(sample.text, sample.title, sample.id) }

  useEffect(() => {
    const hasFiles = (event: DragEvent) => Boolean(event.dataTransfer?.types?.includes('Files'))
    const enter = (event: DragEvent) => { if (hasFiles(event)) { event.preventDefault(); setDragging(true) } }
    const over = (event: DragEvent) => { if (hasFiles(event)) event.preventDefault() }
    const leave = (event: DragEvent) => { if (!event.relatedTarget) setDragging(false) }
    const drop = (event: DragEvent) => { if (!hasFiles(event)) return; event.preventDefault(); setDragging(false); const file = event.dataTransfer?.files[0]; if (file) void loadTraceFile(file) }
    window.addEventListener('dragenter', enter); window.addEventListener('dragover', over); window.addEventListener('dragleave', leave); window.addEventListener('drop', drop)
    return () => { window.removeEventListener('dragenter', enter); window.removeEventListener('dragover', over); window.removeEventListener('dragleave', leave); window.removeEventListener('drop', drop) }
  }, [loadTraceFile])

  /* ─────────────── simulation ─────────────── */
  const runSimulation = useCallback((params: SimParams, language: Locale) => {
    const chosen = params.choice === 'loop' ? null : entries.find((candidate) => candidate.id === params.choice)
    const result = chosen
      ? simulate(params.request, { kind: 'entry', project, entry: chosen, depth: params.depth }, { locale: language })
      : simulate(params.request, { kind: 'loop' }, { locale: language })
    setSim({ params, result })
    return result
  }, [project, entries])

  const startSimulation = (override?: Partial<SimParams>) => {
    const params: SimParams = { request: request.trim() ? request : t('run.example1'), choice: simChoice, depth: simDepth, ...override }
    setRequest(params.request)
    setSimChoice(params.choice)
    runSimulation(params, locale)
    setRunMode('simulated')
    setView('run')
    setSelected(null)
  }

  useEffect(() => { if (sim) runSimulation(sim.params, locale) }, [locale]) // eslint-disable-line react-hooks/exhaustive-deps -- re-simulate in the new language only

  /* ─────────────── interaction ─────────────── */
  const seekToNode = (id: string) => {
    const from = events.findIndex((event, at) => at >= player.index && nodeOf(event) === id)
    const any = from >= 0 ? from : events.findIndex((event) => nodeOf(event) === id)
    if (any >= 0) dispatch({ type: 'seek', index: any })
  }
  const onSelect = (id: string | null) => { if (view === 'run') { if (id) seekToNode(id) } else setSelected(id) }
  const visible = useMemo(() => new Set(graph?.nodes.map((node) => node.id) ?? []), [graph])
  const navigate = (id: string) => {
    if (view === 'flows' && !visible.has(id) && selected) setEntryOpen((current) => new Set(current).add(selected))
    setSelected(id)
  }
  const pickFunction = (symbolId: string) => {
    const symbol = project.symbols.get(symbolId)
    if (!symbol) return
    const next = functionEntry(symbol)
    setPicked((current) => (current.some((candidate) => candidate.id === next.id) ? current : [...current, next]))
    setEntryId(next.id)
    setEntryOpen(new Set())
    setSelected(next.symbol)
  }
  const onExpand = useCallback((id: string) => setEntryOpen((current) => new Set(current).add(id)), [])
  const onToggle = useCallback((id: string) => setExpanded((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next }), [])

  const exportText = graph ? toMermaid(graph) : ''
  const selectView = (next: View) => { setView(next); setSelected(next === 'flows' ? entry?.symbol ?? null : null) }
  const canvasEmpty = view === 'run' ? <p>{runMode === 'simulated' ? t('run.noSimulation') : t('run.noTrace')}</p> : view === 'flows' ? <p>{project.symbols.size ? t('canvas.empty') : t('side.noMapper')}</p> : <p>{t('canvas.empty')}</p>
  const announce = view === 'run' && events[player.index] ? t('player.step', { n: player.index + 1, total: events.length, name: events[player.index].name }) : ''

  return (
    <div className={`app${demo ? ' demo-mode' : ''}`}>
      <TopBar
        t={t} locale={locale} onLocale={setLocale} view={view} onView={selectView} policy={policy} demo={demo}
        link={link} onLink={setLink} onImport={importGitHub} busy={busy} onFolder={openFolder}
        onExample={() => adopt(bundledProject(), EXAMPLE_NAME)} onExport={() => setExporting(true)} canExport={Boolean(graph?.nodes.length)}
      />
      <div className="body">
        <aside className="side" aria-label={t('side.aria')}>
          {view === 'architecture' ? <ArchitectureSide t={t} project={project} onExpandAll={() => setExpanded(new Set(groupIds(project)))} onCollapseAll={() => setExpanded(new Set())} /> : null}
          {view === 'flows' ? <FlowsSide t={t} project={project} entries={entries} entryId={entryId} onEntry={(id) => { setEntryId(id); setEntryOpen(new Set()); setSelected(entries.find((candidate) => candidate.id === id)?.symbol ?? null) }} onPickFunction={pickFunction} depth={entryDepth} onDepth={setEntryDepth} /> : null}
          {view === 'run' ? (
            <RunSide
              t={t} mode={runMode} onMode={setRunMode} request={request} onRequest={setRequest} entries={entries} simChoice={simChoice} onSimChoice={setSimChoice}
              depth={simDepth} onDepth={setSimDepth} onSimulate={() => startSimulation()} shape={sim?.result.shape}
              events={events} index={player.index} onSeek={(index) => dispatch({ type: 'seek', index })}
              realTitle={real?.title} realSample={Boolean(real?.trace.header.synthetic)} sampleId={real?.sampleId ?? ''} onSample={loadSample} onTraceFile={(file) => void loadTraceFile(file)} canLoadTrace={policy.canLoadLocalTrace}
            />
          ) : null}
        </aside>

        <main className="stage" aria-label={t('canvas.aria')}>
          {notice ? <div className={`notice ${notice.kind}`} role={notice.kind === 'error' ? 'alert' : 'status'}><span>{notice.text}</span><button type="button" aria-label={t('common.close')} onClick={() => setNotice(null)}>×</button></div> : null}
          <ReactFlowProvider>
            <FlowCanvas
              graph={graph} layout={layout} runState={runState} selectedId={view === 'run' ? null : selected} onSelect={onSelect} onExpand={onExpand} onToggle={onToggle}
              draggable={policy.canMoveNodes} follow={follow} reducedMotion={reducedMotion} t={t} empty={canvasEmpty}
            />
          </ReactFlowProvider>
          {view === 'run' ? <PlayerBar t={t} events={events} state={player} dispatch={dispatch} follow={follow} onFollow={setFollow} /> : null}
        </main>

        <aside className="details" aria-label={t('details.aria')}>
          {view === 'run'
            ? <RunDetails t={t} locale={locale} events={events} index={player.index} header={run?.trace.header ?? {}} source={runMode === 'real' ? 'real' : 'simulated'} notes={run?.notes ?? []} />
            : <StaticDetails t={t} project={project} selectedId={selected} entry={view === 'flows' ? entry ?? undefined : undefined} visible={visible} onSelect={navigate} onSimulate={entry ? () => { setSimChoice(entry.id); startSimulation({ choice: entry.id }) } : undefined} />}
        </aside>
      </div>
      <div className="sr-only" role="status" aria-live="polite">{announce}</div>
      {exporting ? <MermaidDialog t={t} text={exportText} filename={`${(graph?.title || 'flow').replace(/[^\w.-]+/g, '-')}.mmd`} onClose={() => setExporting(false)} /> : null}
      {dragging ? <div className="drop-overlay" role="presentation"><p>{t('trace.drop')}</p></div> : null}
    </div>
  )
}
