// Browser side: loading the list from /api/news and formatting dates.
import type { NewsItem } from './parse'
import type { FeedError } from './fetchNews'
import { SOURCES, feedKey, labelsOf, type Source } from './sources'

export interface Item extends NewsItem {
  time: number // ms since epoch, 0 = no date
}

export type { FeedError }

export async function loadNews(): Promise<{ items: Item[]; errors: FeedError[] }> {
  // no-cache: the browser keeps a copy and asks the server whether it changed (304 if not)
  const res = await fetch('/api/news', { cache: 'no-cache' })
  if (!res.ok) throw new Error(`Serwer odpowiedział ${res.status}`)
  const data: { items: NewsItem[]; errors: FeedError[] } = await res.json()
  return { items: data.items.map(withTime), errors: data.errors }
}

export const withTime = (it: NewsItem): Item => ({ ...it, time: it.pubDate ? Date.parse(it.pubDate) : 0 })

export const keyOf = (it: NewsItem) => feedKey(it.source, it.label)

// "ESPI" for one-channel sources, "GPW · INDEKSY" otherwise
export function tagOf(it: NewsItem): string {
  const src = it.source as Source
  return SOURCES.includes(src) && labelsOf(src).length === 1 ? it.source : `${it.source} · ${it.label}`
}

// New = not in the previous fetch and published within the last hour (feeds sometimes
// re-surface old items). Undated items count as new once they show up. Oldest first.
export function freshItems(fetched: Item[], seen: Set<string>, now = Date.now()): Item[] {
  return fetched
    .filter((i) => !seen.has(i.id) && (i.time === 0 || (now - i.time < 3600_000 && i.time - now < 300_000)))
    .sort((a, b) => a.time - b.time)
}

// Always Polish time, whatever the computer's time zone is set to
const TZ = 'Europe/Warsaw'
const hm = new Intl.DateTimeFormat('pl-PL', { timeZone: TZ, hour: '2-digit', minute: '2-digit' })
const dayFmt = new Intl.DateTimeFormat('pl-PL', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long' })
const fullFmt = new Intl.DateTimeFormat('pl-PL', { timeZone: TZ, dateStyle: 'full', timeStyle: 'short' })
const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' })

export const clock = (ms: number) => (ms ? hm.format(ms) : '—')
export const fullDate = (ms: number) => (ms ? fullFmt.format(ms) : 'Brak daty w kanale')

export function ago(ms: number, now = Date.now()): string {
  if (!ms || ms - now > 60_000) return '' // no date, or a future event (calendar)
  const m = Math.floor((now - ms) / 60_000)
  if (m < 1) return 'teraz'
  if (m < 60) return `${m} min temu`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} godz. temu`
  return ''
}

// The Polish calendar day as a number of days (for comparing and grouping)
const startOfDay = (ms: number) => Date.parse(`${ymd.format(ms)}T00:00:00Z`) / 86_400_000

export function dayLabel(ms: number, now = Date.now()): string {
  if (!ms) return 'Bez daty'
  const diff = startOfDay(now) - startOfDay(ms)
  if (diff === 0) return 'Dziś'
  if (diff === 1) return 'Wczoraj'
  if (diff === -1) return 'Jutro'
  return dayFmt.format(ms)
}

export const dayKey = (ms: number) => (ms ? startOfDay(ms) : 0)
