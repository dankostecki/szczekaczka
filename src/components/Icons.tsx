import { BASE_PATH } from '@/lib/site'

// Inline SVG icons (stroke = currentColor), 24x24 grid
type P = { size?: number; className?: string }

function Svg({ size = 18, className, children }: P & { children: React.ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      {children}
    </svg>
  )
}

// The logo, a barking duck (drawn in src/lib/duck.ts)
export const Logo = () => <img src={`${BASE_PATH}/logo.png`} alt="" width={34} height={34} />
// on: with sound waves; off: crossed out, or just the speaker when `quiet`
export const Speaker = ({ on, quiet = false, ...p }: P & { on: boolean; quiet?: boolean }) => (
  <Svg {...p}>
    <path d="M11 5L6 9H2v6h4l5 4V5z" />
    {on ? <><path d="M15.5 8.5a5 5 0 010 7" /><path d="M19 5a10 10 0 010 14" /></> : !quiet && <path d="M22 9l-6 6M16 9l6 6" />}
  </Svg>
)
export const Bell = ({ on, ...p }: P & { on: boolean }) => (
  <Svg {...p}><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 01-3.4 0" />{!on && <path d="M2 2l20 20" />}</Svg>
)
export const Refresh = (p: P) => <Svg {...p}><path d="M21 12a9 9 0 11-3-6.7L21 8" /><path d="M21 3v5h-5" /></Svg>
export const Sun = (p: P) => (
  <Svg {...p}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></Svg>
)
export const Moon = (p: P) => <Svg {...p}><path d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z" /></Svg>
export const Gear = (p: P) => (
  <Svg {...p}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z" /></Svg>
)
export const Star = ({ filled, ...p }: P & { filled: boolean }) => (
  <svg width={p.size ?? 18} height={p.size ?? 18} viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor"
    strokeWidth="2" strokeLinejoin="round" aria-hidden className={p.className}>
    <path d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5L2.5 9.4l6.6-.9z" />
  </svg>
)
export const Search = (p: P) => <Svg {...p}><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></Svg>
export const Eye = (p: P) => (
  <Svg {...p}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></Svg>
)
export const Close = (p: P) => <Svg {...p}><path d="M18 6L6 18M6 6l12 12" /></Svg>
export const Play = (p: P) => <Svg {...p}><path d="M11 5L6 9H2v6h4l5 4V5z" /><path d="M15.5 8.5a5 5 0 010 7" /></Svg>
