/** Pure playback state machine for the run replay. The UI feeds it `tick` from requestAnimationFrame. */
export const SPEEDS = [0.5, 1, 2, 4] as const

export interface PlayerState {
  /** Active step, 0-based. */
  index: number
  length: number
  playing: boolean
  speed: number
  /** Milliseconds (already speed-scaled) spent on the active step. */
  elapsed: number
  /** Milliseconds each step stays active at speed 1. */
  dwell: number[]
  /** True once playback ran past the last step. */
  finished: boolean
}

export type PlayerAction =
  | { type: 'load'; dwell: number[] }
  | { type: 'play' }
  | { type: 'pause' }
  | { type: 'toggle' }
  | { type: 'next' }
  | { type: 'prev' }
  | { type: 'seek'; index: number }
  | { type: 'speed'; speed: number }
  | { type: 'tick'; dt: number }
  | { type: 'restart' }

export function createPlayer(dwell: number[], speed = 1): PlayerState {
  return { index: 0, length: dwell.length, playing: false, speed, elapsed: 0, dwell, finished: false }
}

/** How long a step stays active at speed 1: its real duration, clamped so nothing flashes by or drags on. */
export function dwellFor(event: { start: number; end: number | null }): number {
  if (event.end === null) return 900
  return Math.min(2500, Math.max(700, Math.round((event.end - event.start) * 1000)))
}

const clampIndex = (state: PlayerState, index: number) => Math.min(state.length - 1, Math.max(0, Math.trunc(index)))
const at = (state: PlayerState, index: number, extra: Partial<PlayerState> = {}): PlayerState => ({ ...state, index, elapsed: 0, finished: false, ...extra })

export function playerReducer(state: PlayerState, action: PlayerAction): PlayerState {
  if (action.type === 'load') return createPlayer(action.dwell, state.speed)
  if (action.type === 'speed') return (SPEEDS as readonly number[]).includes(action.speed) ? { ...state, speed: action.speed } : state
  if (state.length === 0) return state
  switch (action.type) {
    case 'play': return state.finished ? at(state, 0, { playing: true }) : { ...state, playing: true }
    case 'pause': return { ...state, playing: false }
    case 'toggle': return playerReducer(state, { type: state.playing ? 'pause' : 'play' })
    case 'next': return at(state, clampIndex(state, state.index + 1), { playing: false, finished: state.finished && state.index === state.length - 1 })
    case 'prev': return at(state, clampIndex(state, state.index - 1), { playing: false })
    case 'seek': return at(state, clampIndex(state, action.index))
    case 'restart': return at(state, 0, { playing: false })
    case 'tick': {
      if (!state.playing || !(action.dt > 0)) return state
      let { index, elapsed } = state
      elapsed += action.dt * state.speed
      while (elapsed >= state.dwell[index]) {
        if (index === state.length - 1) return { ...state, index, elapsed: state.dwell[index], playing: false, finished: true }
        elapsed -= state.dwell[index]
        index += 1
      }
      return { ...state, index, elapsed }
    }
  }
}
