// Checking one feed: download it if it changed, parse it, and say what is new.
import { decodeBody, parseFeedXml, bankierListSection, parseBankierList, type NewsItem } from '../src/lib/parse'
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

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (compatible; Szczekaczka/1.0; +https://github.com/dankostecki/szczekaczka)',
  'Accept-Language': 'pl,en;q=0.8',
}
const RSS_ACCEPT = 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*'

// A link without its query: Bankier's RSS adds "?utm_source=RSS…" to the links of its list page
const bareLink = (link: string) => link.replace(/[?#].*$/, '')

// Leads for a list page, from an RSS feed that has some of its entries (by link); its entries are
// also the fallback when the list page fails. null when the feed could not be read this time.
async function fetchLeads(url: string, feed: FeedConfig): Promise<{ body: string; items: NewsItem[]; byLink: Map<string, string> } | null> {
  try {
    const res = await fetch(url, { headers: { ...HEADERS, Accept: RSS_ACCEPT }, signal: AbortSignal.timeout(TIMEOUT_S * 1000) })
    if (!res.ok) return null
    const body = decodeBody(await res.arrayBuffer(), res.headers.get('content-type')).slice(0, MAX_XML_CHARS)
    const items = parseFeedXml(body, feed, MAX_PER_FEED)
    return { body, items, byLink: new Map(items.map((i) => [bareLink(i.link), i.description])) }
  } catch { return null }
}

export async function checkFeed(feed: FeedConfig, prev: FeedState | undefined, url = feed.url, now = Date.now(),
  leadsUrl = feed.leads): Promise<CheckResult> {
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

  const reread = old.parser !== PARSER_VERSION
  let res: Response
  try {
    const headers: Record<string, string> = { ...HEADERS, Accept: feed.format ? 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8' : RSS_ACCEPT }
    if (old.etag && !reread) headers['If-None-Match'] = old.etag
    if (old.lastModified && !reread) headers['If-Modified-Since'] = old.lastModified
    res = await fetch(url, { headers, signal: AbortSignal.timeout(TIMEOUT_S * 1000) })
  } catch (e) {
    return failed((e as Error)?.name === 'TimeoutError' ? `źródło nie odpowiedziało w ${TIMEOUT_S} s` : 'brak połączenia ze źródłem')
  }

  if (res.status === 304 && prev) return aged({ error: null, failures: 0 })
  if (!res.ok) return failed(`źródło zwróciło błąd HTTP ${res.status}`)

  const buf = await res.arrayBuffer()
  // A list page: only the list counts (the rest of the page changes on every visit)
  const page = feed.format ? decodeBody(buf, res.headers.get('content-type')) : ''
  const section = feed.format ? bankierListSection(page) : null
  let listProblem: string | null = null, listDetail = ''
  if (feed.format && section === null) {
    const text = page.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<[^>]+>/gi, ' ').replace(/\s+/g, ' ').trim()
    listProblem = `strona bez listy komunikatów: ${pageInfo(page, res, url)}`
    listDetail = `${res.headers.get('server') ?? ''} ${text.slice(0, 300)}`
  }
  const leads = feed.format && leadsUrl ? await fetchLeads(leadsUrl, feed) : null
  // No list: the RSS's entries rather than nothing, with a note in the red box (from the 3rd time)
  if (listProblem && !leads) return failed(listProblem, listDetail)
  const failures = listProblem ? (old.failures ?? 0) + 1 : 0
  const error = listProblem && (failures >= SHOW_ERROR_AFTER || old.items.length === 0) ? `${listProblem}; są tylko raporty z RSS` : null
  const problem = listProblem ? `${listProblem} (raporty z RSS) | ${listDetail}` : undefined
  const hash = await sha1(section === null && !leads ? buf : new TextEncoder().encode(`${section ?? 'rss'}${leads?.body ?? ''}`))
  const meta = { etag: res.headers.get('etag') ?? undefined, lastModified: res.headers.get('last-modified') ?? undefined }
  if (prev && hash === old.hash && old.parser === PARSER_VERSION) return { ...aged({ ...meta, error, failures }), problem }

  let parsed: NewsItem[]
  if (feed.format) {
    // An entry already stored under another form of its link (from the RSS, with "?utm_…") keeps its id
    const stored = new Map(old.items.map((i) => [bareLink(i.link), i]))
    const entries = section !== null ? parseBankierList(section, feed, MAX_PER_FEED) : leads!.items
    parsed = entries.map((i) => {
      const was = stored.get(bareLink(i.link))
      const lead = leads?.byLink.get(bareLink(i.link)) || (was?.description ?? '')
      return { ...i, id: was?.id ?? i.id, description: lead }
    })
  } else {
    const full = decodeBody(buf, res.headers.get('content-type'))
    const xml = full.length > MAX_XML_CHARS ? full.slice(0, MAX_XML_CHARS) : full
    parsed = parseFeedXml(xml, feed, MAX_PER_FEED)
    if (parsed.length === 0 && !/<(item|entry)[\s>]/i.test(xml)) return failed('odpowiedź bez wpisów RSS')
  }
  const before = new Map(old.items.map((i) => [i.id, i]))
  // An entry keeps the time it was first read with: CNBC moves an article's date each time it edits
  // it, which would lift an old article above the new ones. After a parser change it is read anew.
  const fresh = parsed.map((it) => {
    const b = before.get(it.id)
    return { ...it, description: shorten(it.description), pubDate: b?.pubDate && !reread ? b.pubDate : it.pubDate }
  })
  // New ids, and items whose title or lead was corrected (or their date, after a parser change)
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
  const state: FeedState = { items, current: [...inFeed], error: feed.format ? error : null, failures: feed.format ? failures : 0, hash, ...meta, checkedAt: now, parser: PARSER_VERSION }
  // An added entry that is already too old to keep (a feed item without a date is always kept)
  const added = add.filter((i) => kept.has(i.id))
  const gap = current.size > 0 && fresh.length > 0 && !fresh.some((i) => current.has(i.id))
  return { state, changed: added.length > 0 || remove.length > 0 || old.error !== state.error, add: added, remove, gap, problem: feed.format ? problem : undefined }
}
