import { describe, expect, it } from 'vitest'
import { pythonImports } from '../src/domain/imports'

const f = (path: string, content = '') => ({ path, content })
const edges = (files: Array<{ path: string; content: string }>) => pythonImports(files).map((edge) => `${edge.from} > ${edge.to}`).sort()

describe('Python import resolution', () => {
  const layout = [f('pkg/__init__.py'), f('pkg/mod1.py'), f('pkg/mod2.py'), f('pkg/sub/__init__.py'), f('pkg/sub/leaf.py'), f('pkg/sub/deep.py')]

  it('resolves `from package import module` to the submodule, not the package', () => {
    expect(edges([...layout, f('app.py', 'from pkg import mod1, mod2 as m2\n')])).toEqual(['app.py > pkg/mod1.py', 'app.py > pkg/mod2.py'])
  })

  it('falls back to the package when the imported name is defined in its __init__', () => {
    expect(edges([...layout, f('app.py', 'from pkg import Thing\n')])).toEqual(['app.py > pkg/__init__.py'])
  })

  it('resolves `from module import name` and dotted `import a.b.c`', () => {
    expect(edges([...layout, f('a.py', 'from pkg.sub.leaf import run\n'), f('b.py', 'import pkg.sub.deep\nimport json, os.path\n')])).toEqual(['a.py > pkg/sub/leaf.py', 'b.py > pkg/sub/deep.py'])
  })

  it('resolves relative imports from the importing file’s package', () => {
    const files = [...layout, f('pkg/sub/leaf.py', 'from . import deep\nfrom .deep import x\nfrom .. import mod1\nfrom ..mod2 import y\n')]
    expect(edges(files)).toEqual(['pkg/sub/leaf.py > pkg/mod1.py', 'pkg/sub/leaf.py > pkg/mod2.py', 'pkg/sub/leaf.py > pkg/sub/deep.py'])
  })

  it('reads parenthesised multi-line imports and ignores comments and docstrings', () => {
    const source = '"""Docs.\nimport pkg.mod2\n"""\nfrom pkg import (\n    mod1,  # first\n    mod2,\n)\n# import pkg.sub.leaf\n'
    expect(edges([...layout, f('app.py', source)])).toEqual(['app.py > pkg/mod1.py', 'app.py > pkg/mod2.py'])
  })

  it('finds sibling scripts, src layouts and nested package roots, but not arbitrary same-named files', () => {
    const files = [f('tool/run.py', 'import helper\nimport pkg.core\nimport utils\n'), f('tool/helper.py'), f('src/pkg/core.py'), f('other/deep/utils.py'), f('packages/x/pkg/core.py')]
    expect(edges(files)).toEqual(['tool/run.py > src/pkg/core.py', 'tool/run.py > tool/helper.py'])
  })

  it('never links a file to itself and lists each edge once', () => {
    expect(edges([f('a.py', 'import a\nfrom b import x\nfrom b import y\n'), f('b.py')])).toEqual(['a.py > b.py'])
  })

  it('skips non-Python files', () => {
    expect(edges([f('a.ts', 'import b from "./b"\n'), f('b.ts')])).toEqual([])
  })
})
