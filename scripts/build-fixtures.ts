/**
 * Regenerates the derived fixtures. Run with `npm run fixtures`.
 *  - fixtures/example/mapper/*.json  ← a real `simplicio-mapper scan` of fixtures/example/simplicio-loop (needs simplicio-mapper on PATH)
 *  - fixtures/traces/*.trace.jsonl   ← the turbo-run documents converted to simplicio.trace/v1
 * Pass `--example` or `--traces` to run only one part.
 */
import { execFileSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { slimMapperArtifacts } from '../src/domain/mapper'
import { serializeTrace } from '../src/domain/trace'
import { turboToTrace } from '../src/domain/turbo'

const root = join(import.meta.dirname, '..')
const wanted = process.argv.slice(2)
const only = (name: string) => !wanted.length || wanted.includes(`--${name}`)

function buildExample() {
  const source = join(root, 'fixtures/example/simplicio-loop')
  const work = mkdtempSync(join(tmpdir(), 'canvas-example-'))
  try {
    cpSync(source, work, { recursive: true })
    const git = (...args: string[]) => execFileSync('git', ['-c', 'user.email=canvas@example.invalid', '-c', 'user.name=canvas', ...args], { cwd: work, stdio: 'ignore' })
    git('init', '-q', '.'); git('add', '-A'); git('commit', '-qm', 'snapshot')
    execFileSync('simplicio-mapper', ['scan', work, '--sync', '--await', '--json'], { stdio: 'ignore', timeout: 120_000 })
    const read = (name: string) => JSON.parse(readFileSync(join(work, '.simplicio-loop', name), 'utf8')) as unknown
    const slim = slimMapperArtifacts({ projectMap: read('project-map.json'), callGraph: read('call-graph.json'), symbolIndex: read('symbol-index.json') })
    const out = join(root, 'fixtures/example/mapper')
    mkdirSync(out, { recursive: true })
    writeFileSync(join(out, 'project-map.json'), `${JSON.stringify(slim.projectMap, null, 1)}\n`)
    writeFileSync(join(out, 'call-graph.json'), `${JSON.stringify(slim.callGraph, null, 1)}\n`)
    writeFileSync(join(out, 'symbol-index.json'), `${JSON.stringify(slim.symbolIndex, null, 1)}\n`)
    console.log(`example: wrote slim Mapper artifacts to ${out}`)
  } finally { rmSync(work, { recursive: true, force: true }) }
}

function buildTraces() {
  const dir = join(root, 'fixtures/traces')
  const sources: Array<[string, boolean]> = [['turbo-provider.run.json', true], ['turbo-host.docs.jsonl', true], ['turbo-blocked.run.json', false]]
  for (const [file, synthetic] of sources) {
    const { trace, issues } = turboToTrace(readFileSync(join(dir, file), 'utf8'), { synthetic })
    if (!trace) throw new Error(`${file}: ${issues.map((issue) => issue.message).join('; ')}`)
    const out = file.replace(/\.(run\.json|docs\.jsonl)$/, '.trace.jsonl')
    writeFileSync(join(dir, out), serializeTrace(trace))
    console.log(`traces: ${file} → ${out} (${trace.events.length} events)`)
  }
}

if (only('example')) buildExample()
if (only('traces')) buildTraces()
