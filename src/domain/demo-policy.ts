/** What the app may do. The public demo is read-only and only shows its bundled example and replays. */
export interface AppPolicy {
  canImportFolder: boolean
  canImportGitHub: boolean
  canLoadLocalTrace: boolean
  canEditSource: boolean
  canSaveSource: boolean
  canMoveNodes: boolean
  canRunProcesses: boolean
  canReadBundledExample: boolean
}

export const PUBLIC_DEMO_POLICY: AppPolicy = {
  canImportFolder: false,
  canImportGitHub: false,
  // A trace file is parsed in the browser and never leaves it, so the demo can replay files the visitor picks.
  canLoadLocalTrace: true,
  canEditSource: false,
  canSaveSource: false,
  canMoveNodes: false,
  canRunProcesses: false,
  canReadBundledExample: true,
}

/** The local build: imports and node dragging are on. It still never edits, saves or runs anything. */
export const LOCAL_POLICY: AppPolicy = { ...PUBLIC_DEMO_POLICY, canImportFolder: true, canImportGitHub: true, canMoveNodes: true }

export const policyFor = (demo: boolean): AppPolicy => (demo ? PUBLIC_DEMO_POLICY : LOCAL_POLICY)
