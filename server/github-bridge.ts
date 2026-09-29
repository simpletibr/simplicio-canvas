/**
 * Local-only bridge used by `npm run dev`: shallow-clones a public GitHub repository under .simplicio/workspaces,
 * runs `simplicio-mapper scan`, and answers the browser with the source files plus Mapper's slim artifacts.
 * It is never part of a build: the hosted demo has no bridge and cannot import.
 */
import { execFile } from 'node:child_process'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { mkdir, readdir, readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import type { Plugin } from 'vite'
import { detectLanguage, type SourceFileInput } from '../src/domain/analyzer'
import { normalizeGitHubRepository } from '../src/domain/github-import'
import { slimMapperArtifacts, type MapperArtifacts } from '../src/domain/mapper'

const run = promisify(execFile)

export interface BridgeRunner {
  git(args: string[], options: { timeout: number }): Promise<unknown>
  mapper(target: string): Promise<unknown>
}

export const defaultRunner: BridgeRunner = {
  git: (args, options) => run('git', args, { ...options, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }, maxBuffer: 10_000_000 }),
  mapper: (target) => run('simplicio-mapper', ['scan', target, '--sync', '--await', '--json'], { timeout: 180_000, maxBuffer: 20_000_000 }),
}

export interface ImportPayload {
  name: string
  files: SourceFileInput[]
  mapper: { available: boolean; status: 'completed' | 'basic-analysis'; note?: string; artifacts?: MapperArtifacts }
}

const IGNORED_DIRS = new Set(['.git', 'node_modules', '.venv', 'venv', 'dist', 'build', 'coverage', '__pycache__', '.simplicio-loop', '.simplicio', '.next', 'target', 'vendor'])
const SKIPPED_FILES = /^(?:\.env(?:\..*)?|id_(?:rsa|dsa|ecdsa|ed25519)(?:\.pub)?|.*\.(?:pem|key|p12|pfx|min\.js|min\.css|map)|package-lock\.json|yarn\.lock|pnpm-lock\.yaml|poetry\.lock|uv\.lock|Cargo\.lock|Gemfile\.lock|composer\.lock)$/i

export interface CollectLimits { maxFiles?: number; maxFileBytes?: number; maxTotalBytes?: number }

export async function collectFiles(root: string, limits: CollectLimits = {}): Promise<SourceFileInput[]> {
  const { maxFiles = 4000, maxFileBytes = 400_000, maxTotalBytes = 24_000_000 } = limits
  const files: SourceFileInput[] = []
  let total = 0
  const walk = async (directory: string, prefix: string): Promise<void> => {
    const entries = (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))
    for (const entry of entries) {
      if (files.length >= maxFiles) return
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name
      if (entry.isDirectory()) { if (!IGNORED_DIRS.has(entry.name)) await walk(path.join(directory, entry.name), relative); continue }
      if (!entry.isFile() || SKIPPED_FILES.test(entry.name) || detectLanguage(relative) === 'Binary/Asset') continue
      const absolute = path.join(directory, entry.name)
      const info = await stat(absolute)
      if (info.size > maxFileBytes || total + info.size > maxTotalBytes) continue
      let content: string
      try { content = await readFile(absolute, 'utf8') } catch { continue }
      if (content.includes('\u0000')) continue
      total += info.size
      files.push({ path: relative, content, size: info.size })
    }
  }
  await walk(root, '')
  return files
}

const ARTIFACT_FILES = { projectMap: 'project-map.json', callGraph: 'call-graph.json', symbolIndex: 'symbol-index.json' } as const

export async function readArtifacts(root: string, maxBytes = 60_000_000): Promise<MapperArtifacts> {
  const raw: MapperArtifacts = {}
  for (const [key, name] of Object.entries(ARTIFACT_FILES) as Array<[keyof MapperArtifacts, string]>) {
    const file = path.join(root, '.simplicio-loop', name)
    try {
      if ((await stat(file)).size > maxBytes) continue
      raw[key] = JSON.parse(await readFile(file, 'utf8')) as unknown
    } catch { /* missing or unreadable: that artifact is simply absent */ }
  }
  return slimMapperArtifacts(raw)
}

const failure = (error: unknown) => { const source = error as { stderr?: unknown; message?: unknown }; return String(source?.stderr || source?.message || error).split('\n').filter(Boolean).pop()?.slice(0, 300) ?? 'unknown error' }

export async function importRepository(input: string, options: { workspaceRoot: string; runner?: BridgeRunner }): Promise<ImportPayload> {
  const repository = normalizeGitHubRepository(input)
  const runner = options.runner ?? defaultRunner
  const root = path.resolve(options.workspaceRoot)
  const target = path.resolve(root, repository.owner, repository.repository)
  if (!target.startsWith(`${root}${path.sep}`)) throw new Error('Enter a valid public GitHub repository')
  await mkdir(path.dirname(target), { recursive: true })
  let cloned = false
  try { await stat(path.join(target, '.git')); cloned = true } catch { /* first import */ }
  try {
    if (cloned) await runner.git(['-C', target, 'pull', '--ff-only'], { timeout: 60_000 })
    else await runner.git(['clone', '--depth', '1', '--single-branch', '--no-tags', repository.cloneUrl, target], { timeout: 180_000 })
  } catch (error) { throw new Error(`Could not ${cloned ? 'update' : 'clone'} ${repository.slug}: ${failure(error)}`) }

  let mapper: ImportPayload['mapper']
  try {
    await runner.mapper(target)
    const artifacts = await readArtifacts(target)
    mapper = { available: true, status: 'completed', ...(Object.keys(artifacts).length ? { artifacts } : { note: 'simplicio-mapper ran but produced no readable artifacts' }) }
  } catch (error) {
    const missing = (error as { code?: string }).code === 'ENOENT'
    mapper = { available: false, status: 'basic-analysis', note: missing ? 'simplicio-mapper is not installed or not on PATH' : 'simplicio-mapper failed; showing the basic analysis only' }
  }
  return { name: repository.slug, files: await collectFiles(target), mapper }
}

async function readBody(request: IncomingMessage, limit = 4096): Promise<string> {
  let raw = ''
  for await (const chunk of request) { raw += chunk; if (raw.length > limit) throw new Error('Request too large') }
  return raw
}

export function createImportHandler(options: { workspaceRoot: string; runner?: BridgeRunner }) {
  const inflight = new Map<string, Promise<ImportPayload>>()
  return async (request: IncomingMessage, response: ServerResponse) => {
    response.setHeader('Content-Type', 'application/json')
    response.setHeader('Cache-Control', 'no-store')
    const send = (status: number, body: unknown) => { response.statusCode = status; response.end(JSON.stringify(body)) }
    if (request.method !== 'POST') return send(405, { error: 'POST required' })
    try {
      const parsed = JSON.parse(await readBody(request)) as { repository?: unknown }
      const repository = normalizeGitHubRepository(String(parsed.repository ?? ''))
      // A second request for the same repository shares the running import instead of racing git in the same folder.
      const job = inflight.get(repository.slug) ?? importRepository(repository.slug, options).finally(() => inflight.delete(repository.slug))
      inflight.set(repository.slug, job)
      send(200, await job)
    } catch (error) { send(400, { error: error instanceof Error ? error.message : String(error) }) }
  }
}

export function githubImportPlugin(): Plugin {
  return {
    name: 'simplicio-github-import',
    configureServer(server) {
      server.middlewares.use('/api/github/import', createImportHandler({ workspaceRoot: path.join(process.cwd(), '.simplicio', 'workspaces') }))
    },
  }
}
