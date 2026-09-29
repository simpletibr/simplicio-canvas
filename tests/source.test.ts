import { describe, expect, it } from 'vitest'
import { EXAMPLE_FILES } from '../src/example'
import { bodyRange, docOf, earlyExitBefore, excerpt, guardsAt, languageFamily, paramsOf, raisesIn, signatureOf } from '../src/domain/source'

const lines = (path: string) => EXAMPLE_FILES.find((file) => file.path === path)!.content.split('\n')
const cli = lines('simplicio_loop/cli.py')
const turboCli = lines('simplicio_loop/turbo_cli.py')

describe('languageFamily', () => {
  it('maps Mapper language ids and file paths to the parsing strategy', () => {
    expect(languageFamily('python')).toBe('python')
    expect(languageFamily('Python')).toBe('python')
    expect(languageFamily('typescript')).toBe('brace')
    expect(languageFamily('go')).toBe('brace')
    expect(languageFamily(undefined, 'a/b.py')).toBe('python')
    expect(languageFamily(undefined, 'a/b.ts')).toBe('brace')
    expect(languageFamily('markdown')).toBe('other')
  })
})

describe('Python source analysis (real bundled files)', () => {
  it('finds the body of a function by indentation', () => {
    expect(bodyRange(cli, 9, 'python')).toEqual({ start: 9, end: 17 })
    expect(bodyRange(turboCli, 9, 'python')).toEqual({ start: 9, end: 25 })
  })

  it('reads the signature and the docstring summary', () => {
    expect(signatureOf(cli, 9, 'python')).toBe('def main(argv=None)')
    expect(docOf(cli, 9, 'python')).toEqual({ summary: 'Dispatch the command line to the sub-command that was asked for.', doc: 'Dispatch the command line to the sub-command that was asked for.' })
  })

  it('splits parameters and the return annotation', () => {
    expect(paramsOf('def main(argv=None)', 'python')).toEqual({ params: ['argv=None'] })
    expect(paramsOf('def f(self, a, b=(1, 2), *args, **kw) -> dict[str, int]', 'python')).toEqual({ params: ['a', 'b=(1, 2)', '*args', '**kw'], returns: 'dict[str, int]' })
    expect(paramsOf('def f()', 'python')).toEqual({ params: [] })
  })

  it('reports the conditions that guard a call, outermost first', () => {
    expect(guardsAt(turboCli, { start: 9, end: 25 }, 11, 'python')).toEqual([])
    expect(guardsAt(turboCli, { start: 9, end: 25 }, 15, 'python')).toEqual([{ kind: 'if', text: 'if options["apply"]:' }])
    expect(guardsAt(turboCli, { start: 9, end: 25 }, 17, 'python')).toEqual([{ kind: 'elif', text: 'elif options["provider"]:', after: ['if options["apply"]:'] }])
    expect(guardsAt(turboCli, { start: 9, end: 25 }, 19, 'python')).toEqual([{ kind: 'else', text: 'else:', after: ['if options["apply"]:', 'elif options["provider"]:'] }])
    expect(guardsAt(turboCli, { start: 9, end: 25 }, 23, 'python').map((guard) => guard.text)).toEqual(['if options["verify"] and result["applied_all"]:', 'if not result["verify"]["passed"]:'])
    expect(guardsAt(turboCli, { start: 9, end: 25 }, 24, 'python')).toEqual([])
  })

  it('reports loops as guards too, since the call may run zero or many times', () => {
    const prompts = lines('simplicio_loop/prompts.py')
    const range = bodyRange(prompts, 19, 'python')
    const inner = prompts.findIndex((line) => line.includes('chunks.append')) + 1
    expect(guardsAt(prompts, range, inner, 'python').map((guard) => guard.kind)).toEqual(['for', 'for', 'if'])
  })

  it('does not treat module-level code after a function as part of its body', () => {
    const range = bodyRange(cli, 20, 'python')
    const guardLine = cli.findIndex((line) => line.startsWith('if __name__')) + 1
    expect(range).toEqual({ start: 20, end: 23 })
    expect(guardLine).toBeGreaterThan(range.end)
  })

  it('lists exception types raised inside a body', () => {
    const provider = lines('simplicio_loop/turbo_provider.py')
    expect(raisesIn(provider, bodyRange(provider, 7, 'python'), 'python')).toEqual(['RuntimeError'])
    expect(raisesIn(cli, bodyRange(cli, 9, 'python'), 'python')).toEqual([])
  })

  it('handles multi-line signatures, one-liners and unindented text inside docstrings', () => {
    const source = ['def long(', '    a,', '    b=1,', ') -> int:', '    """Add.', '', 'text at column zero', '"""', '    return a + b', '', 'def short(): return 1', '', 'x = 1'].join('\n').split('\n')
    expect(signatureOf(source, 1, 'python')).toBe('def long( a, b=1, ) -> int')
    expect(bodyRange(source, 1, 'python')).toEqual({ start: 1, end: 9 })
    expect(docOf(source, 1, 'python').summary).toBe('Add.')
    expect(bodyRange(source, 11, 'python')).toEqual({ start: 11, end: 11 })
  })

  it('returns no doc for undocumented functions', () => {
    const source = ['def bare(x):', '    return x']
    expect(docOf(source, 1, 'python')).toEqual({})
  })
})

describe('brace-language source analysis', () => {
  const ts = [
    '/**',
    ' * Entry point of the app.',
    ' * Reads a file and counts it.',
    ' *',
    ' * @param argv command line',
    ' */',
    'export function main(argv: string[]): number {',
    '  const text = "}" + load(argv[0]) // } in a comment',
    '  if (text) {',
    '    return compute(text)',
    '  } else {',
    '    throw new RangeError("empty")',
    '  }',
    '}',
    '',
    'const arrow = (x: number) => x + 1',
  ]

  it('finds the closing brace while ignoring braces in strings and comments', () => {
    expect(bodyRange(ts, 7, 'brace')).toEqual({ start: 7, end: 14 })
    expect(bodyRange(ts, 16, 'brace')).toEqual({ start: 16, end: 16 })
  })

  it('reads a JSDoc summary (first paragraph, no tags), the signature, params and return type', () => {
    expect(docOf(ts, 7, 'brace').summary).toBe('Entry point of the app. Reads a file and counts it.')
    expect(signatureOf(ts, 7, 'brace')).toBe('export function main(argv: string[]): number')
    expect(paramsOf('export function main(argv: string[]): number', 'brace')).toEqual({ params: ['argv: string[]'], returns: 'number' })
  })

  it('finds guards and thrown errors', () => {
    const range = bodyRange(ts, 7, 'brace')
    expect(guardsAt(ts, range, 10, 'brace').map((guard) => guard.text)).toEqual(['if (text)'])
    expect(guardsAt(ts, range, 12, 'brace')).toEqual([{ kind: 'else', text: 'else', after: ['if (text)'] }])
    expect(raisesIn(ts, range, 'brace')).toEqual(['RangeError'])
  })

  it('reads // and /// comment blocks as the summary (Go, Rust)', () => {
    const go = ['// Run executes one task.', '// It never panics.', 'func Run(task Task) error {', '  return nil', '}']
    expect(docOf(go, 3, 'brace').summary).toBe('Run executes one task. It never panics.')
  })
})

describe('earlyExitBefore', () => {
  it('finds the nearest earlier return or raise inside a block that has already ended', () => {
    const range = { start: 9, end: 25 }
    expect(earlyExitBefore(turboCli, range, 11, 'python')).toBeUndefined()
    expect(earlyExitBefore(turboCli, range, 15, 'python')).toBeUndefined()
    expect(earlyExitBefore(turboCli, range, 24, 'python')).toEqual({ line: 19, text: 'return host_mode.request_plan(options["repo"], tasks, survey)' })
    expect(earlyExitBefore(cli, { start: 9, end: 17 }, 17, 'python')).toEqual({ line: 16, text: 'return turbo_cli.run_turbo_command(rest)' })
  })

  it('ignores a top-level return and exits in the same block as the call', () => {
    const source = ['def f(x):', '    if x:', '        return 1', '        g()', '    return 2', '']
    expect(earlyExitBefore(source, { start: 1, end: 5 }, 4, 'python')).toBeUndefined()
    expect(earlyExitBefore(['def f():', '    a()', '    return 1'], { start: 1, end: 3 }, 2, 'python')).toBeUndefined()
  })

  it('works for brace languages', () => {
    const source = ['function f(x) {', '  if (x) {', '    return 1', '  }', '  g()', '}']
    expect(earlyExitBefore(source, { start: 1, end: 6 }, 5, 'brace')).toEqual({ line: 3, text: 'return 1' })
  })
})

describe('excerpt', () => {
  it('returns the numbered body and marks truncation', () => {
    const source = Array.from({ length: 100 }, (_, index) => `line ${index + 1}`)
    expect(excerpt(source, { start: 10, end: 14 }, 60)).toEqual({ start: 10, end: 14, lines: ['line 10', 'line 11', 'line 12', 'line 13', 'line 14'], truncated: false })
    const long = excerpt(source, { start: 1, end: 100 }, 60)
    expect(long.lines).toHaveLength(60)
    expect(long).toMatchObject({ start: 1, end: 60, truncated: true })
  })
})
