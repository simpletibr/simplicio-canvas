/**
 * Python import edges between project files. Mapper and the generic analyzer resolve `from pkg import module`
 * to `pkg/__init__.py`; the architecture view needs the real dependency, the submodule, so Python is resolved here.
 */
export interface FileImport { from: string; to: string }

const dirname = (path: string) => (path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '')
const join = (...parts: string[]) => parts.filter(Boolean).join('/')

function stripStrings(source: string): string {
  return source.replace(/([rRuUbB]{0,2})("""|''')[\s\S]*?\2/g, '').replace(/#[^\n]*/g, '')
}

export function pythonImports(files: Array<{ path: string; content: string }>): FileImport[] {
  const python = files.filter((file) => file.path.endsWith('.py'))
  const known = new Set(python.map((file) => file.path))
  const bySuffix = new Map<string, string[]>()
  for (const { path } of python) {
    const module = path.replace(/(\/__init__)?\.py$/, '')
    const segments = module.split('/')
    for (let start = 0; start < segments.length - 1; start += 1) {
      const key = segments.slice(start).join('/')
      ;(bySuffix.get(key) ?? bySuffix.set(key, []).get(key)!).push(path)
    }
  }
  const exact = (tail: string) => [`${tail}.py`, `${tail}/__init__.py`].find((path) => known.has(path))

  const resolve = (from: string, dotted: string): string | undefined => {
    const dots = /^\.*/.exec(dotted)![0].length
    const rest = dotted.slice(dots).replace(/\./g, '/')
    if (dots) {
      let base = dirname(from)
      for (let up = 1; up < dots; up += 1) base = dirname(base)
      return rest ? exact(join(base, rest)) : known.has(join(base, '__init__.py')) ? join(base, '__init__.py') : undefined
    }
    if (!rest) return undefined
    const found = exact(join(dirname(from), rest)) ?? exact(rest) ?? exact(join('src', rest))
    if (found) return found
    if (!rest.includes('/')) return undefined
    return (bySuffix.get(rest) ?? []).filter((path) => path.endsWith(`${rest}.py`) || path.endsWith(`${rest}/__init__.py`)).sort((a, b) => a.length - b.length || a.localeCompare(b))[0]
  }

  const seen = new Set<string>()
  const edges: FileImport[] = []
  const add = (from: string, to: string | undefined) => {
    if (!to || to === from || seen.has(`${from}\0${to}`)) return
    seen.add(`${from}\0${to}`)
    edges.push({ from, to })
  }

  for (const file of python) {
    const source = stripStrings(file.content)
    for (const match of source.matchAll(/^[ \t]*from[ \t]+(\.*[\w.]*)[ \t]+import[ \t]+(\([^)]*\)|[^\n]*)/gm)) {
      const module = match[1]
      const names = match[2].replace(/[()\\]/g, ' ').split(',').map((name) => name.trim().split(/\s+as\s+/)[0].trim()).filter((name) => /^[\w]+$/.test(name))
      const base = resolve(file.path, module)
      let precise = false
      for (const name of names) {
        const sub = resolve(file.path, module.endsWith('.') ? `${module}${name}` : `${module}.${name}`)
        if (sub && sub !== base) { add(file.path, sub); precise = true }
      }
      if (!precise) add(file.path, base)
    }
    for (const match of source.matchAll(/^[ \t]*import[ \t]+([^\n]+)/gm)) {
      for (const part of match[1].split(',')) add(file.path, resolve(file.path, part.trim().split(/\s+as\s+/)[0].trim()))
    }
  }
  return edges
}
