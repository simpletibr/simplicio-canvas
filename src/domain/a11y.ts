/** What the UI promises to assistive technology. `requiredRegions` are message keys: the label is translated. */
export const ACCESSIBILITY_CONTRACT = {
  reducedMotionMediaQuery: '(prefers-reduced-motion: reduce)',
  requiredRegions: ['nav.aria', 'side.aria', 'canvas.aria', 'canvas.minimap', 'details.aria', 'run.aria'],
  liveRegion: 'polite',
} as const
