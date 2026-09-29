/**
 * Small, dependency-free source readers used by the flow views: where a symbol's body ends, its signature,
 * doc comment, parameters, the conditions guarding a call and the errors it can raise. They work from the line
 * number Mapper reports for the definition, so they never need a parser for the whole language.
 * They are heuristics for well-formatted code and say so in the UI.
 */
export type LanguageFamily = 'python' | 'brace' | 'other'
export interface LineRange { start: number; end: number }
export interface Guard { kind: string; text: string; after?: string[] }

const BRACE = new Set(['typescript', 'javascript', 'tsx', 'jsx', 'java', 'kotlin', 'csharp', 'c#', 'go', 'rust', 'swift', 'php', 'c', 'cpp', 'c++', 'c/c++', 'dart', 'scala', 'vue', 'svelte', 'razor'])
const EXTENSIONS: Record<string, LanguageFamily> = { py: 'python', ts: 'brace', tsx: 'brace', js: 'brace', jsx: 'brace', mjs: 'brace', cjs: 'brace', java: 'brace', kt: 'brace', cs: 'brace', go: 'brace', rs: 'brace', swift: 'brace', php: 'brace', c: 'brace', h: 'brace', cpp: 'brace', hpp: 'brace', dart: 'brace' }

export function languageFamily(language?: string, path?: string): LanguageFamily {
  const name = language?.toLowerCase()
  if (name === 'python') return 'python'
  if (name && BRACE.has(name)) return 'brace'
  if (!name && path) return EXTENSIONS[path.split('.').pop()?.toLowerCase() ?? ''] ?? 'other'
  return 'other'
}

const indentOf = (line: string) => { let width = 0; for (const char of line) { if (char === ' ') width += 1; else if (char === '\t') width += 4; else break } return width }
const blank = (line: string | undefined) => !line || !line.trim()
const collapse = (text: string) => text.replace(/\s+/g, ' ').trim()

/** Remove string contents and trailing comments so bracket counting sees only code. */
function stripCode(line: string, family: LanguageFamily): string {
  let out = ''
  let quote = ''
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]
    if (quote) { if (char === '\\') index += 1; else if (char === quote) quote = ''; continue }
    if (char === '"' || char === "'" || (family === 'brace' && char === '`')) { quote = char; continue }
    if (family === 'python' && char === '#') break
    if (family === 'brace' && char === '/' && line[index + 1] === '/') break
    out += char
  }
  return out
}

/** Index (0-based) of the line where a Python signature ends: the parentheses are balanced and the line ends with a colon. */
function pythonSignatureEnd(lines: string[], from: number): number {
  let depth = 0
  for (let index = from; index < Math.min(lines.length, from + 40); index += 1) {
    for (const char of stripCode(lines[index], 'python')) { if ('([{'.includes(char)) depth += 1; else if (')]}'.includes(char)) depth -= 1 }
    if (depth <= 0 && /:\s*$/.test(stripCode(lines[index], 'python'))) return index
    if (depth <= 0 && /\)\s*(->[^:]*)?:\s*\S/.test(stripCode(lines[index], 'python'))) return index
  }
  return from
}

const tripleQuotes = (line: string) => (line.match(/"""|'''/g) ?? []).length

function pythonBody(lines: string[], defLine: number): LineRange {
  const start = defLine - 1
  const signatureEnd = pythonSignatureEnd(lines, start)
  if (!/:\s*$/.test(stripCode(lines[signatureEnd] ?? '', 'python'))) return { start: defLine, end: signatureEnd + 1 }
  const defIndent = indentOf(lines[start] ?? '')
  let end = signatureEnd + 1
  let insideString = false
  for (let index = signatureEnd + 1; index < lines.length; index += 1) {
    const line = lines[index]
    if (!insideString) { if (blank(line)) continue; if (indentOf(line) <= defIndent) break }
    end = index + 1
    if (tripleQuotes(line) % 2 === 1) insideString = !insideString
  }
  return { start: defLine, end }
}

function braceBody(lines: string[], defLine: number): LineRange {
  let depth = 0
  let started = false
  let block = false
  for (let index = defLine - 1; index < Math.min(lines.length, defLine + 4000); index += 1) {
    const line = lines[index]
    let quote = ''
    for (let at = 0; at < line.length; at += 1) {
      const char = line[at]
      const next = line[at + 1]
      if (block) { if (char === '*' && next === '/') { block = false; at += 1 } continue }
      if (quote) { if (char === '\\') at += 1; else if (char === quote) quote = ''; continue }
      if (char === '"' || char === "'" || char === '`') { quote = char; continue }
      if (char === '/' && next === '/') break
      if (char === '/' && next === '*') { block = true; at += 1; continue }
      if (char === '{') { depth += 1; started = true } else if (char === '}') { depth -= 1; if (started && depth <= 0) return { start: defLine, end: index + 1 } }
    }
    if (!started && index - (defLine - 1) >= 12) break
    if (!started && /;\s*$/.test(stripCode(line, 'brace'))) break
  }
  return { start: defLine, end: defLine }
}

export function bodyRange(lines: string[], defLine: number, family: LanguageFamily): LineRange {
  if (defLine < 1 || defLine > lines.length) return { start: defLine, end: defLine }
  if (family === 'python') return pythonBody(lines, defLine)
  if (family === 'brace') return braceBody(lines, defLine)
  return { start: defLine, end: Math.min(lines.length, defLine + 19) }
}

export function signatureOf(lines: string[], defLine: number, family: LanguageFamily): string {
  const start = defLine - 1
  if (family === 'python') {
    const end = pythonSignatureEnd(lines, start)
    const text = collapse(lines.slice(start, end + 1).map((line) => stripCode(line, 'python')).join(' '))
    return text.replace(/:\s*$/, '').replace(/^(.*\)\s*(?:->[^:]*)?):\s*\S.*$/, '$1')
  }
  let text = ''
  for (let index = start; index < Math.min(lines.length, start + 6); index += 1) {
    const line = stripCode(lines[index], 'brace')
    const brace = line.indexOf('{')
    text += ` ${brace >= 0 ? line.slice(0, brace) : line}`
    if (brace >= 0 || /;\s*$/.test(line)) break
    if (index === start && family !== 'brace') break
  }
  return collapse(text).replace(/;$/, '')
}

const tagLine = /^@\w+/

function paragraph(rows: string[]): string | undefined {
  const kept: string[] = []
  for (const row of rows) {
    const text = row.trim()
    if (tagLine.test(text)) break
    if (!text) { if (kept.length) break; continue }
    kept.push(text)
  }
  const summary = collapse(kept.join(' '))
  return summary || undefined
}

export function docOf(lines: string[], defLine: number, family: LanguageFamily): { summary?: string; doc?: string } {
  if (family === 'python') {
    let index = pythonSignatureEnd(lines, defLine - 1) + 1
    while (index < lines.length && blank(lines[index])) index += 1
    const first = lines[index]?.trim() ?? ''
    const opener = first.match(/^[rRuUbB]{0,2}("""|''')/)
    if (!opener) return {}
    const quote = opener[1]
    const rows: string[] = []
    let rest = first.slice(first.indexOf(quote) + 3)
    for (let at = index; at < lines.length; at += 1) {
      const closing = rest.indexOf(quote)
      if (closing >= 0) { rows.push(rest.slice(0, closing)); break }
      rows.push(rest)
      rest = lines[at + 1] ?? ''
    }
    const indent = Math.min(...rows.slice(1).filter((row) => row.trim()).map(indentOf), Infinity)
    const doc = [rows[0]?.trim() ?? '', ...rows.slice(1).map((row) => (Number.isFinite(indent) ? row.slice(Math.min(indent, indentOf(row))) : row))].join('\n').trim()
    const summary = paragraph(doc.split('\n'))
    return summary ? { summary, doc } : {}
  }
  if (family !== 'brace') return {}
  let index = defLine - 2
  while (index >= 0 && (/^\s*(@\w|#\[)/.test(lines[index]) || blank(lines[index]))) index -= 1
  if (index < 0) return {}
  const last = lines[index].trim()
  if (last.endsWith('*/')) {
    let from = index
    while (from > 0 && !lines[from].includes('/*')) from -= 1
    const rows = lines.slice(from, index + 1).map((row) => row.trim().replace(/^\/\*+/, '').replace(/\*+\/$/, '').replace(/^\*\s?/, ''))
    const summary = paragraph(rows)
    return summary ? { summary, doc: rows.join('\n').trim() } : {}
  }
  if (/^\/\/[/!]?/.test(last)) {
    const rows: string[] = []
    for (let at = index; at >= 0 && /^\s*\/\/[/!]?/.test(lines[at]); at -= 1) rows.unshift(lines[at].trim().replace(/^\/\/[/!]?\s?/, ''))
    const summary = paragraph(rows)
    return summary ? { summary, doc: rows.join('\n').trim() } : {}
  }
  return {}
}

function splitTop(text: string): string[] {
  const parts: string[] = []
  let depth = 0
  let current = ''
  let quote = ''
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    if (quote) { current += char; if (char === '\\') { current += text[index + 1] ?? ''; index += 1 } else if (char === quote) quote = ''; continue }
    if (char === '"' || char === "'") { quote = char; current += char; continue }
    if ('([{'.includes(char) || (char === '<' && /\w/.test(text[index - 1] ?? ''))) depth += 1
    else if (')]}'.includes(char) || (char === '>' && text[index - 1] !== '=' && depth > 0)) depth -= 1
    if (char === ',' && depth === 0) { parts.push(current); current = ''; continue }
    current += char
  }
  parts.push(current)
  return parts.map((part) => part.trim()).filter(Boolean)
}

export function paramsOf(signature: string, family: LanguageFamily): { params: string[]; returns?: string } {
  const open = signature.indexOf('(')
  if (open < 0) return { params: [] }
  let depth = 0
  let close = -1
  for (let index = open; index < signature.length; index += 1) {
    if (signature[index] === '(') depth += 1
    else if (signature[index] === ')') { depth -= 1; if (depth === 0) { close = index; break } }
  }
  if (close < 0) return { params: [] }
  const params = splitTop(signature.slice(open + 1, close)).filter((param) => param !== 'self' && param !== 'cls')
  const tail = signature.slice(close + 1).trim()
  const returns = family === 'python' ? tail.match(/^->\s*(.+)$/)?.[1] : tail.match(/^:\s*(.+)$/)?.[1]
  return returns ? { params, returns: returns.trim() } : { params }
}

const CONTROL_PY = /^(if|elif|else|for|while|except|match|case|async for|async def|def)\b/
const CONTROL_BRACE = /^(if|else if|else|for|while|switch|case|catch|foreach|do)\b/

function header(line: string, family: LanguageFamily): { kind: string; text: string } | undefined {
  const text = line.trim().replace(/^}\s*/, '').replace(/\s*\{\s*$/, '').trim()
  const match = (family === 'python' ? CONTROL_PY : CONTROL_BRACE).exec(text)
  if (!match) return undefined
  const kind = match[1] === 'else if' ? 'elif' : match[1] === 'async for' ? 'for' : match[1] === 'async def' ? 'def' : match[1] === 'foreach' ? 'for' : match[1]
  return { kind, text: text.length > 120 ? `${text.slice(0, 119)}…` : text }
}

/** Conditions (if/elif/else, loops, except, nested defs) around a call, from the outermost inwards. */
export function guardsAt(lines: string[], range: LineRange, callLine: number, family: LanguageFamily): Guard[] {
  if (family === 'other') return []
  const baseIndent = indentOf(lines[range.start - 1] ?? '')
  let current = indentOf(lines[callLine - 1] ?? '')
  const guards: Guard[] = []
  for (let index = callLine - 2; index >= range.start; index -= 1) {
    const line = lines[index]
    if (blank(line) || (family === 'python' ? /^\s*#/.test(line) : /^\s*(\/\/|\*|\/\*)/.test(line))) continue
    const indent = indentOf(line)
    if (indent >= current) continue
    if (indent <= baseIndent) break
    current = indent
    const found = header(line, family)
    if (!found) continue
    const guard: Guard = { kind: found.kind, text: found.text }
    if (found.kind === 'elif' || found.kind === 'else') {
      const after: string[] = []
      for (let up = index - 1; up >= range.start; up -= 1) {
        const sibling = lines[up]
        if (blank(sibling)) continue
        const siblingIndent = indentOf(sibling)
        if (siblingIndent > indent) continue
        if (siblingIndent < indent) break
        const previous = header(sibling, family)
        if (!previous || (previous.kind !== 'if' && previous.kind !== 'elif')) break
        after.unshift(previous.text)
        if (previous.kind === 'if') break
      }
      if (after.length) guard.after = after
    }
    guards.unshift(guard)
  }
  return guards
}

export function raisesIn(lines: string[], range: LineRange, family: LanguageFamily): string[] {
  const found: string[] = []
  const pattern = family === 'python' ? /\braise\s+([A-Za-z_][\w.]*)/ : /\bthrow\s+(?:new\s+)?([A-Za-z_][\w.]*)/
  for (let index = range.start; index < Math.min(lines.length, range.end); index += 1) {
    const match = pattern.exec(stripCode(lines[index], family))
    if (match && !found.includes(match[1])) found.push(match[1])
  }
  return found
}

export function excerpt(lines: string[], range: LineRange, max = 60): { start: number; end: number; lines: string[]; truncated: boolean } {
  const end = Math.min(range.end, range.start + max - 1)
  return { start: range.start, end, lines: lines.slice(range.start - 1, end), truncated: end < range.end }
}

/**
 * The nearest earlier `return`/`raise`/`throw` sitting inside a block that closes before the call: when it runs,
 * the function ends before reaching the call, so the call is conditional even without an enclosing `if`.
 */
export function earlyExitBefore(lines: string[], range: LineRange, callLine: number, family: LanguageFamily): { line: number; text: string } | undefined {
  if (family === 'other') return undefined
  const exit = family === 'python' ? /^\s*(return|raise)\b/ : /^\s*(return|throw)\b/
  const defIndent = indentOf(lines[range.start - 1] ?? '')
  for (let at = callLine - 2; at >= range.start; at -= 1) {
    const line = lines[at]
    if (blank(line) || !exit.test(line)) continue
    const indent = indentOf(line)
    let header = at - 1
    while (header >= range.start - 1 && (blank(lines[header]) || indentOf(lines[header]) >= indent)) header -= 1
    if (header < range.start - 1 || indentOf(lines[header]) <= defIndent) continue
    const headerIndent = indentOf(lines[header])
    let end = at
    for (let next = at + 1; next < Math.min(lines.length, range.end); next += 1) {
      if (blank(lines[next])) continue
      if (indentOf(lines[next]) <= headerIndent) break
      end = next
    }
    if (callLine - 1 > end) return { line: at + 1, text: line.trim() }
  }
  return undefined
}
