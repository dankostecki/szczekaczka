// User settings, kept in this browser (localStorage).
import { FEED_KEYS, renamedKey } from './sources'

export type Theme = 'system' | 'light' | 'dark'

export interface Prefs {
  theme: Theme
  notify: boolean        // desktop notifications (permission survives reloads, so this is stored)
  keepAwake: boolean     // keep the screen on while the page is visible
  voiceURI: string       // '' = the best Polish voice (speech.ts)
  voiceURIEn: string     // '' = the best English voice, for news in English
  rate: number
  chime: boolean         // a soft sound before the voice starts on new headlines (chime.ts)
  maxPerRefresh: number  // 0: read every new headline; else at most this many per refresh, the rest summed up
  hiddenFeeds: string[]  // channels left off the list, and so not read aloud or notified either ("STOOQ:ŚWIAT")
  speakFeeds: string[]   // channels read aloud ("GPW:PRASA")
  notifyFeeds: string[]  // channels shown as notifications
  leadFeeds: string[]    // channels read with the lead after the title; the others: the title only
  knownFeeds: string[]   // channels that existed when these settings were saved
  originalFeeds: string[] // translated channels (FeedConfig.translate) shown in their own language, not in Polish
  watchlist: string      // ESPI: with a list, only these companies are read aloud / notified; empty, every report is read aloud (and none notified)
  v: number              // the version of the settings: older ones are brought up to date when loaded (PREFS_VERSION)
}
// 2: Seeking Alpha is read aloud and notified like any channel (for a short while it began switched off, and stayed so in the settings saved then)
export const PREFS_VERSION = 2
const SEEKING_ALPHA = 'SEEKINGALPHA:MARKET CURRENTS'
// Voice on/off is not stored: browsers allow speech only after a click on the page.

export const DEFAULT_PREFS: Prefs = {
  theme: 'system',
  notify: false,
  keepAwake: true,
  voiceURI: '',
  voiceURIEn: '',
  rate: 1,
  chime: true,
  maxPerRefresh: 0,
  hiddenFeeds: [],
  speakFeeds: FEED_KEYS,
  notifyFeeds: FEED_KEYS,
  // Titles only, but MacroNext's announcements: their "lead" is the figures, the companies
  leadFeeds: ['MACRONEXT:MAKRO', 'MACRONEXT:GIEŁDA'],
  knownFeeds: FEED_KEYS,
  originalFeeds: [],
  watchlist: '',
  v: PREFS_VERSION,
}

// The channels there were before settings remembered them (9 October 2026)
const KNOWN_BEFORE = ['ESPI:ESPI/EBI', 'GPW:KOMUNIKATY', 'GPW:PRASA', 'GPW:AKTUALNOŚCI', 'STOOQ:BIZNES', 'STOOQ:KRAJ',
  'STOOQ:ŚWIAT', 'PAP:BIZNES', 'PAP:NAUKA', 'PAP:POLITYKA']

export const PREFS_KEY = 'szczekaczka:prefs'

export function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY)
    if (!raw) return DEFAULT_PREFS
    const saved = JSON.parse(raw) as Partial<Prefs> & { readLead?: unknown; sayGpw?: unknown }
    // Settings that are gone: one switch for the lead (now per channel, titles only to start with),
    // and "GPW:" before GPW headlines (now always said)
    const old = 'readLead' in saved || 'sayGpw' in saved
    delete saved.readLead; delete saved.sayGpw
    // 3 was the default limit, and left every headline beyond the newest three only summed up (with its NOWE badge): now the default is to read all
    if (saved.maxPerRefresh === 3) delete saved.maxPerRefresh
    // A renamed channel keeps its settings ("ESPI:ESPI/EBI" is now "ESPI:BANKIER")
    const LISTS = ['hiddenFeeds', 'speakFeeds', 'notifyFeeds', 'leadFeeds', 'knownFeeds', 'originalFeeds'] as const
    const renamed = LISTS.some((k) => saved[k]?.some((key) => renamedKey(key) !== key))
    for (const k of LISTS) if (saved[k]) saved[k] = saved[k].map(renamedKey)
    const p = { ...DEFAULT_PREFS, ...saved } as Prefs
    // Channels that no longer exist (GPW calendar, GPW indices) are dropped, and the
    // cleaned settings are written back so nothing about them stays in the browser
    const existing = (list: string[]) => list.filter((k) => FEED_KEYS.includes(k))
    // A channel added since the settings were saved starts like for a new visitor: read aloud and
    // notified, with its lead if new visitors have it
    const known = saved.knownFeeds ?? KNOWN_BEFORE.map(renamedKey)
    const added = FEED_KEYS.filter((k) => !known.includes(k))
    // Settings of version 1 (or saved before there was one) get Seeking Alpha read aloud and notified, once
    const brought = (saved.v ?? 1) < 2 && FEED_KEYS.includes(SEEKING_ALPHA) ? [SEEKING_ALPHA] : []
    const cleaned: Prefs = {
      ...p, v: PREFS_VERSION, hiddenFeeds: existing(p.hiddenFeeds), originalFeeds: existing(p.originalFeeds), knownFeeds: FEED_KEYS,
      leadFeeds: [...existing(p.leadFeeds), ...added.filter((k) => DEFAULT_PREFS.leadFeeds.includes(k) && !p.leadFeeds.includes(k))],
      speakFeeds: [...existing(p.speakFeeds), ...[...added, ...brought].filter((k) => !p.speakFeeds.includes(k))],
      notifyFeeds: [...existing(p.notifyFeeds), ...[...added, ...brought].filter((k) => !p.notifyFeeds.includes(k))],
    }
    const changed = (['hiddenFeeds', 'speakFeeds', 'notifyFeeds', 'leadFeeds', 'originalFeeds'] as const).some((k) => cleaned[k].length !== p[k].length)
      || known.length !== FEED_KEYS.length || added.length > 0 || renamed || old || saved.v !== PREFS_VERSION
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

// "PKN, CD Projekt; KGHM" -> a test for whole words, any case. An empty list matches nothing, or everything with `allWhenEmpty`
export function watchMatcher(list: string, allWhenEmpty = false): (text: string) => boolean {
  const names = list.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean)
  if (names.length === 0) return () => allWhenEmpty
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+')
  const re = new RegExp(`(?<![\\p{L}\\p{N}])(?:${names.map(esc).join('|')})(?![\\p{L}\\p{N}])`, 'iu')
  return (text) => re.test(text)
}
