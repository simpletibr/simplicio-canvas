/**
 * Entry points of a project: the places a run starts. Sources, in order of trust:
 * console scripts (pyproject.toml / package.json), CLI commands (click, typer, argparse handlers),
 * MCP tools (`@server.tool()`, `server.tool("name", …, handler)`) and `main` functions of runnable files.
 * Every entry is backed by a symbol Mapper knows, so a flow can start from it.
 */
import { parse as parseToml } from 'smol-toml'
import type { SourceFileInput } from './analyzer'
import type { MapperSymbol } from './mapper'

export type EntryKind = 'console_script' | 'cli_command' | 'mcp_tool' | 'main' | 'function'
export interface EntryPoint { id: string; kind: EntryKind; name: string; symbol: string; file: string; line: number; evidence: string }
export interface EntryInput { files: SourceFileInput[]; symbols: MapperSymbol[]; entryFiles?: string[] }

const PRIORITY: EntryKind[] = ['console_script', 'cli_command', 'mcp_tool', 'main']

/** Any function can be the start of a flow: the user picks it from the symbol list instead of a detected entry point. */
export function functionEntry(symbol: MapperSymbol & { label?: string }): EntryPoint {
  return { id: `function:${symbol.label ?? symbol.name}:${symbol.id}`, kind: 'function', name: symbol.label ?? symbol.name, symbol: symbol.id, file: symbol.file, line: symbol.line, evidence: 'picked from the symbol list' }
}
const isTest = (path: string) => /(^|\/)(tests?|__tests__|spec)(\/|$)|(^|\/)test_[^/]*$|\.(test|spec)\.[a-z]+$/i.test(path)
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

/** The explicit name in a decorator's arguments: `("serve")` or `name="serve"`, ignoring nested dicts and lists. */
function explicitName(args: string): string | undefined {
  let depth = 0
  let top = ''
  for (const char of args) {
    if ('([{'.includes(char)) depth += 1
    else if (')]}'.includes(char)) depth -= 1
    else if (depth === 0) top += char
  }
  return /\bname\s*=\s*["']([^"']+)["']/.exec(top)?.[1] ?? /^\s*["']([^"']+)["']/.exec(top)?.[1]
}

export function detectEntryPoints(input: EntryInput): { entries: EntryPoint[]; issues: string[] } {
  const issues: string[] = []
  const found: EntryPoint[] = []
  const symbolsByFile = new Map<string, MapperSymbol[]>()
  const symbolsByName = new Map<string, MapperSymbol[]>()
  for (const symbol of input.symbols) {
    ;(symbolsByFile.get(symbol.file) ?? symbolsByFile.set(symbol.file, []).get(symbol.file)!).push(symbol)
    ;(symbolsByName.get(symbol.name) ?? symbolsByName.set(symbol.name, []).get(symbol.name)!).push(symbol)
  }
  const files = [...input.files].sort((a, b) => a.path.localeCompare(b.path))
  const add = (kind: EntryKind, name: string, symbol: MapperSymbol | undefined, evidence: string) => {
    if (symbol) found.push({ id: `${kind}:${name}:${symbol.id}`, kind, name, symbol: symbol.id, file: symbol.file, line: symbol.line, evidence })
  }
  const inFile = (path: string, name: string, line?: number) => (symbolsByFile.get(path) ?? []).find((symbol) => symbol.name === name && (line === undefined || symbol.line === line)) ?? (symbolsByFile.get(path) ?? []).find((symbol) => symbol.name === name)
  const modulePath = (module: string) => {
    const tail = module.replace(/\./g, '/')
    const known = new Set([...input.files.map((file) => file.path), ...symbolsByFile.keys()])
    const candidates = [...known].filter((path) => path === `${tail}.py` || path.endsWith(`/${tail}.py`) || path === `${tail}/__init__.py` || path.endsWith(`/${tail}/__init__.py`))
    return candidates.sort((a, b) => a.length - b.length)[0]
  }

  // 1. Console scripts.
  for (const file of files) {
    if (file.path === 'pyproject.toml' || file.path.endsWith('/pyproject.toml')) {
      let data: Record<string, unknown> = {}
      try { data = parseToml(file.content) } catch (error) { issues.push(`${file.path}: could not read scripts (${error instanceof Error ? error.message.split('\n')[0] : 'invalid TOML'})`); continue }
      const project = isRecord(data.project) ? data.project : {}
      const poetry = isRecord(data.tool) && isRecord(data.tool.poetry) ? data.tool.poetry : {}
      const tables: Array<[string, unknown]> = [['[project.scripts]', project.scripts], ['[project.gui-scripts]', project['gui-scripts']], ['[tool.poetry.scripts]', poetry.scripts]]
      for (const [label, table] of tables) {
        if (!isRecord(table)) continue
        for (const [name, target] of Object.entries(table)) {
          const [module, func] = String(target).split(':')
          const path = module && func ? modulePath(module.trim()) : undefined
          if (path) add('console_script', name, inFile(path, func.trim().split('.').pop()!), `${label} in ${file.path}`)
        }
      }
    } else if (file.path === 'package.json' || file.path.endsWith('/package.json')) {
      let data: unknown
      try { data = JSON.parse(file.content) } catch { issues.push(`${file.path}: could not read bin (invalid JSON)`); continue }
      if (!isRecord(data)) continue
      const bin = typeof data.bin === 'string' ? { [String(data.name ?? 'bin')]: data.bin } : isRecord(data.bin) ? data.bin : {}
      const dir = file.path.includes('/') ? file.path.slice(0, file.path.lastIndexOf('/') + 1) : ''
      for (const [name, target] of Object.entries(bin)) {
        const path = `${dir}${String(target).replace(/^\.\//, '')}`
        add('console_script', name, inFile(path, 'main'), `"bin" in ${file.path}`)
      }
    }
  }

  // 2. Decorated commands and MCP tools, argparse handlers.
  const definition = /^\s*(?:async\s+)?def\s+(\w+)/
  for (const file of files) {
    if (isTest(file.path)) continue
    const lines = file.content.split('\n')
    if (file.path.endsWith('.py')) {
      lines.forEach((line, index) => {
        const decorator = /^\s*@(\w+(?:\.\w+)*)\.(tool|command|group)\b\s*(?:\(([^)]*)\))?/.exec(line) ?? /^\s*@(click)\.(command|group)\b\s*(?:\(([^)]*)\))?/.exec(line)
        if (decorator) {
          let at = index + 1
          while (at < lines.length && (/^\s*@/.test(lines[at]) || !lines[at].trim())) at += 1
          const def = definition.exec(lines[at] ?? '')
          if (!def) return
          const explicit = explicitName(decorator[3] ?? '')
          const kind: EntryKind = decorator[2] === 'tool' ? 'mcp_tool' : 'cli_command'
          const name = explicit ?? (kind === 'mcp_tool' ? def[1] : def[1].replace(/_/g, '-'))
          add(kind, name, inFile(file.path, def[1], at + 1), kind === 'mcp_tool' ? `@${decorator[1]}.tool() in ${file.path}` : `@${decorator[1]}.${decorator[2]}() in ${file.path}`)
        }
        const parser = /add_parser\(\s*["']([\w-]+)["']/.exec(line)
        if (parser) {
          const window = lines.slice(index, index + 12).join('\n')
          const handler = /set_defaults\(\s*(?:func|handler|command|callback)\s*=\s*([\w.]+)/.exec(window)?.[1]?.split('.').pop()
          if (handler) add('cli_command', parser[1], inFile(file.path, handler) ?? symbolsByName.get(handler)?.[0], `argparse sub-command in ${file.path}`)
        }
      })
    } else if (/\.(?:[cm]?[jt]sx?)$/.test(file.path)) {
      for (const line of lines) {
        const registered = /\.(?:tool|registerTool)\(\s*['"`]([\w.-]+)['"`][^\n]*?,\s*([A-Za-z_$][\w$]*)\s*\)/.exec(line)
        if (registered) add('mcp_tool', registered[1], inFile(file.path, registered[2]) ?? symbolsByName.get(registered[2])?.[0], `server.tool("${registered[1]}") in ${file.path}`)
      }
    }
  }

  // 3. `main` functions of runnable files.
  const runnable = new Set(input.entryFiles ?? [])
  const runnableName = /(^|\/)(main\.(go|rs)|__main__\.py|Program\.cs|Main\.java)$/
  for (const file of files) {
    if (isTest(file.path)) continue
    const main = inFile(file.path, 'main')
    if (!main) continue
    const guarded = /if\s+__name__\s*==\s*['"]__main__['"]/.test(file.content) || /require\.main\s*===\s*module/.test(file.content)
    const why = runnable.has(file.path) ? 'flagged as an entry file by Mapper' : guarded ? `if __name__ == "__main__" guard in ${file.path}` : runnableName.test(file.path) ? `main function in ${file.path}` : undefined
    if (why) add('main', 'main', main, why)
  }

  // A symbol is listed once: a named entry beats a plain `main`.
  const seen = new Set<string>()
  const entries = found
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) => PRIORITY.indexOf(a.entry.kind) - PRIORITY.indexOf(b.entry.kind) || (a.entry.kind === 'main' ? a.entry.file.localeCompare(b.entry.file) : a.index - b.index))
    .map(({ entry }) => entry)
    .filter((entry) => { const key = entry.kind === 'mcp_tool' ? entry.id : entry.symbol; if (seen.has(key)) return false; seen.add(key); return true })
  const namedSymbols = new Set(entries.filter((entry) => entry.kind !== 'main').map((entry) => entry.symbol))
  return { entries: entries.filter((entry) => entry.kind !== 'main' || !namedSymbols.has(entry.symbol)), issues }
}
