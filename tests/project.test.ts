import { describe, expect, it } from 'vitest'
import { EXAMPLE_ARTIFACTS, EXAMPLE_FILES, EXAMPLE_NAME } from '../src/example'
import { functionEntry } from '../src/domain/entrypoints'
import { ambiguousOf, buildProject, callRoots, callersOf, callsOf, describeSymbol, externalCallsOf, findSymbols } from '../src/domain/project'

const example = buildProject({ name: EXAMPLE_NAME, files: EXAMPLE_FILES, artifacts: EXAMPLE_ARTIFACTS })
const RUN = 'simplicio_loop/turbo_cli.py::run_turbo_command'

describe('project model from the bundled example', () => {
  it('indexes symbols by id and by file, sorted by line, and lists entry points', () => {
    expect(example.symbols.size).toBe(41)
    expect(example.symbols.get('simplicio_loop/cli.py::main')).toMatchObject({ label: 'main', line: 9, file: 'simplicio_loop/cli.py' })
    expect(example.symbolsByFile.get('simplicio_loop/cli.py')?.map((symbol) => symbol.name)).toEqual(['main', 'print_usage'])
    expect(example.entries.map((entry) => `${entry.kind}:${entry.name}`)).toEqual(['console_script:simplicio-loop', 'console_script:simplicio-loop-mcp', 'mcp_tool:simplicio_turbo', 'mcp_tool:simplicio_survey', 'main:main'])
    expect(example.entries[0]).toMatchObject({ symbol: 'simplicio_loop/cli.py::main', file: 'simplicio_loop/cli.py', line: 9 })
    expect(example.mapper?.producer?.component).toBe('simplicio-mapper')
    expect(example.issues).toEqual([])
  })

  it('unions Mapper imports with the analyzer imports and never imports a file into itself', () => {
    const pairs = example.imports.map((edge) => `${edge.from}>${edge.to}`)
    expect(pairs).toContain('simplicio_loop/cli.py>simplicio_loop/turbo_cli.py')
    expect(new Set(pairs).size).toBe(pairs.length)
    expect(example.imports.every((edge) => edge.from !== edge.to)).toBe(true)
  })

  it('lists outgoing calls in call order with the conditions that guard them', () => {
    const calls = callsOf(example, RUN)
    expect(calls.map((call) => [call.to.split('::')[1], call.line])).toEqual([
      ['parse_options', 11], ['build_tasks', 12], ['survey', 13], ['apply_plan', 15], ['run_with_provider', 17], ['request_plan', 19], ['run_verify', 21], ['repair_plan', 23], ['emit', 24],
    ])
    expect(calls.map((call) => call.guards.map((guard) => guard.kind))).toEqual([[], [], [], ['if'], ['elif'], ['else'], ['if'], ['if', 'if'], []])
  })

  it('drops ambiguous edges and calls that sit in module-level code after the function', () => {
    expect(callsOf(example, 'simplicio_loop/cli.py::print_usage').map((call) => call.to)).toEqual(['simplicio_loop/report.py::emit'])
    expect(ambiguousOf(example, 'simplicio_loop/cli.py::print_usage')).toEqual([])
    expect(callsOf(example, 'hooks/loop_stop.py::promise_is_true')).toEqual([])
  })

  it('lists callers, ignoring self loops', () => {
    expect(callersOf(example, 'simplicio_loop/report.py::emit').map((call) => call.from.split('::')[1]).sort()).toEqual(['orient', 'print_usage', 'request_plan', 'run_turbo_command'])
    expect(callersOf(example, RUN).map((call) => call.from.split('::')[1]).sort()).toEqual(['main', 'simplicio_turbo'])
    expect(callersOf(example, 'simplicio_loop/cli.py::main')).toEqual([])
  })

  it('lists calls Mapper could not resolve (external or builtin) by the function that makes them', () => {
    expect(externalCallsOf(example, 'simplicio_loop/turbo_cli.py::build_tasks')).toEqual(['enumerate', 'append'])
    expect(externalCallsOf(example, 'simplicio_loop/cli.py::main')).toEqual([])
  })

  it('describes a symbol: signature, summary, parameters, source excerpt and neighbours', () => {
    const details = describeSymbol(example, RUN)!
    expect(details.symbol.label).toBe('run_turbo_command')
    expect(details).toMatchObject({ signature: 'def run_turbo_command(argv)', summary: 'Survey the repository, plan each task, apply the plans and verify the result.', params: ['argv'], raises: [] })
    expect(details.excerpt).toMatchObject({ start: 9, end: 25, truncated: false })
    expect(details.excerpt?.lines[0]).toBe('def run_turbo_command(argv):')
    expect(details.callees).toHaveLength(9)
    expect(details.callers).toHaveLength(2)
    expect(describeSymbol(example, 'simplicio_loop/turbo_provider.py::require_key')?.raises).toEqual(['RuntimeError'])
    expect(describeSymbol(example, 'nope')).toBeUndefined()
  })
})

describe('picking any function as a flow start', () => {
  it('suggests the call graph roots: functions that call others but are called by nobody', () => {
    const roots = callRoots(example, 10).map((symbol) => symbol.label)
    expect(roots).toEqual(expect.arrayContaining(['main', 'simplicio_turbo', 'simplicio_survey']))
    expect(roots).not.toContain('emit')
    expect(roots).not.toContain('run_turbo_command')
    expect(roots.some((label) => label.startsWith('test_'))).toBe(false)
  })

  it('finds functions by name or file, exact names first, and ignores one-letter searches', () => {
    expect(findSymbols(example, 'emit').map((symbol) => symbol.label)[0]).toBe('emit')
    expect(findSymbols(example, 'turbo_cli.py').every((symbol) => symbol.file.endsWith('turbo_cli.py'))).toBe(true)
    expect(findSymbols(example, 'e')).toEqual([])
    expect(findSymbols(example, 'run', 3)).toHaveLength(3)
  })

  it('turns a symbol into a function entry with a unique id', () => {
    const entry = functionEntry(example.symbols.get('simplicio_loop/report.py::emit')!)
    expect(entry).toMatchObject({ kind: 'function', name: 'emit', symbol: 'simplicio_loop/report.py::emit', file: 'simplicio_loop/report.py' })
    expect(entry.id).toContain('simplicio_loop/report.py::emit')
  })
})

describe('project model edge cases', () => {
  const svc = ['"""Service module."""', '', '', 'class TaskService:', '    """Runs tasks."""', '', '    def __init__(self, repo):', '        self.repo = repo', '', '    def run(self, task):', '        """Run one task."""', '        self.validate(task)', '        return helper(task)', '', '    def validate(self, task):', '        if not task:', '            raise ValueError("empty")', '', '', 'def helper(task):', '    return str(task)', ''].join('\n')
  const artifacts = {
    symbolIndex: { schema: 'simplicio.symbol-index/v1', symbols: [
      { name: 'TaskService', qualified_name: 'py/svc.py::TaskService', kind: 'class', language: 'python', defined_in: 'py/svc.py', line: 4 },
      { name: '__init__', qualified_name: 'py/svc.py::__init__', kind: 'function', language: 'python', defined_in: 'py/svc.py', line: 7 },
      { name: 'run', qualified_name: 'py/svc.py::run', kind: 'function', language: 'python', defined_in: 'py/svc.py', line: 10 },
      { name: 'validate', qualified_name: 'py/svc.py::validate', kind: 'function', language: 'python', defined_in: 'py/svc.py', line: 15 },
      { name: 'helper', qualified_name: 'py/svc.py::helper', kind: 'function', language: 'python', defined_in: 'py/svc.py', line: 20 },
    ] },
    callGraph: { schema: 'simplicio.call-graph/v1', edges: [
      { type: 'calls', source_file: 'py/svc.py', source_symbol: 'py/svc.py::run', target_file: 'py/svc.py', target_symbol: 'py/svc.py::validate', line: 12, resolution_status: 'resolved' },
      { type: 'calls', source_file: 'py/svc.py', source_symbol: 'py/svc.py::run', target_file: 'py/svc.py', target_symbol: 'py/svc.py::helper', line: 13, resolution_status: 'resolved' },
      { type: 'calls', source_file: 'py/svc.py', source_symbol: 'py/svc.py::run', target_file: 'py/svc.py', target_symbol: 'py/svc.py::run', line: 13, resolution_status: 'resolved' },
      { type: 'calls', source_file: 'py/svc.py', source_symbol: 'py/svc.py::run', target_file: 'x.py', target_symbol: 'x.py::gone', line: 13, resolution_status: 'resolved' },
      { type: 'calls', source_file: 'py/svc.py', source_symbol: 'py/svc.py::run', target_file: 'py/svc.py', target_symbol: 'py/svc.py::validate', line: 13, resolution_status: 'ambiguous', target_candidates: ['py/svc.py::validate', 'other.py::validate'] },
    ] },
  }
  const project = buildProject({ name: 'svc', files: [{ path: 'py/svc.py', content: svc, size: svc.length }], artifacts })

  it('labels methods with their class', () => {
    expect([...project.symbols.values()].map((symbol) => symbol.label)).toEqual(['TaskService', 'TaskService.__init__', 'TaskService.run', 'TaskService.validate', 'helper'])
    expect(project.symbols.get('py/svc.py::run')?.owner).toBe('TaskService')
    expect(project.symbols.get('py/svc.py::helper')?.owner).toBeUndefined()
  })

  it('keeps only resolved, non-recursive calls to known symbols and reports the ambiguous one', () => {
    expect(callsOf(project, 'py/svc.py::run').map((call) => call.to)).toEqual(['py/svc.py::validate', 'py/svc.py::helper'])
    expect(ambiguousOf(project, 'py/svc.py::run')).toEqual([{ line: 13, candidates: ['py/svc.py::validate', 'other.py::validate'] }])
  })

  it('reads errors raised by a method', () => {
    expect(describeSymbol(project, 'py/svc.py::validate')?.raises).toEqual(['ValueError'])
  })

  it('works without Mapper artifacts: architecture data only, no symbols', () => {
    const bare = buildProject({ name: 'bare', files: [{ path: 'a.py', content: 'import b\n', size: 9 }, { path: 'b.py', content: 'x = 1\n', size: 6 }] })
    expect(bare.mapper).toBeNull()
    expect(bare.symbols.size).toBe(0)
    expect(bare.entries).toEqual([])
    expect(bare.imports).toEqual([{ from: 'a.py', to: 'b.py' }])
  })

  it('reports why flows are unavailable when the artifacts are incomplete', () => {
    const partial = buildProject({ name: 'p', files: [], artifacts: { projectMap: {} } })
    expect(partial.issues.some((issue) => /symbol index/i.test(issue))).toBe(true)
  })
})
