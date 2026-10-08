// Server only: fetches every feed in parallel and returns one deduped, sorted list.
import { createHash } from 'node:crypto'
import { FEEDS, type FeedConfig } from './sources'
import { type NewsItem, decodeBody, finalizeItems, parseFeedXml } from './parse'

export interface FeedError { feed: string; message: string }

// What each feed looked like last time, kept while this function instance stays warm.
// Saves CPU: a feed that has not changed is not parsed again (and a feed that answers
// 304 is not even downloaded); rarely changing feeds are not asked every time.
interface FeedState { items: NewsItem[]; hash: string; etag?: string; lastModified?: string; at: number }
const state = new Map<string, FeedState>()

export interface FetchStats { fetched: number; parsed: number; unchanged: number; skipped: number }

// Keep the response small: the page shows two lines of the lead and reads at most ~400 characters
const MAX_PER_FEED = 100
const MAX_LEAD = 500
function shorten(text: string): string {
  if (text.length <= MAX_LEAD) return text
  const cut = text.slice(0, MAX_LEAD)
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), MAX_LEAD - 40))}…`
}

async function fetchFeed(feed: FeedConfig, stats: FetchStats): Promise<NewsItem[]> {
  const prev = state.get(feed.url)
  if (prev && feed.minAge && Date.now() - prev.at < feed.minAge * 1000) { stats.skipped++; return prev.items }

  const headers: Record<string, string> = {
    'User-Agent': 'Mozilla/5.0 (compatible; Szczekaczka/1.0; +https://github.com/dankostecki/szczekaczka)',
    'Accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*',
    'Accept-Language': 'pl,en;q=0.8',
  }
  if (prev?.etag) headers['If-None-Match'] = prev.etag
  if (prev?.lastModified) headers['If-Modified-Since'] = prev.lastModified
  const res = await fetch(feed.url, { signal: AbortSignal.timeout(8000), cache: 'no-store', headers })
  stats.fetched++
  if (res.status === 304 && prev) { prev.at = Date.now(); stats.unchanged++; return prev.items }
  if (!res.ok) throw new Error(`HTTP ${res.status}`)

  const buf = await res.arrayBuffer()
  const hash = createHash('sha1').update(new Uint8Array(buf)).digest('base64')
  const etag = res.headers.get('etag') ?? undefined
  const lastModified = res.headers.get('last-modified') ?? undefined
  if (prev && prev.hash === hash) {
    state.set(feed.url, { ...prev, etag, lastModified, at: Date.now() })
    stats.unchanged++
    return prev.items
  }

  const xml = decodeBody(buf, res.headers.get('content-type'))
  const parsed = parseFeedXml(xml, feed)
  if (parsed.length === 0 && !/<(item|entry)[\s>]/i.test(xml)) throw new Error('Brak wpisów RSS w odpowiedzi')
  const items = parsed.slice(0, MAX_PER_FEED).map((it) => ({ ...it, description: shorten(it.description) }))
  state.set(feed.url, { items, hash, etag, lastModified, at: Date.now() })
  stats.parsed++
  return items
}

export async function fetchNews(): Promise<{ items: NewsItem[]; errors: FeedError[]; stats: FetchStats }> {
  const stats: FetchStats = { fetched: 0, parsed: 0, unchanged: 0, skipped: 0 }
  const results = await Promise.allSettled(FEEDS.map((f) => fetchFeed(f, stats)))
  const items: NewsItem[] = []
  const errors: FeedError[] = []
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') { items.push(...r.value); return }
    const e = r.reason
    const message = e?.name === 'TimeoutError' ? 'Przekroczony czas (8 s)' : e instanceof Error ? e.message : 'Nieznany błąd'
    errors.push({ feed: `${FEEDS[i].source} · ${FEEDS[i].label}`, message })
    // The source is down for a moment: keep showing what it had last time
    const prev = state.get(FEEDS[i].url)
    if (prev) items.push(...prev.items)
  })
  return { items: finalizeItems(items), errors, stats }
}
