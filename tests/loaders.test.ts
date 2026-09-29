// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { loadTraceText, readFolder } from '../src/ui/loaders'

/** A File as `<input webkitdirectory>` hands it over: the relative path includes the chosen folder. */
const picked = (relative: string, content: string) => Object.assign(new File([content], relative.split('/').pop()!), { webkitRelativePath: relative })
const list = (...files: File[]) => Object.assign([...files], { item: (index: number) => files[index] ?? null }) as unknown as FileList

describe('readFolder', () => {
  it('reads text files, skips dependencies, binaries and secrets, and takes Mapper artifacts from .simplicio-loop', async () => {
    const folder = await readFolder(list(
      picked('proj/src/app.py', 'def main():\n    pass\n'),
      picked('proj/README.md', '# proj'),
      picked('proj/node_modules/x/index.js', 'x'),
      picked('proj/.git/config', 'x'),
      picked('proj/.env', 'SECRET=1'),
      picked('proj/logo.png', 'binary'),
      picked('proj/.simplicio-loop/symbol-index.json', JSON.stringify({ schema: 'simplicio.symbol-index/v1', root: '/Users/me/private', symbols: [{ name: 'main', qualified_name: 'src/app.py::main', kind: 'function', defined_in: 'src/app.py', line: 1 }] })),
      picked('proj/.simplicio-loop/call-graph.json', '{broken'),
      picked('proj/.simplicio-loop/cache/cache.db', 'x'),
    ))
    expect(folder.name).toBe('proj')
    expect(folder.files.map((file) => file.path).sort()).toEqual(['README.md', 'src/app.py'])
    expect(Object.keys(folder.artifacts ?? {})).toEqual(['symbolIndex'])
    expect(JSON.stringify(folder.artifacts)).not.toContain('/Users/me')
  })

  it('applies the file count and size limits', async () => {
    const many = await readFolder(list(picked('p/a.txt', 'a'), picked('p/b.txt', 'b'), picked('p/c.txt', 'c')), { maxFiles: 2, maxFileBytes: 10 })
    expect(many.files).toHaveLength(2)
    const big = await readFolder(list(picked('p/big.txt', 'x'.repeat(50)), picked('p/small.txt', 'x')), { maxFiles: 10, maxFileBytes: 10 })
    expect(big.files.map((file) => file.path)).toEqual(['small.txt'])
  })

  it('handles an empty selection', async () => {
    expect(await readFolder(list())).toEqual({ name: 'folder', files: [], artifacts: undefined })
  })
})

describe('loadTraceText', () => {
  it('reports an empty file as an error', () => {
    expect(loadTraceText('   ').trace).toBeNull()
    expect(loadTraceText('   ').issues[0].message).toMatch(/empty/)
  })
})
