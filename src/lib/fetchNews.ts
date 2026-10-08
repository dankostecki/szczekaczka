// Server only: fetches every feed in parallel and returns one deduped, sorted list.
import { FEEDS, FeedConfig } from './sources'
import { NewsItem, decodeBody, finalizeItems, parseFeedXml } from './parse'

export interface FeedError { feed: string; message: string }

async function fetchFeed(feed: FeedConfig): Promise<NewsItem[]> {
  const res = await fetch(feed.url, {
    signal: AbortSignal.timeout(8000),
    cache: 'no-store',
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; Szczekaczka/1.0; +https://github.com/dankostecki/szczekaczka)',
      'Accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*',
      'Accept-Language': 'pl,en;q=0.8',
    },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const xml = decodeBody(await res.arrayBuffer(), res.headers.get('content-type'))
  const items = parseFeedXml(xml, feed)
  if (items.length === 0 && !/<(item|entry)[\s>]/i.test(xml)) throw new Error('Brak wpisów RSS w odpowiedzi')
  return items.slice(0, MAX_PER_FEED).map((it) => ({ ...it, description: shorten(it.description) }))
}

// Keep the response small: the page shows two lines of the lead and reads at most ~400 characters
const MAX_PER_FEED = 100
const MAX_LEAD = 500
function shorten(text: string): string {
  if (text.length <= MAX_LEAD) return text
  const cut = text.slice(0, MAX_LEAD)
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), MAX_LEAD - 40))}…`
}

export async function fetchNews(): Promise<{ items: NewsItem[]; errors: FeedError[] }> {
  const results = await Promise.allSettled(FEEDS.map(fetchFeed))
  const items: NewsItem[] = []
  const errors: FeedError[] = []
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') items.push(...r.value)
    else {
      const e = r.reason
      const message = e?.name === 'TimeoutError' ? 'Przekroczony czas (8 s)' : e instanceof Error ? e.message : 'Nieznany błąd'
      errors.push({ feed: `${FEEDS[i].source} · ${FEEDS[i].label}`, message })
    }
  })
  return { items: finalizeItems(items), errors }
}
