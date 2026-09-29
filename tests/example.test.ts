import { describe, expect, it } from 'vitest'
import { EXAMPLE_ARTIFACTS, EXAMPLE_FILES } from '../src/example'
import { parseMapperArtifacts } from '../src/domain/mapper'

describe('bundled simplicio-loop example', () => {
  it('contains safe source text for every bundled file', () => {
    expect(EXAMPLE_FILES.length).toBeGreaterThan(15)
    expect(EXAMPLE_FILES.every((file) => file.path && file.content && file.size > 0)).toBe(true)
    expect(EXAMPLE_FILES.some((file) => file.content.includes('import '))).toBe(true)
    expect(EXAMPLE_FILES.map((file) => file.path)).toEqual(expect.arrayContaining(['pyproject.toml', 'simplicio_loop/cli.py', 'simplicio_loop/mcp_server.py']))
  })

  it('ships slim Mapper artifacts that match the bundled sources', () => {
    const { model, issues } = parseMapperArtifacts(EXAMPLE_ARTIFACTS)
    expect(issues).toEqual([])
    expect(model.symbols.length).toBeGreaterThan(30)
    const paths = new Set(EXAMPLE_FILES.map((file) => file.path))
    for (const symbol of model.symbols) expect(paths.has(symbol.file), symbol.id).toBe(true)
    for (const call of model.calls) expect(call.file === undefined || paths.has(call.file)).toBe(true)
  })

  it('does not leak machine paths or credentials', () => {
    const text = JSON.stringify(EXAMPLE_ARTIFACTS) + EXAMPLE_FILES.map((file) => file.content).join('\n')
    expect(text).not.toMatch(/\/Users\/|\/home\/|\/private\/|C:\\Users|sk-[A-Za-z0-9]{10}/)
  })
})
