// Checking one feed: download it if it changed, parse it, and say what is new.
import { decodeBody, parseFeedXml, papListSection, parsePapList, type NewsItem } from '../src/lib/parse'
import type { FeedConfig } from '../src/lib/sources'

export interface FeedState {
  items: NewsItem[]   // what the feed has now, plus what dropped out of it in the last 24 h
  current?: string[]  // ids in the feed at the last download
  error: string | null
  hash?: string
  etag?: string
  lastModified?: string
  checkedAt: number
  failures?: number // failed checks in a row
  parser?: number   // PARSER_VERSION the items were read with
}

export interface CheckResult {
  state: FeedState
  changed: boolean // items or error differ from before
  add: NewsItem[]
  remove: string[]
  problem?: string // why this check failed (for the logs)
  gap?: boolean    // none of the entries was there last time: some may have come and gone unseen
}

// Feeds hold only their latest few entries (ESPI 10, PAP 10, Stooq 30, GPW 50): when a new
// one comes, the oldest drops out. A news app should show the whole day, so an entry that
// left the feed stays for 24 hours from its publication. Entries still in the feed stay
// however old they are; entries without a date go when they leave the feed.
const KEEP_MS = 24 * 3600_000
const MAX_KEEP = 500 // per channel (ESPI publishes a few hundred reports a day)
// Keep messages small: the page shows two lines of the lead and reads at most ~400 characters
const MAX_PER_FEED = 100
// A huge feed (whole articles in every item) is cut: only its start, with the newest items,
// is parsed, so that one check stays within the CPU limit (512 KB: about 3 ms)
const MAX_XML_CHARS = 512 * 1024
const MAX_LEAD = 500
function shorten(text: string): string {
  if (text.length <= MAX_LEAD) return text
  const cut = text.slice(0, MAX_LEAD)
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), MAX_LEAD - 40))}…`
}

// Raise this whenever parsing changes (dates, leads…): every feed is then downloaded and
// read again once, even if it has not changed, so stored items get the new reading.
// 2: PAP MediaRoom dates ("czw., 10/08/2026 - 16:22").
export const PARSER_VERSION = 2

// How long to wait for a source. Waiting costs no CPU, only delays the other channels.
const TIMEOUT_S = 15
// A source that fails once (a slow moment at GPW) is not worth a red box on every page:
// the error is shown from this many failed checks in a row. The poller retries sooner
// after a failure, so that is a few minutes. A channel with nothing on the list (a new one)
// shows it at once: there is nothing to see anyway, and the page should say why.
export const SHOW_ERROR_AFTER = 3

// What came instead of the expected page, to show and log: "12 KB, „Just a moment...”, z adresu …"
function pageInfo(page: string, res: Response, url: string): string {
  const title = page.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1].replace(/\s+/g, ' ').trim().slice(0, 60)
  return [`${Math.round(page.length / 1024)} KB`, title && `„${title}”`, res.url && res.url !== url && `z adresu ${res.url.slice(0, 80)}`]
    .filter(Boolean).join(', ')
}

async function sha1(buf: BufferSource): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-1', buf))
  return Array.from(d, (b) => b.toString(16).padStart(2, '0')).join('')
}

const time = (i: NewsItem) => (i.pubDate ? Date.parse(i.pubDate) : 0)

// The entries to keep: those in the feed, and those published in the last 24 hours;
// newest first, at most MAX_KEEP
function retain(items: NewsItem[], current: Set<string>, now: number): NewsItem[] {
  return items
    .filter((i) => current.has(i.id) || (i.pubDate !== '' && now - time(i) < KEEP_MS))
    .sort((a, b) => time(b) - time(a))
    .slice(0, MAX_KEEP)
}

// `skip`: entries another channel already has (the same ESPI report from Bankier and PAP); they
// are treated as not in this feed. An entry this channel already shows stays.
export async function checkFeed(feed: FeedConfig, prev: FeedState | undefined, url = feed.url, now = Date.now(),
  skip?: (item: NewsItem) => boolean): Promise<CheckResult> {
  const old: FeedState = prev ?? { items: [], error: null, checkedAt: 0 }
  // Before 24-hour keeping, everything stored was in the feed
  const current = new Set(old.current ?? old.items.map((i) => i.id))
  // Nothing new from the source: only entries older than 24 hours may go
  const aged = (patch: Partial<FeedState>): CheckResult => {
    const items = retain(old.items, current, now)
    const kept = new Set(items.map((i) => i.id))
    const remove = old.items.filter((i) => !kept.has(i.id)).map((i) => i.id)
    const state: FeedState = { ...old, ...patch, items, checkedAt: now }
    return { state, changed: remove.length > 0 || state.error !== old.error, add: [], remove }
  }
  // `detail`: for the logs only
  const failed = (message: string, detail?: string): CheckResult => {
    const failures = (old.failures ?? 0) + 1
    const show = failures >= SHOW_ERROR_AFTER || old.items.length === 0
    return { ...aged({ failures, error: show ? message : old.error }), problem: detail ? `${message} | ${detail}` : message }
  }

  let res: Response
  try {
    const headers: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 (compatible; Szczekaczka/1.0; +https://github.com/dankostecki/szczekaczka)',
      'Accept': feed.format === 'pap-list' ? 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8'
        : 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*',
      'Accept-Language': 'pl,en;q=0.8',
    }
    const reread = old.parser !== PARSER_VERSION
    if (old.etag && !reread) headers['If-None-Match'] = old.etag
    if (old.lastModified && !reread) headers['If-Modified-Since'] = old.lastModified
    res = await fetch(url, { headers, signal: AbortSignal.timeout(TIMEOUT_S * 1000) })
  } catch (e) {
    return failed((e as Error)?.name === 'TimeoutError' ? `źródło nie odpowiedziało w ${TIMEOUT_S} s` : 'brak połączenia ze źródłem')
  }

  if (res.status === 304 && prev) return aged({ error: null, failures: 0 })
  if (!res.ok) return failed(`źródło zwróciło błąd HTTP ${res.status}`)

  const buf = await res.arrayBuffer()
  // PAP's report list is a web page: only its table counts (the rest changes on every visit)
  const page = feed.format === 'pap-list' ? decodeBody(buf, res.headers.get('content-type')) : ''
  const section = feed.format === 'pap-list' ? papListSection(page) : null
  if (feed.format === 'pap-list' && section === null) {
    const text = page.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<[^>]+>/gi, ' ').replace(/\s+/g, ' ').trim()
    return failed(`strona bez listy raportów: ${pageInfo(page, res, url)}`, `${res.headers.get('server') ?? ''} ${text.slice(0, 300)}`)
  }
  const hash = await sha1(section === null ? buf : new TextEncoder().encode(section))
  const meta = { etag: res.headers.get('etag') ?? undefined, lastModified: res.headers.get('last-modified') ?? undefined }
  if (prev && hash === old.hash && old.parser === PARSER_VERSION) return aged({ ...meta, error: null, failures: 0 })

  let parsed: NewsItem[]
  if (section !== null) parsed = parsePapList(section, feed, MAX_PER_FEED, now) // an empty list (no reports yet today) is fine
  else {
    const full = decodeBody(buf, res.headers.get('content-type'))
    const xml = full.length > MAX_XML_CHARS ? full.slice(0, MAX_XML_CHARS) : full
    parsed = parseFeedXml(xml, feed, MAX_PER_FEED)
    if (parsed.length === 0 && !/<(item|entry)[\s>]/i.test(xml)) return failed('odpowiedź bez wpisów RSS')
  }
  const before = new Map(old.items.map((i) => [i.id, i]))
  const fresh = parsed
    .filter((it) => before.has(it.id) || !skip?.(it))
    .map((it) => ({ ...it, description: shorten(it.description) }))

  // New ids, and items whose title or lead was corrected
  const add = fresh.filter((i) => {
    const b = before.get(i.id)
    return !b || b.title !== i.title || b.description !== i.description || b.pubDate !== i.pubDate
  })
  const merged = new Map(old.items.map((i) => [i.id, i]))
  for (const i of fresh) merged.set(i.id, i)
  const inFeed = new Set(fresh.map((i) => i.id))
  const items = retain([...merged.values()], inFeed, now)
  const kept = new Set(items.map((i) => i.id))
  const remove = old.items.filter((i) => !kept.has(i.id)).map((i) => i.id)
  const state: FeedState = { items, current: [...inFeed], error: null, failures: 0, hash, ...meta, checkedAt: now, parser: PARSER_VERSION }
  // An added entry that is already too old to keep (a feed item without a date is always kept)
  const added = add.filter((i) => kept.has(i.id))
  const gap = current.size > 0 && fresh.length > 0 && !fresh.some((i) => current.has(i.id))
  return { state, changed: added.length > 0 || remove.length > 0 || old.error !== null, add: added, remove, gap }
}
