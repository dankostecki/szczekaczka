// Technical files for the owner: the news of a span of time, as published (no AI translations), with the AI's rating of their importance,
// as JSON, to hand to another agent that writes from them. The news of little importance (steps 1 and 2: quiet and moderate) are left out;
// those not rated (MacroNext's announcements, a rating that failed) stay. Four files, each at its own address (DIGESTS): the 24 hours up to
// 8:30, the evening and night from 16:00 to 7:30, the morning from 7:30 to 11:40, the midday from 11:40 to 15:40, Polish time. Each is made by
// the Poller (which keeps the news) when its span ends, every day, and replaces the one before: no history is kept. An address always has
// the latest span that has ended (right after a deploy, it is made at once). Not linked from the page.
import type { NewsItem } from '../src/lib/parse'
import { FEEDS, feedKey, linkOf, SOURCE_INFO, sourceName, type Source } from '../src/lib/sources'
import { IMPORTANCE, importanceLevel } from '../src/lib/top'
import { editionIdAt, warsawAt } from './briefing/time'
import type { FeedState } from './feeds'

const MAX_TEXT = 6000 // characters of a news's text (the longest kept are about 3000)

// A file: its address, the end of its span (Polish time) and its start: a time of the same day, of the day before (dayShift -1), or `hours` before
export interface DigestSpec { key: string; path: string; name: string; to: string; from: { at: string; dayShift: number } | { hours: number } }
export const DIGESTS: DigestSpec[] = [
  { key: 'day', path: '/api/digest.json', name: '24 godziny do 8:30', to: '08:30', from: { hours: 24 } },
  { key: 'night', path: '/api/digest-night.json', name: 'od 16:00 do 7:30 następnego dnia', to: '07:30', from: { at: '16:00', dayShift: -1 } },
  { key: 'morning', path: '/api/digest-morning.json', name: 'od 7:30 do 11:40', to: '11:40', from: { at: '07:30', dayShift: 0 } },
  { key: 'midday', path: '/api/digest-midday.json', name: 'od 11:40 do 15:40', to: '15:40', from: { at: '11:40', dayShift: 0 } },
]
export const digestOf = (path: string) => DIGESTS.find((d) => d.path === path)

// What is kept of the latest file of a kind: the Polish day its span ends on, when it was made
export interface DigestMeta { forDay: string; builtAt: number; parts: number; version?: number }

// What a file is made like: a new one, and the latest of each kind is made again at once after the deploy
export const DIGEST_VERSION = 4 // 2: without the news of little importance; 3: up to the end of its span, whenever made; 4: four kinds

// The span of a kind that ends on `day`
export function spanOf(spec: DigestSpec, day: string): { from: number; to: number } {
  const to = warsawAt(day, spec.to)
  return { from: 'hours' in spec.from ? to - spec.from.hours * 3600_000 : warsawAt(day, spec.from.at, spec.from.dayShift), to }
}

// The day of the latest span of a kind that has ended by `now`
export function lastEnded(spec: DigestSpec, now: number): string {
  const today = editionIdAt(now)
  return now >= warsawAt(today, spec.to) ? today : editionIdAt(warsawAt(today, spec.to, -1))
}

// The day whose file of this kind is due now: its span has ended and it is not made for it yet (or made like an older version)
export function digestDue(spec: DigestSpec, now: number, latest: DigestMeta | null): string | null {
  const day = lastEnded(spec, now)
  return latest?.forDay !== day || latest.version !== DIGEST_VERSION ? day : null
}

// The next end of a span of this kind after `now`
export function nextDigestAt(spec: DigestSpec, now: number): number {
  const today = warsawAt(editionIdAt(now), spec.to)
  return today > now ? today : warsawAt(editionIdAt(now), spec.to, 1)
}

const iso = (ms: number) => new Date(ms).toISOString()
const warsaw = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Warsaw', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })

function entry(it: NewsItem, t: number) {
  const text = (it.body || it.description || '').slice(0, MAX_TEXT)
  const score = typeof it.ai === 'number' ? Math.round(it.ai * 10) / 10 : null
  return {
    id: it.id,
    source: it.source,
    sourceName: sourceName(it.source),
    channel: it.label,
    publishedAt: iso(t),
    publishedWarsaw: warsaw.format(t),
    title: it.title,
    ...(text ? { text } : {}),
    link: linkOf(it),
    importance: score === null ? null : { score, level: importanceLevel(score), name: IMPORTANCE[importanceLevel(score) - 1].name },
  }
}

// The news of these steps are left out: of little importance
export const SKIPPED_LEVELS = [1, 2]

// A file as JSON: the news of [from, to] of every channel, newest first, without those of little importance
export function buildDigest(feeds: ReadonlyMap<string, FeedState>, now: number, span: { from: number; to: number }, spec: DigestSpec = DIGESTS[0]): string {
  const { from, to } = span
  const news: ReturnType<typeof entry>[] = []
  const bySource: Record<string, number> = {}
  let skipped = 0
  for (const f of FEEDS) {
    for (const it of feeds.get(feedKey(f.source, f.label))?.items ?? []) {
      const t = it.pubDate ? Date.parse(it.pubDate) : NaN
      if (!Number.isFinite(t) || t < from || t > to) continue
      const e = entry(it, t)
      if (e.importance && SKIPPED_LEVELS.includes(e.importance.level)) { skipped++; continue }
      news.push(e)
      bySource[it.source] = (bySource[it.source] ?? 0) + 1
    }
  }
  news.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
  const byLevel = { 4: 0, 3: 0, none: 0 }
  for (const n of news) byLevel[n.importance ? (n.importance.level as 4 | 3) : 'none']++
  return JSON.stringify({
    generatedAt: iso(now),
    generatedWarsaw: warsaw.format(now),
    window: { name: spec.name, from: iso(from), to: iso(to), fromWarsaw: warsaw.format(from), toWarsaw: warsaw.format(to), hours: Math.round((to - from) / 360_000) / 10 },
    about: 'Wiadomości Szczekaczki z okresu w window (czas polski: fromWarsaw–toWarsaw) w oryginalnym brzmieniu (bez tłumaczeń AI), od najnowszej, bez mało istotnych ' +
      '(stopnie 1 i 2 pominięte; zostają 3 i 4 oraz nieoceniane). ' +
      'importance: ocena ważności dla inwestora nadana automatycznie przez model AI (Cloudflare Workers AI) przy pobraniu wiadomości, 0–10, ' +
      'i jej stopień 1–4 (1 spokojna: poniżej 4, 2 umiarkowana: od 4, 3 ważna: od 6, 4 bardzo ważna: od 8); null: wiadomość nieoceniana ' +
      '(np. zapowiedzi MacroNext) albo ocena się nie udała. Ocena to wskazówka, może się mylić. text: zajawka lub treść, jeśli źródło ją podaje.',
    sources: Object.fromEntries(Object.keys(bySource).map((s) => [s, { name: SOURCE_INFO[s as Source]?.name ?? s, news: bySource[s] }])),
    counts: { news: news.length, byLevel, skippedLowImportance: skipped },
    news,
  }, null, 1)
}

// Stored in parts: one row of SQLite holds at most 2 MB
export const DIGEST_PART = 500_000
export const partsOf = (json: string) => Array.from({ length: Math.max(1, Math.ceil(json.length / DIGEST_PART)) }, (_, i) => json.slice(i * DIGEST_PART, (i + 1) * DIGEST_PART))
