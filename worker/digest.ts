// A technical file for the owner: every news of the last 24 hours, as published (no AI translations), with the AI's rating of its
// importance, as JSON, to hand to another agent that writes from it. Made once a day at DIGEST_AT, Polish time, by the Poller (which keeps
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
export interface DigestMeta { forDay: string | null; builtAt: number; parts: number }

// The day whose digest is due now: past its DIGEST_AT, and not made for it yet
export function digestDue(now: number, latest: DigestMeta | null): string | null {
  const day = editionIdAt(now)
  return now >= warsawAt(day, DIGEST_AT) && latest?.forDay !== day ? day : null
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

// The digest as JSON: the news of [now − 24 h, now] of every channel, newest first
export function buildDigest(feeds: ReadonlyMap<string, FeedState>, now: number): string {
  const from = now - DIGEST_HOURS * 3600_000
  const news: ReturnType<typeof entry>[] = []
  const bySource: Record<string, number> = {}
  for (const f of FEEDS) {
    for (const it of feeds.get(feedKey(f.source, f.label))?.items ?? []) {
      const t = it.pubDate ? Date.parse(it.pubDate) : NaN
      if (!Number.isFinite(t) || t < from || t > now + 5 * 60_000) continue
      news.push(entry(it, t))
      bySource[it.source] = (bySource[it.source] ?? 0) + 1
    }
  }
  news.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
  const byLevel = { 4: 0, 3: 0, 2: 0, 1: 0, none: 0 }
  for (const n of news) byLevel[n.importance ? n.importance.level : 'none']++
  return JSON.stringify({
    generatedAt: iso(now),
    generatedWarsaw: warsaw.format(now),
    window: { from: iso(from), to: iso(now), hours: DIGEST_HOURS },
    about: 'Wszystkie wiadomości Szczekaczki z ostatnich 24 godzin w oryginalnym brzmieniu (bez tłumaczeń AI), od najnowszej. ' +
      'importance: ocena ważności dla inwestora nadana automatycznie przez model AI (Cloudflare Workers AI) przy pobraniu wiadomości, 0–10, ' +
      'i jej stopień 1–4 (1 spokojna: poniżej 4, 2 umiarkowana: od 4, 3 ważna: od 6, 4 bardzo ważna: od 8); null: wiadomość nieoceniana ' +
      '(np. zapowiedzi MacroNext) albo ocena się nie udała. Ocena to wskazówka, może się mylić. text: zajawka lub treść, jeśli źródło ją podaje.',
    sources: Object.fromEntries(Object.keys(bySource).map((s) => [s, { name: SOURCE_INFO[s as Source]?.name ?? s, news: bySource[s] }])),
    counts: { news: news.length, byLevel },
    news,
  }, null, 1)
}

// Stored in parts: one row of SQLite holds at most 2 MB
export const DIGEST_PART = 500_000
export const partsOf = (json: string) => Array.from({ length: Math.max(1, Math.ceil(json.length / DIGEST_PART)) }, (_, i) => json.slice(i * DIGEST_PART, (i + 1) * DIGEST_PART))
