/** Turning files the user picks (or bundled samples) into a Project or a Trace. Everything stays in the browser. */
import agentDemo from '../../fixtures/traces/agent-demo.trace.jsonl?raw'
import hostTrace from '../../fixtures/traces/turbo-host.trace.jsonl?raw'
import providerTrace from '../../fixtures/traces/turbo-provider.trace.jsonl?raw'
import type { SourceFileInput } from '../domain/analyzer'
import { slimMapperArtifacts, type MapperArtifacts } from '../domain/mapper'
import { parseTrace, type TraceIssue, type TraceParseResult } from '../domain/trace'
import { looksLikeTurbo, turboToTrace } from '../domain/turbo'

export interface SampleTrace { id: string; title: string; text: string }

/** Bundled replays. All are samples (schema-derived or synthetic), never captures of a real run. */
export const SAMPLE_TRACES: SampleTrace[] = [
  { id: 'turbo-provider', title: 'simplicio-loop turbo · provider mode (sample)', text: providerTrace },
  { id: 'turbo-host', title: 'simplicio-loop turbo · host mode (sample)', text: hostTrace },
  { id: 'agent-demo', title: 'Agent fixes a failing test · generic trace (sample)', text: agentDemo },
]

/** Accepts a simplicio.trace/v1 JSONL file or the JSON that `simplicio-loop turbo` prints. */
export function loadTraceText(text: string): TraceParseResult {
  if (!text.trim()) return { trace: null, issues: [{ line: 1, severity: 'error', message: 'the file is empty' }] as TraceIssue[] }
  return looksLikeTurbo(text) ? turboToTrace(text) : parseTrace(text)
}

const SKIP_DIR = /(^|\/)(node_modules|\.git|dist|build|coverage|\.venv|venv|vendor|target|__pycache__|\.next|\.simplicio|\.simplicio-loop)(\/|$)/
const SKIP_FILE = /^(?:\.env.*|id_(?:rsa|dsa|ecdsa|ed25519)(?:\.pub)?|.*\.(?:pem|key|p12|pfx|min\.js|min\.css|map|png|jpe?g|gif|webp|ico|pdf|zip|gz|woff2?|ttf|mp[34]|mov|wasm|lock)|package-lock\.json)$/i
const ARTIFACTS = { 'project-map.json': 'projectMap', 'call-graph.json': 'callGraph', 'symbol-index.json': 'symbolIndex' } as const

export interface FolderProject { name: string; files: SourceFileInput[]; artifacts?: MapperArtifacts }

/** Reads a directory chosen with `<input webkitdirectory>`. Mapper artifacts inside `.simplicio-loop/` are picked up when present. */
export async function readFolder(list: FileList, limits = { maxFiles: 4000, maxFileBytes: 400_000 }): Promise<FolderProject> {
  const all = [...list]
  const name = all[0]?.webkitRelativePath.split('/')[0] || 'folder'
  const files: SourceFileInput[] = []
  const raw: MapperArtifacts = {}
  for (const file of all) {
    const relative = file.webkitRelativePath.split('/').slice(1).join('/')
    if (!relative) continue
    const artifact = /^\.simplicio-loop\/([^/]+)$/.exec(relative)?.[1]
    if (artifact && artifact in ARTIFACTS) {
      try { raw[ARTIFACTS[artifact as keyof typeof ARTIFACTS]] = JSON.parse(await file.text()) as unknown } catch { /* unreadable artifact: ignored */ }
      continue
    }
    if (files.length >= limits.maxFiles || SKIP_DIR.test(relative) || SKIP_FILE.test(relative.split('/').pop()!) || file.size > limits.maxFileBytes) continue
    const content = await file.text()
    if (content.includes('\u0000')) continue
    files.push({ path: relative, content, size: file.size })
  }
  return { name, files, artifacts: Object.keys(raw).length ? slimMapperArtifacts(raw) : undefined }
}
