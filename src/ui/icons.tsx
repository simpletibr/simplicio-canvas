const PATHS = {
  play: 'M8 5v14l11-7z',
  pause: 'M6 5h4v14H6zM14 5h4v14h-4z',
  next: 'M6 5l8 7-8 7V5zm10 0h2v14h-2z',
  prev: 'M18 5l-8 7 8 7V5zM6 5h2v14H6z',
  restart: 'M12 5V2L7 6.5 12 11V8a5 5 0 1 1-5 5H5a7 7 0 1 0 7-8z',
  folder: 'M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  upload: 'M12 3l5 5h-3v6h-4V8H7zM5 18h14v2H5z',
  download: 'M12 15l-5-5h3V4h4v6h3zM5 18h14v2H5z',
  copy: 'M8 4h10a2 2 0 0 1 2 2v12h-2V6H8zM4 8h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2z',
  diagram: 'M3 3h7v5H3zM14 3h7v5h-7zM8.5 16h7v5h-7zM6.5 8v3h11V8M12 11v5',
  close: 'M6 6l12 12M18 6L6 18',
} as const

export type IconName = keyof typeof PATHS

export function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  const stroke = name === 'diagram' || name === 'close'
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" focusable="false" fill={stroke ? 'none' : 'currentColor'} stroke={stroke ? 'currentColor' : 'none'} strokeWidth={stroke ? 2 : 0} strokeLinecap="round" strokeLinejoin="round">
      <path d={PATHS[name]} />
    </svg>
  )
}
