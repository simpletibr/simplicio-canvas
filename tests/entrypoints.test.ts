import { describe, expect, it } from 'vitest'
import { detectEntryPoints } from '../src/domain/entrypoints'
import type { MapperSymbol } from '../src/domain/mapper'

const sym = (file: string, name: string, line: number, language = 'python'): MapperSymbol => ({ id: `${file}::${name}`, name, kind: 'function', file, line, language })
const file = (path: string, content: string) => ({ path, content, size: content.length })

describe('entry point detection', () => {
  it('reads [project.scripts] and resolves module:function to a symbol, also with a src layout', () => {
    const symbols = [sym('src/pkg/cli.py', 'main', 4), sym('src/pkg/cli.py', 'other', 20)]
    const files = [file('pyproject.toml', '[project]\nname = "pkg"\n\n[project.scripts]\ntool = "pkg.cli:main"\n"tool-two" = "pkg.cli:other"\nmissing = "pkg.nowhere:run"\n'), file('src/pkg/cli.py', 'def main():\n    pass\n')]
    const { entries } = detectEntryPoints({ files, symbols })
    expect(entries.map((entry) => [entry.kind, entry.name, entry.symbol])).toEqual([['console_script', 'tool', 'src/pkg/cli.py::main'], ['console_script', 'tool-two', 'src/pkg/cli.py::other']])
    expect(entries[0].evidence).toMatch(/pyproject\.toml/)
  })

  it('reads Poetry scripts and survives a broken pyproject.toml', () => {
    const symbols = [sym('app/run.py', 'go', 3)]
    const poetry = detectEntryPoints({ files: [file('pyproject.toml', '[tool.poetry.scripts]\nrun = "app.run:go"\n')], symbols })
    expect(poetry.entries.map((entry) => entry.name)).toEqual(['run'])
    const broken = detectEntryPoints({ files: [file('pyproject.toml', '[project.scripts\nnope')], symbols })
    expect(broken.entries).toEqual([])
    expect(broken.issues[0]).toMatch(/pyproject\.toml/)
  })

  it('finds click and typer commands with their explicit or derived names', () => {
    const content = ['import click', '', '@click.group()', 'def cli():', '    pass', '', '@cli.command("serve-it")', 'def serve(port):', '    pass', '', '@app.command()', 'def build_all():', '    pass', ''].join('\n')
    const symbols = [sym('cli.py', 'cli', 4), sym('cli.py', 'serve', 8), sym('cli.py', 'build_all', 12)]
    const { entries } = detectEntryPoints({ files: [file('cli.py', content)], symbols })
    expect(entries.map((entry) => [entry.kind, entry.name, entry.symbol])).toEqual([['cli_command', 'cli', 'cli.py::cli'], ['cli_command', 'serve-it', 'cli.py::serve'], ['cli_command', 'build-all', 'cli.py::build_all']])
  })

  it('finds argparse sub-commands that set a handler with set_defaults', () => {
    const content = ['def build(sub):', '    run = sub.add_parser("run", help="x")', '    run.set_defaults(func=cmd_run)', '    sub.add_parser("noop")', '', 'def cmd_run(args):', '    pass'].join('\n')
    const symbols = [sym('cli.py', 'build', 1), sym('cli.py', 'cmd_run', 6)]
    expect(detectEntryPoints({ files: [file('cli.py', content)], symbols }).entries.map((entry) => [entry.kind, entry.name, entry.symbol])).toEqual([['cli_command', 'run', 'cli.py::cmd_run']])
  })

  it('finds MCP tools registered with a decorator, with an explicit name, and with a named handler in TypeScript', () => {
    const py = ['@mcp.tool(name="lookup")', 'def find_thing(q):', '    pass', '', '@mcp.tool', '@other', 'async def plain(q):', '    pass'].join('\n')
    const ts = ['server.tool("echo", { text: z.string() }, handleEcho)', 'server.registerTool("inline", {}, async () => 1)', 'function handleEcho() {}'].join('\n')
    const symbols = [sym('srv.py', 'find_thing', 2), sym('srv.py', 'plain', 7), sym('srv.ts', 'handleEcho', 3, 'typescript')]
    const { entries } = detectEntryPoints({ files: [file('srv.py', py), file('srv.ts', ts)], symbols })
    expect(entries.map((entry) => [entry.kind, entry.name, entry.symbol])).toEqual([['mcp_tool', 'lookup', 'srv.py::find_thing'], ['mcp_tool', 'plain', 'srv.py::plain'], ['mcp_tool', 'echo', 'srv.ts::handleEcho']])
  })

  it('reads package.json bin entries that point at a file with a main function', () => {
    const symbols = [sym('bin/cli.js', 'main', 2, 'javascript')]
    const { entries } = detectEntryPoints({ files: [file('package.json', JSON.stringify({ bin: { mytool: './bin/cli.js' } })), file('bin/cli.js', 'function main() {}\n')], symbols })
    expect(entries.map((entry) => [entry.kind, entry.name, entry.symbol])).toEqual([['console_script', 'mytool', 'bin/cli.js::main']])
    const stringBin = detectEntryPoints({ files: [file('package.json', JSON.stringify({ name: 'solo', bin: './bin/cli.js' })), file('bin/cli.js', '')], symbols })
    expect(stringBin.entries.map((entry) => entry.name)).toEqual(['solo'])
  })

  it('lists main functions of runnable files and ignores tests', () => {
    const symbols = [sym('tool.py', 'main', 3), sym('lib.py', 'main', 3), sym('tests/test_x.py', 'main', 1), sym('cmd/app/main.go', 'main', 5, 'go')]
    const files = [file('tool.py', 'def main():\n    pass\n\nif __name__ == "__main__":\n    main()\n'), file('lib.py', 'def main():\n    pass\n'), file('tests/test_x.py', 'def main():\n    pass\nif __name__ == "__main__":\n    main()\n'), file('cmd/app/main.go', 'package main\nfunc main() {}\n')]
    const { entries } = detectEntryPoints({ files, symbols, entryFiles: ['lib.py'] })
    expect(entries.map((entry) => `${entry.kind}:${entry.file}`)).toEqual(['main:cmd/app/main.go', 'main:lib.py', 'main:tool.py'])
  })

  it('does not list the same symbol twice: a console script wins over a plain main', () => {
    const symbols = [sym('a/cli.py', 'main', 3)]
    const files = [file('pyproject.toml', '[project.scripts]\nthing = "a.cli:main"\n'), file('a/cli.py', 'def main():\n    pass\nif __name__ == "__main__":\n    main()\n')]
    expect(detectEntryPoints({ files, symbols }).entries.map((entry) => `${entry.kind}:${entry.name}`)).toEqual(['console_script:thing'])
  })
})

