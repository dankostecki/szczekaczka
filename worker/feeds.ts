// Checking one feed: download it if it changed, parse it, and say what is new.
import { decodeBody, parseFeedXml, type NewsItem } from '../src/lib/parse'
import type { FeedConfig } from '../src/lib/sources'

export interface FeedState {
  items: NewsItem[]
  error: string | null
  hash?: string
  etag?: string
  lastModified?: string
  checkedAt: number
}

export interface CheckResult {
  state: FeedState
  changed: boolean // items or error differ from before
  add: NewsItem[]
  remove: string[]
}

// Keep messages small: the page shows two lines of the lead and reads at most ~400 characters
const MAX_PER_FEED = 100
const MAX_LEAD = 500
function shorten(text: string): string {
  if (text.length <= MAX_LEAD) return text
  const cut = text.slice(0, MAX_LEAD)
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), MAX_LEAD - 40))}…`
}

async function sha1(buf: ArrayBuffer): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-1', buf))
  return Array.from(d, (b) => b.toString(16).padStart(2, '0')).join('')
}

export async function checkFeed(feed: FeedConfig, prev: FeedState | undefined, url = feed.url): Promise<CheckResult> {
  const now = Date.now()
  const old: FeedState = prev ?? { items: [], error: null, checkedAt: 0 }
  const same = (state: FeedState): CheckResult => ({ state, changed: false, add: [], remove: [] })
  const failed = (message: string): CheckResult => {
    const state = { ...old, error: message, checkedAt: now } // keep the last items
    return { state, changed: old.error !== message, add: [], remove: [] }
  }

  let res: Response
  try {
    const headers: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 (compatible; Szczekaczka/1.0; +https://github.com/dankostecki/szczekaczka)',
      'Accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*',
      'Accept-Language': 'pl,en;q=0.8',
    }
    if (old.etag) headers['If-None-Match'] = old.etag
    if (old.lastModified) headers['If-Modified-Since'] = old.lastModified
    res = await fetch(url, { headers, signal: AbortSignal.timeout(8000) })
  } catch (e) {
    return failed((e as Error)?.name === 'TimeoutError' ? 'Przekroczony czas (8 s)' : 'Brak połączenia ze źródłem')
  }

  if (res.status === 304 && prev) return { ...same({ ...old, error: null, checkedAt: now }), changed: old.error !== null }
  if (!res.ok) return failed(`HTTP ${res.status}`)

  const buf = await res.arrayBuffer()
  const hash = await sha1(buf)
  const meta = { etag: res.headers.get('etag') ?? undefined, lastModified: res.headers.get('last-modified') ?? undefined }
  if (prev && hash === old.hash) {
    return { ...same({ ...old, ...meta, error: null, checkedAt: now }), changed: old.error !== null }
  }

  const xml = decodeBody(buf, res.headers.get('content-type'))
  const parsed = parseFeedXml(xml, feed)
  if (parsed.length === 0 && !/<(item|entry)[\s>]/i.test(xml)) return failed('Brak wpisów RSS w odpowiedzi')
  const items = parsed.slice(0, MAX_PER_FEED).map((it) => ({ ...it, description: shorten(it.description) }))

  const before = new Map(old.items.map((i) => [i.id, i]))
  const now_ = new Set(items.map((i) => i.id))
  // New ids, and items whose title or lead was corrected
  const add = items.filter((i) => {
    const b = before.get(i.id)
    return !b || b.title !== i.title || b.description !== i.description || b.pubDate !== i.pubDate
  })
  const remove = old.items.filter((i) => !now_.has(i.id)).map((i) => i.id)
  const state: FeedState = { items, error: null, hash, ...meta, checkedAt: now }
  return { state, changed: add.length > 0 || remove.length > 0 || old.error !== null, add, remove }
}
