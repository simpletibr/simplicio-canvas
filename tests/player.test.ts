import { describe, expect, it } from 'vitest'
import { SPEEDS, createPlayer, dwellFor, playerReducer, type PlayerAction, type PlayerState } from '../src/domain/player'

const run = (state: PlayerState, ...actions: PlayerAction[]) => actions.reduce(playerReducer, state)
const three = () => createPlayer([1000, 1000, 1000])

describe('player state machine', () => {
  it('starts paused on the first step', () => {
    expect(three()).toMatchObject({ index: 0, length: 3, playing: false, speed: 1, elapsed: 0, finished: false })
  })

  it('plays, pauses and toggles', () => {
    expect(run(three(), { type: 'play' }).playing).toBe(true)
    expect(run(three(), { type: 'play' }, { type: 'pause' }).playing).toBe(false)
    expect(run(three(), { type: 'toggle' }).playing).toBe(true)
    expect(run(three(), { type: 'toggle' }, { type: 'toggle' }).playing).toBe(false)
  })

  it('advances one step when the active step has been shown for its dwell time', () => {
    const state = run(three(), { type: 'play' }, { type: 'tick', dt: 600 })
    expect(state).toMatchObject({ index: 0, elapsed: 600 })
    expect(run(state, { type: 'tick', dt: 500 })).toMatchObject({ index: 1, elapsed: 100 })
  })

  it('crosses several steps for one large tick', () => {
    expect(run(three(), { type: 'play' }, { type: 'tick', dt: 2500 })).toMatchObject({ index: 2, elapsed: 500, playing: true })
  })

  it('ignores ticks while paused', () => {
    expect(run(three(), { type: 'tick', dt: 5000 })).toMatchObject({ index: 0, elapsed: 0 })
  })

  it('stops on the last step when playback runs out and restarts from the top on play', () => {
    const ended = run(three(), { type: 'play' }, { type: 'tick', dt: 10_000 })
    expect(ended).toMatchObject({ index: 2, playing: false, finished: true })
    const again = run(ended, { type: 'play' })
    expect(again).toMatchObject({ index: 0, playing: true, finished: false, elapsed: 0 })
  })

  it('drives a whole trace to the end with frame-sized ticks', () => {
    let state = run(createPlayer([800, 1200, 900, 700]), { type: 'play' })
    const visited = new Set<number>([0])
    for (let frame = 0; frame < 1000 && state.playing; frame += 1) { state = playerReducer(state, { type: 'tick', dt: 16 }); visited.add(state.index) }
    expect(state).toMatchObject({ index: 3, playing: false, finished: true })
    expect([...visited]).toEqual([0, 1, 2, 3])
  })

  it('steps manually: next and prev pause, reset the dwell clock and clamp at the ends', () => {
    const playing = run(three(), { type: 'play' }, { type: 'tick', dt: 300 })
    expect(run(playing, { type: 'next' })).toMatchObject({ index: 1, playing: false, elapsed: 0 })
    expect(run(three(), { type: 'prev' })).toMatchObject({ index: 0, playing: false })
    expect(run(three(), { type: 'next' }, { type: 'next' }, { type: 'next' }, { type: 'next' })).toMatchObject({ index: 2 })
    expect(run(three(), { type: 'next' }, { type: 'next' }, { type: 'prev' })).toMatchObject({ index: 1 })
  })

  it('seeks to any step, clamps out-of-range targets and keeps the play state', () => {
    expect(run(three(), { type: 'seek', index: 2 })).toMatchObject({ index: 2, playing: false, elapsed: 0 })
    expect(run(three(), { type: 'play' }, { type: 'seek', index: 1 })).toMatchObject({ index: 1, playing: true })
    expect(run(three(), { type: 'seek', index: 99 }).index).toBe(2)
    expect(run(three(), { type: 'seek', index: -4 }).index).toBe(0)
    expect(run(three(), { type: 'seek', index: 1.7 }).index).toBe(1)
  })

  it('seeking away from the end clears the finished flag', () => {
    const ended = run(three(), { type: 'play' }, { type: 'tick', dt: 9000 })
    expect(run(ended, { type: 'seek', index: 0 })).toMatchObject({ index: 0, finished: false })
  })

  it('scales the dwell time with the speed and only accepts known speeds', () => {
    const fast = run(three(), { type: 'speed', speed: 2 }, { type: 'play' }, { type: 'tick', dt: 500 })
    expect(fast).toMatchObject({ index: 1, speed: 2, elapsed: 0 })
    expect(SPEEDS).toEqual([0.5, 1, 2, 4])
    expect(run(three(), { type: 'speed', speed: 3 }).speed).toBe(1)
  })

  it('restarts to the first step and pauses', () => {
    expect(run(three(), { type: 'play' }, { type: 'tick', dt: 1500 }, { type: 'restart' })).toMatchObject({ index: 0, elapsed: 0, playing: false, finished: false })
  })

  it('loads a new trace while keeping the chosen speed', () => {
    const loaded = run(three(), { type: 'speed', speed: 4 }, { type: 'seek', index: 2 }, { type: 'load', dwell: [500, 500] })
    expect(loaded).toMatchObject({ index: 0, length: 2, speed: 4, playing: false })
  })

  it('does nothing for an empty trace', () => {
    const empty = createPlayer([])
    expect(run(empty, { type: 'play' }, { type: 'tick', dt: 100 }, { type: 'next' }, { type: 'seek', index: 3 })).toMatchObject({ index: 0, length: 0, playing: false })
  })
})

describe('dwellFor', () => {
  it('uses a default for unmeasured steps and clamps measured durations', () => {
    expect(dwellFor({ start: 0, end: null })).toBe(900)
    expect(dwellFor({ start: 0, end: 0.05 })).toBe(700)
    expect(dwellFor({ start: 0, end: 1.6 })).toBe(1600)
    expect(dwellFor({ start: 0, end: 30 })).toBe(2500)
  })
})
