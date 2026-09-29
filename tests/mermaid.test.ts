import { describe, expect, it } from 'vitest'
import { toMermaid } from '../src/domain/mermaid'
import type { FlowGraph } from '../src/domain/flow-graph'

const small: FlowGraph = {
  id: 'demo', title: 'Demo flow', kind: 'entry', direction: 'LR',
  nodes: [
    { id: 'entry:tiny', label: 'tiny', kind: 'entry', subtitle: 'cli.py:7' },
    { id: 'tinycli/core.py::run_task', label: 'run_task', kind: 'function', subtitle: 'core.py:5' },
    { id: 'ext', label: 'argparse "quoted" <b>', kind: 'external' },
    { id: 'verify', label: 'verify', kind: 'verify', status: 'error' },
  ],
  edges: [
    { id: 'e1', from: 'entry:tiny', to: 'tinycli/core.py::run_task', kind: 'calls', label: 'line 13' },
    { id: 'e2', from: 'tinycli/core.py::run_task', to: 'ext', kind: 'calls' },
    { id: 'e3', from: 'ext', to: 'verify', kind: 'contains', dashed: true },
  ],
}

describe('Mermaid export', () => {
  it('renders a small graph as flowchart text (snapshot)', () => {
    expect(toMermaid(small)).toMatchInlineSnapshot(`
      "flowchart LR
        %% Demo flow
        n1(["tiny<br/>cli.py:7"])
        n2["run_task<br/>core.py:5"]
        n3{{"argparse #quot;quoted#quot; #lt;b#gt;"}}
        n4{"verify"}
        n1 -->|"line 13"| n2
        n2 --> n3
        n3 -.-> n4
        classDef entry fill:#132a13,stroke:#bbff3c,color:#eaffc2;
        classDef function fill:#0f2a1f,stroke:#67e8a5,color:#dafbe9;
        classDef external fill:#1b2430,stroke:#8b9aab,color:#d5dde6,stroke-dasharray:4 3;
        classDef verify fill:#2a1f3d,stroke:#c084fc,color:#eddcff;
        classDef status_error stroke:#ff5d73,stroke-width:3px;
        class n1 entry;
        class n2 function;
        class n3 external;
        class n4 verify;
        class n4 status_error;
      "
    `)
  })

  it('never puts raw node ids into the output: they are not safe Mermaid identifiers', () => {
    const text = toMermaid(small)
    expect(text).not.toContain('tinycli/core.py::run_task')
    expect(text).not.toContain('entry:tiny')
    expect(text.match(/^\s+n\d+[\[({>]/gm)).toHaveLength(4)
  })

  it('is deterministic', () => { expect(toMermaid(small)).toBe(toMermaid(structuredClone(small))) })

  it('nests expanded groups as subgraphs and shows collapsed groups as one node with a file count', () => {
    const graph: FlowGraph = {
      id: 'arch', title: 'Architecture', kind: 'architecture', direction: 'LR',
      nodes: [
        { id: 'g:src', label: 'src', kind: 'group', collapsed: false, count: 3 },
        { id: 'g:src/domain', label: 'domain', kind: 'group', collapsed: false, parent: 'g:src', count: 2 },
        { id: 'f:a', label: 'a.ts', kind: 'file', parent: 'g:src/domain' },
        { id: 'f:b', label: 'b.ts', kind: 'file', parent: 'g:src/domain' },
        { id: 'f:main', label: 'main.ts', kind: 'file', parent: 'g:src' },
        { id: 'g:tests', label: 'tests', kind: 'group', collapsed: true, count: 12 },
      ],
      edges: [
        { id: '1', from: 'f:main', to: 'f:a', kind: 'imports' },
        { id: '2', from: 'f:main', to: 'g:tests', kind: 'imports', count: 3 },
      ],
    }
    const text = toMermaid(graph)
    expect(text).toContain('subgraph g1["src"]')
    expect(text).toContain('subgraph g2["domain"]')
    expect(text.indexOf('subgraph g2')).toBeGreaterThan(text.indexOf('subgraph g1'))
    expect(text).toContain('["tests/ (12 files)"]')
    expect(text).toContain('-->|"×3"|')
    expect(text.split('\n').filter((line) => line.trim() === 'end')).toHaveLength(2)
  })

  it('supports top-to-bottom graphs and empty graphs', () => {
    expect(toMermaid({ ...small, direction: 'TB' }).startsWith('flowchart TB')).toBe(true)
    expect(toMermaid({ id: 'x', title: 'Nothing', kind: 'entry', direction: 'LR', nodes: [], edges: [] })).toContain('flowchart LR')
  })

  it('escapes characters that would break the syntax and truncates very long labels', () => {
    const text = toMermaid({ id: 'x', title: 't', kind: 'entry', direction: 'LR', nodes: [{ id: 'a', label: 'weird # `tick` | pipe\nnewline', kind: 'function' }, { id: 'b', label: 'x'.repeat(200), kind: 'function' }], edges: [{ id: 'e', from: 'a', to: 'b', kind: 'calls', label: 'a|b' }] })
    expect(text).toContain('#35;')
    expect(text).not.toContain('`')
    expect(text).toContain('<br/>')
    expect(text).toContain('#124;')
    expect(text).toMatch(/x{40,}…/)
  })

  it('skips edges whose endpoints are missing and marks unknown or running steps', () => {
    const text = toMermaid({ id: 'x', title: 't', kind: 'simulation', direction: 'LR', nodes: [{ id: 'a', label: 'a', kind: 'step', status: 'unknown' }, { id: 'b', label: 'b', kind: 'llm_call', status: 'running' }], edges: [{ id: 'e', from: 'a', to: 'missing', kind: 'next' }, { id: 'f', from: 'a', to: 'b', kind: 'next' }] })
    expect(text.match(/-->/g)).toHaveLength(1)
    expect(text).toContain('class n1 status_unknown;')
    expect(text).toContain('class n2 status_running;')
  })
})
