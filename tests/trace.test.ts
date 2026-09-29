import { describe, expect, it } from 'vitest'
import { TRACE_SCHEMA, buildTrace, hasErrors, parseTrace, serializeTrace, traceIndex } from '../src/domain/trace'

const line = (value: unknown) => JSON.stringify(value)
const jsonl = (...values: unknown[]) => values.map(line).join('\n')

describe('simplicio.trace/v1 parser', () => {
  it('parses a valid JSONL trace with a header, relative times and attrs', () => {
    const { trace, issues } = parseTrace(jsonl(
      { schema: TRACE_SCHEMA, title: 'demo run', source: 'unit test', synthetic: true },
      { id: 'a', parent: null, kind: 'step', name: 'run', start: 0, end: 3, status: 'ok' },
      { id: 'b', parent: 'a', kind: 'llm_call', name: 'plan', start: 0.5, end: 2.5, status: 'ok', attrs: { model: 'm', prompt_tokens: 10 } },
    ))
    expect(issues).toEqual([])
    expect(trace?.schema).toBe(TRACE_SCHEMA)
    expect(trace?.header).toMatchObject({ title: 'demo run', source: 'unit test', synthetic: true })
    expect(trace?.events.map((event) => event.id)).toEqual(['a', 'b'])
    expect(trace?.events[1]).toMatchObject({ parent: 'a', kind: 'llm_call', start: 0.5, end: 2.5, attrs: { model: 'm', prompt_tokens: 10 } })
  })

  it('normalizes epoch seconds and ISO-8601 timestamps to offsets from the first event', () => {
    const { trace, issues } = parseTrace(jsonl(
      { id: 'a', kind: 'step', name: 'first', start: 1_700_000_000, end: 1_700_000_002.5 },
      { id: 'b', kind: 'command', name: 'second', start: '2023-11-14T22:13:23Z', end: '2023-11-14T22:13:24Z' },
    ))
    expect(issues).toEqual([])
    expect(trace?.events[0]).toMatchObject({ start: 0, end: 2.5 })
    expect(trace?.events[1].start).toBeCloseTo(3, 5)
    expect(trace?.events[1].end).toBeCloseTo(4, 5)
  })

  it('defaults optional fields: parent null, status ok, end null, attrs empty', () => {
    const { trace } = parseTrace(line({ id: 'x', kind: 'tool', name: 'ping', start: 5 }))
    expect(trace?.events[0]).toMatchObject({ id: 'x', parent: null, status: 'ok', end: null, attrs: {} })
    expect(trace?.events[0].start).toBe(0)
  })

  it('accepts integer ids and ignores blank lines and unknown top-level keys', () => {
    const { trace, issues } = parseTrace(`\n${line({ id: 1, kind: 'step', name: 'one', start: 0, extra: true })}\n\n${line({ id: 2, parent: 1, kind: 'step', name: 'two', start: 1 })}\n`)
    expect(issues).toEqual([])
    expect(trace?.events.map((event) => [event.id, event.parent])).toEqual([['1', null], ['2', '1']])
  })

  it('sorts out-of-order events by start time and resolves children written before their parent', () => {
    const { trace, issues } = parseTrace(jsonl(
      { id: 'child2', parent: 'root', kind: 'tool', name: 'late child', start: 4, end: 5 },
      { id: 'child1', parent: 'root', kind: 'llm_call', name: 'early child', start: 1, end: 3 },
      { id: 'root', kind: 'step', name: 'root written last', start: 0, end: 6 },
    ))
    expect(issues).toEqual([])
    expect(trace?.events.map((event) => event.id)).toEqual(['root', 'child1', 'child2'])
    const index = traceIndex(trace!)
    expect(index.children.get('root')?.map((event) => event.id)).toEqual(['child1', 'child2'])
    expect(index.roots.map((event) => event.id)).toEqual(['root'])
  })

  it('keeps file order as the tie-breaker for events with equal start times', () => {
    const { trace } = parseTrace(jsonl(
      { id: 'b', kind: 'step', name: 'B', start: 1 },
      { id: 'a', kind: 'step', name: 'A', start: 1 },
      { id: 'c', kind: 'step', name: 'C', start: 0 },
    ))
    expect(trace?.events.map((event) => event.id)).toEqual(['c', 'b', 'a'])
  })

  it('puts a parent before its children when they start at the same instant, even if the children were written first', () => {
    const { trace } = parseTrace(jsonl(
      { id: 'child', parent: 'root', kind: 'tool', name: 'child', start: 5, end: 6 },
      { id: 'sibling', parent: 'root', kind: 'tool', name: 'sibling', start: 5, end: 7 },
      { id: 'root', kind: 'step', name: 'root', start: 5, end: 8 },
      { id: 'other', kind: 'step', name: 'other root', start: 5, end: 9 },
    ))
    expect(trace?.events.map((event) => event.id)).toEqual(['root', 'child', 'sibling', 'other'])
  })

  it('reports malformed JSON with its line number and returns no trace', () => {
    const { trace, issues } = parseTrace(`${line({ id: 'a', kind: 'step', name: 'ok', start: 0 })}\n{not json}\n`)
    expect(trace).toBeNull()
    expect(issues).toContainEqual(expect.objectContaining({ line: 2, severity: 'error', message: expect.stringMatching(/JSON/i) }))
  })

  it.each([
    ['id', { kind: 'step', name: 'n', start: 0 }, /id/],
    ['kind', { id: 'a', name: 'n', start: 0 }, /kind/],
    ['unknown kind', { id: 'a', kind: 'explode', name: 'n', start: 0 }, /kind/],
    ['name', { id: 'a', kind: 'step', start: 0 }, /name/],
    ['start', { id: 'a', kind: 'step', name: 'n' }, /start/],
    ['unparseable start', { id: 'a', kind: 'step', name: 'n', start: 'yesterday' }, /start/],
    ['non-object event', 'just text', /object/],
  ])('rejects an event with %s', (_label, event, pattern) => {
    const { trace, issues } = parseTrace(line(event))
    expect(trace).toBeNull()
    expect(issues.some((issue) => issue.severity === 'error' && pattern.test(issue.message))).toBe(true)
  })

  it('rejects duplicate ids and an unsupported header schema', () => {
    const duplicate = parseTrace(jsonl({ id: 'a', kind: 'step', name: 'one', start: 0 }, { id: 'a', kind: 'step', name: 'two', start: 1 }))
    expect(duplicate.trace).toBeNull()
    expect(duplicate.issues).toContainEqual(expect.objectContaining({ line: 2, severity: 'error', message: expect.stringMatching(/duplicate/i) }))
    const schema = parseTrace(jsonl({ schema: 'other/v9' }, { id: 'a', kind: 'step', name: 'one', start: 0 }))
    expect(schema.trace).toBeNull()
    expect(schema.issues[0]).toMatchObject({ line: 1, severity: 'error', message: expect.stringMatching(/schema/i) })
  })

  it('rejects empty input', () => {
    expect(parseTrace('  \n').trace).toBeNull()
    expect(parseTrace('').issues[0]).toMatchObject({ severity: 'error', message: expect.stringMatching(/no events/i) })
  })

  it('downgrades recoverable problems to warnings and still returns a usable trace', () => {
    const { trace, issues } = parseTrace(jsonl(
      { id: 'a', parent: 'missing', kind: 'step', name: 'orphan', start: 0, end: 1 },
      { id: 'b', kind: 'step', name: 'backwards', start: 5, end: 2 },
      { id: 'c', kind: 'step', name: 'odd status', start: 6, status: 'weird' },
      { id: 'd', kind: 'step', name: 'odd attrs', start: 7, attrs: 'nope' },
    ))
    expect(hasErrors(issues)).toBe(false)
    expect(issues.map((issue) => issue.severity)).toEqual(['warning', 'warning', 'warning', 'warning'])
    const events = new Map(trace!.events.map((event) => [event.id, event]))
    expect(events.get('a')?.parent).toBeNull()
    expect(events.get('b')?.end).toBe(events.get('b')?.start)
    expect(events.get('c')?.status).toBe('ok')
    expect(events.get('d')?.attrs).toEqual({})
  })

  it('breaks parent cycles instead of looping forever', () => {
    const { trace, issues } = parseTrace(jsonl(
      { id: 'a', parent: 'b', kind: 'step', name: 'a', start: 0 },
      { id: 'b', parent: 'a', kind: 'step', name: 'b', start: 1 },
      { id: 'c', parent: 'c', kind: 'step', name: 'self', start: 2 },
    ))
    expect(trace).not.toBeNull()
    expect(issues.filter((issue) => issue.severity === 'warning').length).toBeGreaterThanOrEqual(2)
    const index = traceIndex(trace!)
    expect(index.roots.length).toBeGreaterThanOrEqual(2)
  })

  it('caps the number of events so a runaway file cannot freeze the page', () => {
    const many = Array.from({ length: 20_001 }, (_, i) => line({ id: `e${i}`, kind: 'step', name: 'x', start: i })).join('\n')
    const { trace, issues } = parseTrace(many)
    expect(trace).toBeNull()
    expect(issues[0]).toMatchObject({ severity: 'error', message: expect.stringMatching(/too large|limit/i) })
  })

  it('round-trips through serializeTrace', () => {
    const first = parseTrace(jsonl(
      { schema: TRACE_SCHEMA, title: 'rt' },
      { id: 'a', kind: 'step', name: 'run', start: 0, end: 2, status: 'ok' },
      { id: 'b', parent: 'a', kind: 'llm_call', name: 'call', start: 0.25, end: 1.75, status: 'error', attrs: { model: 'm' } },
    )).trace!
    const second = parseTrace(serializeTrace(first))
    expect(second.issues).toEqual([])
    expect(second.trace?.header).toEqual(first.header)
    expect(second.trace?.events).toEqual(first.events)
  })
})

describe('buildTrace (in-memory events)', () => {
  it('validates the same rules and reports the event position instead of a line', () => {
    const { trace, issues } = buildTrace([{ id: 'a', kind: 'step', name: 'ok', start: 0 }, { id: 'a', kind: 'step', name: 'dup', start: 1 }])
    expect(trace).toBeNull()
    expect(issues[0]).toMatchObject({ severity: 'error', line: 2 })
  })
})
