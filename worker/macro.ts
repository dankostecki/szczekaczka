// MacroNext's calendar: today's and tomorrow's pages are read at 00:01 and 06:30 Polish time,
// and each release is announced 10 minutes before it. Called by the poller like a feed check.
import { dayGroups, groupTitle, parseDay, FETCH_TIMES, LEAD_MINUTES, type MacroGroup } from '../src/lib/macronext'
import { decodeBody, warsawDate, warsawToUtc, type NewsItem } from '../src/lib/parse'
import { feedKey, type FeedConfig } from '../src/lib/sources'
import { HEADERS, SHOW_ERROR_AFTER, TIMEOUT_S, pageInfo, retain, type CheckResult, type FeedState } from './feeds'

// Raise this when reading the calendar changes: it is then read again at once, not at the next time above
export const MACRO_VERSION = 3 // 2: releases without a time, announced in the morning; 3: speeches named in the title
const RETRY_MINUTES = [1, 2, 4, 8, 15] // after failed reads in a row
const LEAD_MS = LEAD_MINUTES * 60_000
const LATE_MS = 60_000 // less than this before the release, the announcement is not made
const DAY_MS = 86_400_000

// The next reading time after `t`
export function nextFetch(t: number): number {
  const { y, m, d } = warsawDate(t)
  for (let k = 0; k < 3; k++) for (const [h, mi] of FETCH_TIMES) {
    const at = warsawToUtc(y, m, d + k, h, mi)
    if (at > t) return at
  }
  return t + DAY_MS
}

const fetchDue = (s: FeedState | undefined): number => {
  if (!s || s.parser !== MACRO_VERSION) return 0
  const failures = s.failures ?? 0
  return failures ? s.checkedAt + RETRY_MINUTES[Math.min(failures, RETRY_MINUTES.length) - 1] * 60_000 : nextFetch(s.checkedAt)
}

const dayKey = ({ y, m, d }: { y: number; m: number; d: number }) => `${y}-${m}-${d}`

// When a group is announced, and after when it no longer is: 10 minutes before the release, but
// not with under a minute left; the day's undated releases from the morning until the day ends
const announceAt = (g: MacroGroup) => (g.allDay ? g.at : g.at - LEAD_MS)
function lastAt(g: MacroGroup): number {
  if (!g.allDay) return g.at - LATE_MS
  const [y, m, d] = g.day.split('-').map(Number)
  return warsawToUtc(y, m, d + 1, 0, 0)
}

// When the poller should next call checkMacro: a reading, or an announcement
export function macroDueAt(s: FeedState | undefined): number {
  let due = fetchDue(s)
  for (const g of s?.calendar ?? []) if (!g.done) due = Math.min(due, announceAt(g))
  return due
}
const clock = (t: number) => new Date(t).toLocaleTimeString('pl-PL', { timeZone: 'Europe/Warsaw', hour: '2-digit', minute: '2-digit' })

// One day's releases, or why they could not be read
async function readDay(base: string, feed: FeedConfig, day: { y: number; m: number; d: number }): Promise<MacroGroup[] | string> {
  const url = `${base}${dayKey(day)}`
  let res: Response
  try {
    res = await fetch(url, { headers: { ...HEADERS, Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8' }, signal: AbortSignal.timeout(TIMEOUT_S * 1000) })
  } catch (e) {
    return (e as Error)?.name === 'TimeoutError' ? `źródło nie odpowiedziało w ${TIMEOUT_S} s` : 'brak połączenia ze źródłem'
  }
  if (!res.ok) return `źródło zwróciło błąd HTTP ${res.status}`
  const page = decodeBody(await res.arrayBuffer(), res.headers.get('content-type'))
  const rows = parseDay(page, day.y, day.m, day.d)
  if (!rows) return `strona bez kalendarza na ${day.d}.${day.m}: ${pageInfo(page, res, url)}`
  return dayGroups(rows, feedKey(feed.source, feed.label), day.y, day.m, day.d)
}

export async function checkMacro(feed: FeedConfig, prev: FeedState | undefined, base = feed.url, now = Date.now()): Promise<CheckResult> {
  const old: FeedState = prev ?? { items: [], error: null, checkedAt: 0 }
  const state: FeedState = { ...old, calendar: (old.calendar ?? []).map((g) => ({ ...g })) }
  let problem: string | undefined, log: string | undefined, dirty = false

  if (now >= fetchDue(prev)) {
    dirty = true
    const today = warsawDate(now)
    const days = [today, warsawDate(warsawToUtc(today.y, today.m, today.d + 1, 12))]
    const read = await Promise.all(days.map((day) => readDay(base, feed, day)))
    const failed = read.find((r): r is string => typeof r === 'string')
    state.checkedAt = now
    state.parser = MACRO_VERSION
    if (failed) {
      state.failures = (old.failures ?? 0) + 1
      if (state.failures >= SHOW_ERROR_AFTER) state.error = failed
      problem = failed
    } else {
      // The days read replace what was known about them; an announcement made stays made
      const made = new Set(state.calendar!.filter((g) => g.done).map((g) => g.id))
      const readDays = new Set(days.map(dayKey))
      const fresh = (read as MacroGroup[][]).flat().map((g) => (made.has(g.id) ? { ...g, done: true } : g))
      state.calendar = [...state.calendar!.filter((g) => !readDays.has(g.day)), ...fresh].sort((a, b) => a.at - b.at)
      state.failures = 0
      state.error = null
      log = days.map((day, i) => {
        const groups = read[i] as MacroGroup[]
        return `${dayKey(day)}: ${groups.length ? groups.map((g) => `${g.allDay ? '?' : clock(g.at)} ${[...g.countries, ...(g.talks?.length ? ['talk'] : [])].join('/')}`).join(', ') : 'nothing'}`
      }).join('; ')
    }
  }

  // Announcements due now. One found late (the reading failed until then, or a release was
  // added) says how many minutes are left; with under a minute left it is not made.
  const add: NewsItem[] = []
  for (const g of state.calendar!) {
    if (g.done || now < announceAt(g)) continue
    g.done = true
    dirty = true
    if (now > lastAt(g)) continue
    const minutes = Math.min(LEAD_MINUTES, Math.ceil((g.at - now) / 60_000))
    // The day's page; the time makes each link different, or the page would show one announcement a day.
    // The lead is the data; speeches are named in the title.
    add.push({ id: g.id, title: groupTitle(g, minutes), description: g.lines.join(' '), link: `${feed.url}${g.day}${g.allDay ? '' : `#${clock(g.at)}`}`,
      pubDate: new Date(now).toISOString(), source: feed.source, label: feed.label })
  }
  // Releases more than a day old are forgotten
  state.calendar = state.calendar!.filter((g) => lastAt(g) > now - DAY_MS)

  state.items = retain([...old.items, ...add], new Set(), now)
  const kept = new Set(state.items.map((i) => i.id))
  const remove = old.items.filter((i) => !kept.has(i.id)).map((i) => i.id)
  const changed = add.length > 0 || remove.length > 0 || state.error !== old.error
  return { state, changed, add, remove, problem, dirty: dirty || changed, log }
}
