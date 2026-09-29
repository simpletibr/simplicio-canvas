import { describe, expect, it } from 'vitest'
import { correlateRuntimeTrace, importRuntimeTrace, runtimeEdges, validateRuntimeTrace } from '../src/domain/runtime-trace'
import { buildArchitectureGraph } from '../src/domain/architecture'

describe('runtime trace contract', () => {
  it('imports redacted spans and creates distinct runtime edges', () => {
    const value = { schema: 'simplicio-runtime-trace/v1', importedAt: '2025-01-01T00:00:00Z', redacted: true, spans: [{ traceId: 't', spanId: 's', from: 'a', to: 'b', startedAt: '2025-01-01T00:00:00Z', durationMs: 4, count: 2, environment: 'test', attributes: { userEmail: 'never' } }] }
    expect(validateRuntimeTrace(value)).toContain('spans[0] contains forbidden attribute: userEmail')
    const sanitized = { ...value, spans: [{ ...value.spans[0], attributes: undefined }] }
    const trace = importRuntimeTrace(sanitized)
    expect(runtimeEdges(trace)[0].id).toBe('runtime:t:s')
    const correlation = correlateRuntimeTrace([{ from: 'a', to: 'b' }, { from: 'b', to: 'c' }], trace)
    expect(correlation.matched).toEqual(['a\u0000b']); expect(correlation.unusedStatic).toEqual(['b\u0000c']); expect(correlation.unexpected).toEqual([]); expect(correlation.confidence).toBe(1)
  })
})
