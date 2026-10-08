// User settings, kept in this browser (localStorage).
import { FEED_KEYS, QUIET_BY_DEFAULT, REFRESH_OPTIONS } from './sources'

export type Theme = 'system' | 'light' | 'dark'

export interface Prefs {
  theme: Theme
  auto: boolean          // refresh by itself
  refreshMin: number     // every this many minutes (REFRESH_OPTIONS)
  notify: boolean        // desktop notifications (permission survives reloads, so this is stored)
  keepAwake: boolean     // keep the screen on while the page is visible
  voiceURI: string       // '' = first Polish Google voice
  rate: number
  maxPerRefresh: number  // read at most this many headlines per refresh, sum up the rest
  readLead: boolean      // read the lead after the title
  sayGpw: boolean        // say "GPW:" before GPW headlines
  speakFeeds: string[]   // channels read aloud ("GPW:INDEKSY")
  notifyFeeds: string[]  // channels shown as notifications
  watchlist: string      // ESPI: only these companies are read aloud / notified
}
// Voice on/off is not stored: browsers allow speech only after a click on the page.

const LOUD = FEED_KEYS.filter((k) => !QUIET_BY_DEFAULT.includes(k))

export const DEFAULT_PREFS: Prefs = {
  theme: 'system',
  auto: true,
  refreshMin: 1,
  notify: false,
  keepAwake: true,
  voiceURI: '',
  rate: 1,
  maxPerRefresh: 3,
  readLead: true,
  sayGpw: true,
  speakFeeds: LOUD,
  notifyFeeds: LOUD,
  watchlist: '',
}

export const PREFS_KEY = 'szczekaczka:prefs'

export function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY)
    if (!raw) return DEFAULT_PREFS
    const p = { ...DEFAULT_PREFS, ...JSON.parse(raw) } as Prefs
    p.speakFeeds = p.speakFeeds.filter((k) => FEED_KEYS.includes(k))
    p.notifyFeeds = p.notifyFeeds.filter((k) => FEED_KEYS.includes(k))
    if (!REFRESH_OPTIONS.includes(p.refreshMin)) p.refreshMin = DEFAULT_PREFS.refreshMin
    return p
  } catch {
    return DEFAULT_PREFS
  }
}

export function savePrefs(p: Prefs) {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(p)) } catch {}
}

// Small helpers for the id lists (read, saved)
export function loadJson<T>(key: string, fallback: T): T {
  try { const raw = localStorage.getItem(key); return raw ? (JSON.parse(raw) as T) : fallback } catch { return fallback }
}
export function saveJson(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch {}
}

// "PKN, CD Projekt; KGHM" -> a test for whole words, any case
export function watchMatcher(list: string): (text: string) => boolean {
  const names = list.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean)
  if (names.length === 0) return () => false
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+')
  const re = new RegExp(`(?<![\\p{L}\\p{N}])(?:${names.map(esc).join('|')})(?![\\p{L}\\p{N}])`, 'iu')
  return (text) => re.test(text)
}
