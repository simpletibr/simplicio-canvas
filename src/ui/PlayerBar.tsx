import type { Dispatch } from 'react'
import { formatDuration } from '../domain/flow-graph'
import { SPEEDS, type PlayerAction, type PlayerState } from '../domain/player'
import type { TraceEvent } from '../domain/trace'
import { Icon } from './icons'
import type { Translate } from './messages'
import { KindGlyph } from './nodes'

interface Props { t: Translate; events: TraceEvent[]; state: PlayerState; dispatch: Dispatch<PlayerAction>; follow: boolean; onFollow(value: boolean): void }

export function PlayerBar({ t, events, state, dispatch, follow, onFollow }: Props) {
  const active = events[state.index]
  const disabled = events.length === 0
  return (
    <section className="player" aria-label={t('run.aria')}>
      <div className="transport">
        <button type="button" className="icon-btn" onClick={() => dispatch({ type: 'restart' })} disabled={disabled} aria-label={t('player.restart')} title={t('player.restart')}><Icon name="restart" /></button>
        <button type="button" className="icon-btn" onClick={() => dispatch({ type: 'prev' })} disabled={disabled || state.index === 0} aria-label={t('player.prev')} title={`${t('player.prev')} (←)`}><Icon name="prev" /></button>
        <button type="button" className="icon-btn primary" onClick={() => dispatch({ type: 'toggle' })} disabled={disabled} aria-label={state.playing ? t('player.pause') : t('player.play')} aria-pressed={state.playing} title={`${state.playing ? t('player.pause') : t('player.play')} (Space)`}><Icon name={state.playing ? 'pause' : 'play'} /></button>
        <button type="button" className="icon-btn" onClick={() => dispatch({ type: 'next' })} disabled={disabled || state.index >= events.length - 1} aria-label={t('player.next')} title={`${t('player.next')} (→)`}><Icon name="next" /></button>
      </div>
      <label className="speed">{t('player.speed')}
        <select value={state.speed} onChange={(event) => dispatch({ type: 'speed', speed: Number(event.target.value) })} disabled={disabled}>
          {SPEEDS.map((speed) => <option key={speed} value={speed}>{speed}×</option>)}
        </select>
      </label>
      <label className="follow"><input type="checkbox" checked={follow} onChange={(event) => onFollow(event.target.checked)} /> {t('canvas.follow')}</label>
      <div className="timeline" role="group" aria-label={t('player.timeline')}>
        {events.map((event, index) => {
          const seconds = event.end === null ? 0 : event.end - event.start
          return (
            <button
              type="button" key={event.id} onClick={() => dispatch({ type: 'seek', index })}
              className={`seg kind-${event.kind} status-${event.status}${index === state.index ? ' active' : ''}${index < state.index ? ' past' : ''}`}
              style={{ flexGrow: Math.max(1, Math.min(6, seconds)) }} aria-current={index === state.index ? 'step' : undefined}
              aria-label={t('player.step', { n: index + 1, total: events.length, name: event.name })} title={`${index + 1}. ${event.name}`}
            />
          )
        })}
      </div>
      <div className="now" role="status" aria-live="polite">
        {active ? <><KindGlyph kind={active.kind} /> <strong>{state.index + 1}/{events.length}</strong> <span className="now-name">{active.name}</span>{active.end !== null ? <span className="muted"> · {formatDuration(active.end - active.start)}</span> : null}{state.finished ? <span className="chip"> {t('player.finished')}</span> : null}</> : <span className="muted">{t('run.simulateFirst')}</span>}
      </div>
    </section>
  )
}
