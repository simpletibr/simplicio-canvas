import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { Readable } from 'node:stream'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { collectFiles, createImportHandler, importRepository, readArtifacts, type BridgeRunner } from '../server/github-bridge'

let dir = ''
beforeEach(async () => { dir = await mkdtemp(path.join(tmpdir(), 'canvas-bridge-')) })
afterEach(async () => { await rm(dir, { recursive: true, force: true }) })
const write = async (relative: string, content: string) => { const target = path.join(dir, relative); await mkdir(path.dirname(target), { recursive: true }); await writeFile(target, content) }

describe('collectFiles', () => {
  it('reads text files and skips dependencies, build output, Mapper artifacts, secrets, binaries and lockfiles', async () => {
    await write('src/app.py', 'print(1)\n')
    await write('README.md', '# hi\n')
    await write('node_modules/x/index.js', 'x')
    await write('dist/out.js', 'x')
    await write('.git/config', 'x')
    await write('.simplicio-loop/call-graph.json', '{}')
    await write('.env', 'SECRET=1')
    await write('.env.local', 'SECRET=2')
    await write('keys/id_rsa', 'PRIVATE')
    await write('cert.pem', 'PRIVATE')
    await write('logo.png', 'binary')
    await write('package-lock.json', '{}')
    await write('bundle.min.js', 'x')
    const files = await collectFiles(dir)
    expect(files.map((file) => file.path).sort()).toEqual(['README.md', 'src/app.py'])
    expect(files.find((file) => file.path === 'src/app.py')).toMatchObject({ content: 'print(1)\n', size: 9 })
  })

  it('skips symbolic links so a repository cannot make the bridge read outside its folder', async () => {
    await write('real.txt', 'ok')
    await symlink('/etc/hosts', path.join(dir, 'hosts-link'))
    await symlink(tmpdir(), path.join(dir, 'dir-link'))
    expect((await collectFiles(dir)).map((file) => file.path)).toEqual(['real.txt'])
  })

  it('applies size and count limits', async () => {
    await write('big.txt', 'x'.repeat(2000))
    await write('a.txt', 'a')
    await write('b.txt', 'b')
    await write('c.txt', 'c')
    expect((await collectFiles(dir, { maxFileBytes: 1000 })).map((file) => file.path).sort()).toEqual(['a.txt', 'b.txt', 'c.txt'])
    expect(await collectFiles(dir, { maxFiles: 2 })).toHaveLength(2)
    expect((await collectFiles(dir, { maxTotalBytes: 2 })).length).toBeLessThanOrEqual(2)
  })
})

describe('readArtifacts', () => {
  it('reads the three Mapper artifacts, slims them and never returns machine paths', async () => {
    await write('.simplicio-loop/symbol-index.json', JSON.stringify({ schema: 'simplicio.symbol-index/v1', root: '/Users/me/secret', symbols: [{ name: 'a', qualified_name: 'x.py::a', kind: 'function', defined_in: 'x.py', line: 1, evidence: { file: 'x.py' } }] }))
    await write('.simplicio-loop/call-graph.json', JSON.stringify({ schema: 'simplicio.call-graph/v1', edges: [{ type: 'calls', source_symbol: 'x.py::a', target_symbol: 'x.py::a', provenance: { root: '/Users/me/secret' }, relation_id: 'r' }] }))
    const artifacts = await readArtifacts(dir)
    expect(Object.keys(artifacts).sort()).toEqual(['callGraph', 'symbolIndex'])
    expect(JSON.stringify(artifacts)).not.toContain('/Users/me')
    expect(JSON.stringify(artifacts)).not.toContain('relation_id')
  })

  it('returns nothing for a repository Mapper has not scanned and survives broken or oversized JSON', async () => {
    expect(await readArtifacts(dir)).toEqual({})
    await write('.simplicio-loop/call-graph.json', '{not json')
    await write('.simplicio-loop/project-map.json', JSON.stringify({ schema: 'simplicio.project-map/v1', pad: 'x'.repeat(500) }))
    expect(Object.keys(await readArtifacts(dir, 100))).toEqual([])
  })
})

function fakeRunner(overrides: Partial<BridgeRunner> = {}): BridgeRunner & { calls: string[][] } {
  const calls: string[][] = []
  return {
    calls,
    async git(args) { calls.push(['git', ...args]); const target = args[args.indexOf('clone') >= 0 ? args.length - 1 : 1]; if (args.includes('clone')) { await mkdir(path.join(target, '.git'), { recursive: true }); await writeFile(path.join(target, 'app.py'), 'def main():\n    pass\n') } },
    async mapper(target) { calls.push(['mapper', 'scan']); await mkdir(path.join(target, '.simplicio-loop'), { recursive: true }); await writeFile(path.join(target, '.simplicio-loop', 'symbol-index.json'), JSON.stringify({ schema: 'simplicio.symbol-index/v1', symbols: [] })) },
    ...overrides,
  }
}

describe('importRepository', () => {
  it('clones shallowly into .simplicio/workspaces/<owner>/<repo>, runs Mapper and returns files plus artifacts', async () => {
    const runner = fakeRunner()
    const payload = await importRepository('octo/cat', { workspaceRoot: dir, runner })
    expect(runner.calls[0]).toEqual(expect.arrayContaining(['git', 'clone', '--depth', '1', 'https://github.com/octo/cat.git']))
    expect(runner.calls.some((call) => call[0] === 'mapper')).toBe(true)
    expect(payload).toMatchObject({ name: 'octo/cat', mapper: { available: true, status: 'completed' } })
    expect(payload.files.map((file) => file.path)).toEqual(['app.py'])
    expect(payload.mapper.artifacts).toHaveProperty('symbolIndex')
    expect(JSON.stringify(payload)).not.toContain(dir)
  })

  it('updates an existing clone instead of cloning again', async () => {
    const runner = fakeRunner()
    await importRepository('octo/cat', { workspaceRoot: dir, runner })
    runner.calls.length = 0
    await importRepository('octo/cat', { workspaceRoot: dir, runner })
    expect(runner.calls[0]).toEqual(expect.arrayContaining(['git', 'pull', '--ff-only']))
    expect(runner.calls.flat()).not.toContain('clone')
  })

  it('falls back to basic analysis when Mapper is missing or fails, without leaking its output', async () => {
    const missing = await importRepository('octo/cat', { workspaceRoot: dir, runner: fakeRunner({ async mapper() { throw Object.assign(new Error('spawn'), { code: 'ENOENT' }) } }) })
    expect(missing.mapper).toMatchObject({ available: false, status: 'basic-analysis' })
    expect(missing.mapper.note).toMatch(/not installed/i)
    const failed = await importRepository('octo/dog', { workspaceRoot: dir, runner: fakeRunner({ async mapper() { throw Object.assign(new Error('boom /Users/me/secret'), { stderr: 'boom /Users/me/secret' }) } }) })
    expect(failed.mapper.available).toBe(false)
    expect(JSON.stringify(failed)).not.toContain('/Users/me')
  })

  it('rejects anything that is not a plain owner/repository', async () => {
    for (const bad of ['../etc', 'a/../../b', 'https://gitlab.com/a/b', 'a/b/c', 'a', '', 'a/b;rm -rf', 'a/..']) {
      await expect(importRepository(bad, { workspaceRoot: dir, runner: fakeRunner() }), bad).rejects.toThrow(/GitHub repository/i)
    }
  })

  it('reports a clone failure as an error the UI can show', async () => {
    await expect(importRepository('octo/cat', { workspaceRoot: dir, runner: fakeRunner({ async git() { throw Object.assign(new Error('x'), { stderr: 'fatal: repository not found' }) } }) })).rejects.toThrow(/not found|clone/i)
  })
})

describe('import request handler', () => {
  const request = (method: string, body: string) => Object.assign(Readable.from([Buffer.from(body)]), { method, headers: {} })
  const response = () => { const state = { status: 200, body: '', headers: {} as Record<string, string> }; return { state, res: { statusCode: 200, setHeader(name: string, value: string) { state.headers[name.toLowerCase()] = value }, end(text: string) { state.body = text; state.status = this.statusCode } } } }

  it('answers GET with 405, bad JSON and bad repositories with 400, and success with the payload', async () => {
    const handler = createImportHandler({ workspaceRoot: dir, runner: fakeRunner() })
    let out = response(); await handler(request('GET', '') as never, out.res as never); expect(out.state.status).toBe(405)
    out = response(); await handler(request('POST', '{nope') as never, out.res as never); expect(out.state.status).toBe(400)
    out = response(); await handler(request('POST', JSON.stringify({ repository: '../x' })) as never, out.res as never); expect(out.state.status).toBe(400); expect(JSON.parse(out.state.body).error).toMatch(/GitHub repository/i)
    out = response(); await handler(request('POST', JSON.stringify({ repository: 'https://github.com/octo/cat' })) as never, out.res as never)
    expect(out.state.status).toBe(200); expect(out.state.headers['content-type']).toContain('application/json')
    expect(JSON.parse(out.state.body)).toMatchObject({ name: 'octo/cat' })
  })

  it('rejects oversized bodies', async () => {
    const handler = createImportHandler({ workspaceRoot: dir, runner: fakeRunner() })
    const out = response(); await handler(request('POST', JSON.stringify({ repository: 'x'.repeat(10_000) })) as never, out.res as never)
    expect(out.state.status).toBe(400)
  })
})
