import { formatDuration, formatTokens } from '../domain/flow-graph'

export { formatDuration, formatTokens }

export function formatCost(usd: number): string {
  if (!Number.isFinite(usd)) return ''
  const digits = usd >= 1 ? 2 : usd >= 0.01 ? 4 : 6
  return `$${usd.toFixed(digits).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '')}`
}

export const asNumber = (value: unknown): number | undefined => (typeof value === 'number' && Number.isFinite(value) ? value : undefined)
export const asString = (value: unknown): string | undefined => (typeof value === 'string' && value ? value : undefined)
