import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { cspPlugin, contentSecurityPolicy } from '../server/csp'
import { assertPrivateSnapshot, exportSnapshot } from '../src/domain/snapshot'
import { createCanonicalGraph } from '../src/domain/graph-schema'

describe('privacy command gate', () => {
  it('keeps source bodies out of exported graph envelopes', () => {
    const graph = createCanonicalGraph({ project: { id: 'p', name: 'demo' }, nodes: [{ id: 'f', kind: 'file', name: 'main.ts', path: 'src/main.ts' }], edges: [], provenance: { source: 'local', generatedAt: '2026-01-01' }, evidence: [] })
    const raw = exportSnapshot(graph)
    expect(raw).not.toContain('password'); expect(raw).not.toContain('apiKey'); expect(() => assertPrivateSnapshot(JSON.parse(raw))).not.toThrow()
  })
  it('rejects credentials and private machine paths before export leaves the browser', () => {
    const base = createCanonicalGraph({ project: { id: 'p', name: 'demo' }, nodes: [], edges: [], provenance: { source: 'local', generatedAt: '2026-01-01' }, evidence: [] })
    expect(() => assertPrivateSnapshot({ format: 'simplicio-canvas-snapshot', version: 1, exportedAt: '2026-01-01', provenance: base.provenance, graph: { ...base, project: { id: 'p', name: 'apiKey' } } })).toThrow(/secret/i)
  })

  it('only talks to the local import bridge: no other network primitive appears in the app sources', () => {
    const sources: string[] = []
    const walk = (dir: string) => { for (const name of readdirSync(dir)) { const full = path.join(dir, name); if (statSync(full).isDirectory()) walk(full); else if (/\.(ts|tsx)$/.test(name)) sources.push(full) } }
    walk('src')
    const network = /\bfetch\s*\(|\b(?:XMLHttpRequest|sendBeacon|WebSocket|EventSource|importScripts)\b/
    const hits = sources.filter((file) => network.test(readFileSync(file, 'utf8').replace(/\/\/.*$/gm, '')))
    expect(hits).toEqual(['src/ui/App.tsx'])
    const app = readFileSync('src/ui/App.tsx', 'utf8')
    expect(app.match(/fetch\(/g)).toHaveLength(1)
    expect(app).toContain("fetch('/api/github/import'")
  })

  it('production builds carry a Content-Security-Policy that blocks other origins and plugins', () => {
    const policy = contentSecurityPolicy()
    for (const directive of ["default-src 'self'", "script-src 'self'", "connect-src 'self'", "object-src 'none'", "base-uri 'self'", "form-action 'self'"]) expect(policy).toContain(directive)
    expect(policy).not.toMatch(/https?:|\*|unsafe-eval|script-src[^;]*unsafe-inline/)
    const plugin = cspPlugin()
    expect(plugin.apply).toBe('build')
    const html = (plugin.transformIndexHtml as (html: string) => string)('<head>\n  <meta charset="utf-8">\n</head>')
    expect(html).toContain('http-equiv="Content-Security-Policy"')
    expect(html).toContain(policy)
  })
})
