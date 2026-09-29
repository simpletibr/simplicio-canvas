import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { MAX_TRACE_EVENTS, TRACE_KINDS, TRACE_SCHEMA, TRACE_STATUSES, parseTrace, traceIndex } from '../src/domain/trace'

const traceDoc = readFileSync('docs/trace-format.md', 'utf8')
const emitter = readFileSync('docs/examples/simplicio_trace.py', 'utf8').trimEnd()
const httpClient = readFileSync('docs/examples/llm_http_client.py', 'utf8').trimEnd()
const python = (() => { try { execFileSync('python3', ['--version'], { stdio: 'ignore' }); return true } catch { return false } })()
const httpx = python && (() => { try { execFileSync('python3', ['-c', 'import httpx'], { stdio: 'ignore' }); return true } catch { return false } })()

describe('docs/trace-format.md stays true to the code', () => {
  it('embeds the example files verbatim', () => {
    expect(traceDoc).toContain(`\`\`\`python\n${emitter}\n\`\`\``)
    expect(traceDoc).toContain(`\`\`\`python\n${httpClient}\n\`\`\``)
  })

  it('names every kind, every status, the schema and the event limit the parser knows', () => {
    for (const kind of TRACE_KINDS) expect(traceDoc).toContain(`\`${kind}\``)
    for (const status of TRACE_STATUSES) expect(traceDoc).toContain(`\`${status}\``)
    expect(traceDoc).toContain(`"${TRACE_SCHEMA}"`)
    expect(traceDoc).toContain(MAX_TRACE_EVENTS.toLocaleString('en-US'))
  })

  it('links to documents that exist', () => {
    for (const file of ['docs/trace-format.md', 'docs/simulation.md']) {
      const text = readFileSync(file, 'utf8')
      for (const match of text.matchAll(/\]\(([^)#]+\.md)(?:#[^)]*)?\)/g)) expect(existsSync(path.join('docs', match[1])), `${file} → ${match[1]}`).toBe(true)
    }
  })

  it('documents the fixtures that exist', () => {
    for (const fixture of ['turbo-provider.run.json', 'turbo-host.docs.jsonl', 'turbo-blocked.run.json', 'agent-demo.trace.jsonl']) {
      expect(traceDoc).toContain(fixture)
      expect(existsSync(path.join('fixtures/traces', fixture))).toBe(true)
    }
  })
})

describe.skipIf(!python)('the Python examples really work', () => {
  it('the emitter writes a valid trace, children before parents, that the importer accepts', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'canvas-docs-'))
    try {
      const file = path.join(dir, 'run.trace.jsonl')
      execFileSync('python3', ['-c', `
import sys; sys.path.insert(0, 'docs/examples')
from simplicio_trace import Trace
trace = Trace(${JSON.stringify(file)}, title="emitter test")
with trace.span("step", "outer"):
    with trace.span("tool", "inner", key="value"): pass
    try:
        with trace.span("command", "boom"): raise RuntimeError("bad")
    except RuntimeError: pass
    with trace.span("verify", "tests") as attrs: attrs.update(passed=False, returncode=1)
`], { stdio: 'pipe', env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' } })
      const { trace, issues } = parseTrace(readFileSync(file, 'utf8'))
      expect(issues).toEqual([])
      const byName = new Map(trace!.events.map((event) => [event.name, event]))
      expect(byName.get('inner')).toMatchObject({ kind: 'tool', status: 'ok', attrs: { key: 'value' } })
      expect(byName.get('boom')).toMatchObject({ status: 'error', attrs: { error: expect.stringContaining('RuntimeError') } })
      expect(byName.get('tests')?.status).toBe('error')
      expect(traceIndex(trace!).children.get(byName.get('outer')!.id)).toHaveLength(3)
      expect(trace!.events[0].name).toBe('outer')
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })

  it('agent_demo.py reproduces fixtures/traces/agent-demo.trace.jsonl byte for byte', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'canvas-docs-'))
    try {
      const file = path.join(dir, 'demo.jsonl')
      execFileSync('python3', ['docs/examples/agent_demo.py', file], { stdio: 'pipe', env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' } })
      expect(readFileSync(file, 'utf8')).toBe(readFileSync('fixtures/traces/agent-demo.trace.jsonl', 'utf8'))
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })

  it.skipIf(!httpx)('the httpx client logs an OpenAI-style call as an llm_call under the open span and ignores other requests', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'canvas-docs-'))
    try {
      const file = path.join(dir, 'http.jsonl')
      execFileSync('python3', ['-c', `
import sys; sys.path.insert(0, 'docs/examples')
import httpx
from simplicio_trace import Trace
from llm_http_client import logging_client
handler = lambda request: httpx.Response(200, json={"model": "m", "usage": {"prompt_tokens": 12, "completion_tokens": 5}, "choices": [{"message": {"content": "Hello there"}}]})
trace = Trace(${JSON.stringify(file)})
client = logging_client(trace, transport=httpx.MockTransport(handler), base_url="https://api.example.test/v1")
with trace.span("step", "ask"):
    client.post("/chat/completions", json={"model": "m", "messages": [{"role": "user", "content": "Say hello"}]})
    client.get("/models")
`], { stdio: 'pipe', env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' } })
      const { trace, issues } = parseTrace(readFileSync(file, 'utf8'))
      expect(issues).toEqual([])
      expect(trace!.events.map((event) => event.kind)).toEqual(['step', 'llm_call'])
      expect(trace!.events[1]).toMatchObject({ parent: trace!.events[0].id, attrs: { model: 'm', prompt_tokens: 12, completion_tokens: 5, prompt_preview: 'Say hello', response_preview: 'Hello there' } })
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })
})
