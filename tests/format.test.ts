import { describe, expect, it } from 'vitest'
import { formatCost } from '../src/ui/format'

describe('formatCost', () => {
  it('keeps enough digits for sub-cent LLM costs and trims trailing zeros', () => {
    expect(formatCost(0.001884)).toBe('$0.001884')
    expect(formatCost(0.0125)).toBe('$0.0125')
    expect(formatCost(0.5)).toBe('$0.5')
    expect(formatCost(12.3456)).toBe('$12.35')
    expect(formatCost(0)).toBe('$0')
    expect(formatCost(Number.NaN)).toBe('')
  })
})
