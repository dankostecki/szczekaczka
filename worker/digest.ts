// A technical file for the owner: every news of the last 24 hours, as published (no AI translations), with the AI's rating of its
// importance, as JSON, to hand to another agent that writes from it. The news of little importance (steps 1 and 2: quiet and moderate) are
// left out; those not rated (MacroNext's announcements, a rating that failed) stay. One file only: each new one replaces the last, no history is kept. Made once a day at DIGEST_AT, Polish time, by the Poller (which keeps
// the news), and served as it was made at /api/digest.json until the next one. Not linked from the page. Before the first one of a
// day's time is made (right after a deploy), the address has one made at once, which the next DIGEST_AT replaces.
import type { NewsItem } from '../src/lib/parse'
import { FEEDS, feedKey, linkOf, SOURCE_INFO, sourceName, type Source } from '../src/lib/sources'
import { IMPORTANCE, importanceLevel } from '../src/lib/top'
import { editionIdAt, warsawAt } from './briefing/time'
import type { FeedState } from './feeds'

export const DIGEST_AT = '08:30'
export const DIGEST_HOURS = 24
const MAX_TEXT = 6000 // characters of a news's text (the longest kept are about 3000)

// What is kept of the latest one: the Polish day of its DIGEST_AT (null: made at once, before any), when it was made
export interface DigestMeta { forDay: string | null; builtAt: number; parts: number; version?: number }

// What a digest is made like: a new one, and today's is made again at once after the deploy (not only at the next DIGEST_AT)
export const DIGEST_VERSION = 3 // 2: without the news of little importance; 3: up to the day's 8:30, whenever made

// The day whose digest is due now: past its DIGEST_AT, and not made for it yet (or made like an older version)
export function digestDue(now: number, latest: DigestMeta | null): string | null {
  const day = editionIdAt(now)
  return now >= warsawAt(day, DIGEST_AT) && (latest?.forDay !== day || latest.version !== DIGEST_VERSION) ? day : null
}

// The next DIGEST_AT after `now`
export function nextDigestAt(now: number): number {
  const today = warsawAt(editionIdAt(now), DIGEST_AT)
  return today > now ? today : warsawAt(editionIdAt(now), DIGEST_AT, 1)
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

// The digest as JSON: the news of the 24 hours up to `to` of every channel, newest first, without those of little importance. `to`: the day's
// DIGEST_AT (a file made later, after a deploy, still ends at 8:30), or now for one made before any
export function buildDigest(feeds: ReadonlyMap<string, FeedState>, now: number, to = now): string {
  const from = to - DIGEST_HOURS * 3600_000
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
    window: { from: iso(from), to: iso(to), toWarsaw: warsaw.format(to), hours: DIGEST_HOURS },
    about: 'Wiadomości Szczekaczki z ostatnich 24 godzin w oryginalnym brzmieniu (bez tłumaczeń AI), od najnowszej, bez mało istotnych ' +
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
