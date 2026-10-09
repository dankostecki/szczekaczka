// User settings, kept in this browser (localStorage).
import { FEEDS, FEED_KEYS, feedKey } from './sources'

export type Theme = 'system' | 'light' | 'dark'

export interface Prefs {
  theme: Theme
  notify: boolean        // desktop notifications (permission survives reloads, so this is stored)
  keepAwake: boolean     // keep the screen on while the page is visible
  voiceURI: string       // '' = the best Polish voice (speech.ts)
  voiceURIEn: string     // '' = the best English voice, for news in English
  rate: number
  maxPerRefresh: number  // read at most this many headlines per refresh, sum up the rest
  readLead: boolean      // read the lead after the title
  sayGpw: boolean        // say "GPW:" before GPW headlines
  hiddenFeeds: string[]  // channels left off the list, and so not read aloud or notified either ("STOOQ:ŚWIAT")
  speakFeeds: string[]   // channels read aloud ("GPW:PRASA")
  notifyFeeds: string[]  // channels shown as notifications
  knownFeeds: string[]   // channels that existed when these settings were saved
  watchlist: string      // ESPI: only these companies are read aloud / notified
}
// Voice on/off is not stored: browsers allow speech only after a click on the page.

export const DEFAULT_PREFS: Prefs = {
  theme: 'system',
  notify: false,
  keepAwake: true,
  voiceURI: '',
  voiceURIEn: '',
  rate: 1,
  maxPerRefresh: 3,
  readLead: true,
  sayGpw: true,
  hiddenFeeds: [],
  speakFeeds: FEED_KEYS,
  notifyFeeds: FEED_KEYS,
  knownFeeds: FEED_KEYS,
  watchlist: '',
}

// Settings saved before `knownFeeds` was added knew every channel but MarketWatch
const KNOWN_BEFORE = FEEDS.filter((f) => f.source !== 'MARKETWATCH').map((f) => feedKey(f.source, f.label))

export const PREFS_KEY = 'szczekaczka:prefs'

export function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY)
    if (!raw) return DEFAULT_PREFS
    const saved = JSON.parse(raw) as Partial<Prefs>
    const p = { ...DEFAULT_PREFS, ...saved } as Prefs
    // Channels that no longer exist (GPW calendar, GPW indices) are dropped, and the
    // cleaned settings are written back so nothing about them stays in the browser
    const existing = (list: string[]) => list.filter((k) => FEED_KEYS.includes(k))
    // A channel added since the settings were saved starts like for a new visitor: read aloud and notified
    const known = saved.knownFeeds ?? KNOWN_BEFORE
    const added = FEED_KEYS.filter((k) => !known.includes(k))
    const cleaned: Prefs = {
      ...p, hiddenFeeds: existing(p.hiddenFeeds), knownFeeds: FEED_KEYS,
      speakFeeds: [...existing(p.speakFeeds), ...added.filter((k) => !p.speakFeeds.includes(k))],
      notifyFeeds: [...existing(p.notifyFeeds), ...added.filter((k) => !p.notifyFeeds.includes(k))],
    }
    const changed = (['hiddenFeeds', 'speakFeeds', 'notifyFeeds'] as const).some((k) => cleaned[k].length !== p[k].length)
      || known.length !== FEED_KEYS.length || added.length > 0
    if (changed) savePrefs(cleaned)
    return cleaned
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
