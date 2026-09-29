import { describe, expect, it } from 'vitest'
import { LOCAL_POLICY, PUBLIC_DEMO_POLICY, policyFor } from '../src/domain/demo-policy'

describe('public demo safety policy', () => {
  it('is read-only and exposes only the bundled example and local trace replay', () => {
    expect(PUBLIC_DEMO_POLICY).toEqual({
      canImportFolder: false, canImportGitHub: false, canLoadLocalTrace: true, canEditSource: false,
      canSaveSource: false, canMoveNodes: false, canRunProcesses: false,
      canReadBundledExample: true,
    })
  })

  it('the local build adds imports and node dragging but still never edits, saves or runs anything', () => {
    expect(LOCAL_POLICY).toMatchObject({ canImportFolder: true, canImportGitHub: true, canMoveNodes: true, canEditSource: false, canSaveSource: false, canRunProcesses: false })
    expect(policyFor(true)).toBe(PUBLIC_DEMO_POLICY)
    expect(policyFor(false)).toBe(LOCAL_POLICY)
  })
})
