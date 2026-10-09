// RSS / Atom parsing, shared by the Cloudflare Worker and the tests. A small regex
// reader instead of a full XML parser: the feeds are simple, and on Cloudflare's free
// plan every run must stay under 10 ms of CPU.
import type { FeedConfig } from './sources'

// What the server sends to the browser
export interface NewsItem {
  id: string
  title: string
  link: string
  description: string
  pubDate: string // ISO, '' when the feed gives no usable date
  source: string
  label: string
}

const NAMED: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', hellip: '…', bdquo: '„', rdquo: '”', ldquo: '“', oacute: 'ó', Oacute: 'Ó' }

// HTML inside CDATA is not entity-decoded by the XML parser
export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m
    }
    return NAMED[e] ?? m
  })
}

// Inline tags go without a trace ("<b>rośnie</b>." -> "rośnie."), the rest becomes a space
export const cleanText = (html: string) =>
  decodeEntities(html
    .replace(/<\/?(?:b|i|em|strong|span|a|u|small|sup|sub|font)\b[^>]*>/gi, '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim()

// Offset of Europe/Warsaw from UTC at a given moment, in ms
// Creating an Intl formatter is slow (a fraction of a millisecond, for every date of
// every feed), so there is one, and offsets are remembered per hour: the offset only
// changes on the hour (summer / winter time).
const warsawFmt = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Europe/Warsaw', hourCycle: 'h23',
  year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
})
const offsetByHour = new Map<number, number>()

function warsawOffset(utcMs: number): number {
  const hour = Math.floor(utcMs / 3_600_000)
  let offset = offsetByHour.get(hour)
  if (offset === undefined) {
    const parts = warsawFmt.formatToParts(new Date(hour * 3_600_000))
    const n = (t: string) => Number(parts.find((p) => p.type === t)?.value)
    offset = Date.UTC(n('year'), n('month') - 1, n('day'), n('hour'), n('minute')) - hour * 3_600_000
    if (offsetByHour.size > 5000) offsetByHour.clear()
    offsetByHour.set(hour, offset)
  }
  return offset
}

function warsawToUtc(y: number, mo: number, d: number, h = 0, mi = 0, s = 0): number {
  const guess = Date.UTC(y, mo - 1, d, h, mi, s)
  return guess - warsawOffset(guess - warsawOffset(guess))
}

// Wall-clock time read as Polish local time: "2026-10-08 10:15", "08.10.2026 10:15",
// "czw., 10/08/2026 - 16:22", or anything the native parser reads once a zone is put on it ("Wed, 08 Oct 2026 10:15:00")
function parseWarsaw(s: string): number {
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?)?$/)
  if (iso) return warsawToUtc(+iso[1], +iso[2], +iso[3], +(iso[4] ?? 0), +(iso[5] ?? 0), +(iso[6] ?? 0))
  const pl = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:,?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/)
  if (pl) return warsawToUtc(+pl[3], +pl[2], +pl[1], +(pl[4] ?? 0), +(pl[5] ?? 0), +(pl[6] ?? 0))
  // Drupal's default date (PAP MediaRoom): "czw., 10/08/2026 - 16:22", month first; a first
  // number over 12 can only be the day
  const us = s.match(/^(?:[^\d,]{1,12},\s*)?(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s*-?\s*(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/)
  if (us) {
    const [a, b] = [+us[1], +us[2]]
    const [month, day] = a > 12 ? [b, a] : [a, b]
    return warsawToUtc(+us[3], month, day, +(us[4] ?? 0), +(us[5] ?? 0), +(us[6] ?? 0))
  }
  const wall = new Date(`${s.replace(/\s*(GMT|UTC)$/i, '')} GMT`)
  if (Number.isNaN(wall.getTime())) return NaN
  return warsawToUtc(wall.getUTCFullYear(), wall.getUTCMonth() + 1, wall.getUTCDate(),
    wall.getUTCHours(), wall.getUTCMinutes(), wall.getUTCSeconds())
}

// A zone at the end: "+0100", "+01:00", "CET", "CEST"
const ZONE = /\s*(?:([+-])(\d{2}):?(\d{2})|\b(CEST|CET)\b)$/i

// Zones the native parser reads itself: GMT, UTC, Z, and the US ones of RFC 822 (EST, EDT, …)
const EXPLICIT = /(GMT|UTC|Z)$|\b(UT|[ECMP][SD]T)$/i

// Dates without a zone are Polish sources' local time. Polish feeds also often write
// "+0100" (CET) all year, so in summer the time came out an hour late: a CET/CEST
// offset is dropped and the time is read as Warsaw time. Other zones (GMT, Z) stay.
export function parseDate(s: string): string {
  s = s.trim()
  if (!s) return ''
  const z = s.match(ZONE)
  const offset = !z ? null
    : z[4] ? (z[4].toUpperCase() === 'CEST' ? 120 : 60)
    : (z[1] === '-' ? -1 : 1) * (Number(z[2]) * 60 + Number(z[3]))
  let ms: number
  if (!z && !EXPLICIT.test(s)) ms = parseWarsaw(s)
  else if (offset === 60 || offset === 120) ms = parseWarsaw(s.slice(0, z!.index).trim())
  else ms = new Date(s).getTime()
  if (Number.isNaN(ms)) ms = new Date(s).getTime()
  return Number.isNaN(ms) ? '' : new Date(ms).toISOString()
}

function absolute(link: string, base: string): string {
  if (!link) return ''
  try { return new URL(link, base).toString() } catch { return link }
}

// Only the start of a lead is kept (~500 characters), so long press releases in the feed
// are not cleaned in full: that would cost CPU for text that is thrown away
const MAX_RAW_LEAD = 4000

function makeItem(feed: FeedConfig, title: string, link: string, description: string, date: string): NewsItem {
  const raw = description.length > MAX_RAW_LEAD ? description.slice(0, MAX_RAW_LEAD).replace(/<[^>]*$/, '') : description
  const desc = cleanText(raw)
  return {
    id: `${feed.source}:${feed.label}:${link || title}`,
    title, link,
    description: desc === title ? '' : desc,
    pubDate: parseDate(date),
    source: feed.source,
    label: feed.label,
  }
}

const CDATA = /<!\[CDATA\[([\s\S]*?)\]\]>/g

// Text of an element: CDATA as is, everything else with XML entities decoded
function inner(raw: string): string {
  let out = '', last = 0
  for (const m of raw.matchAll(CDATA)) {
    out += decodeEntities(raw.slice(last, m.index)) + m[1]
    last = m.index! + m[0].length
  }
  return (out + decodeEntities(raw.slice(last))).trim()
}

const tagCache = new Map<string, RegExp>()
// First <name ...>…</name> in the block. `name` may have a prefix ("dc:date"); "link" does not
// match "atom:link", because the name has to follow "<" directly.
function tag(block: string, name: string): string {
  let re = tagCache.get(name)
  if (!re) { re = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i'); tagCache.set(name, re) }
  const m = block.match(re)
  return m ? inner(m[1]) : ''
}

function attr(el: string, name: string): string {
  const m = el.match(new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i'))
  return m ? decodeEntities(m[2] ?? m[3] ?? '') : ''
}

// At most `limit` items, from the top of the feed (feeds list the newest first)
export function parseFeedXml(xml: string, feed: FeedConfig, limit = Infinity): NewsItem[] {
  const items: NewsItem[] = []

  // RSS 2.0 and RSS 1.0 (RDF): <item>
  for (const [, block] of xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)) {
    if (items.length >= limit) break
    const title = cleanText(tag(block, 'title'))
    if (!title) continue
    const enclosure = block.match(/<enclosure\b[^>]*>/i)?.[0]
    const link = absolute(tag(block, 'link') || (enclosure ? attr(enclosure, 'url') : '') || tag(block, 'guid'), feed.url)
    items.push(makeItem(feed, title, link, tag(block, 'description') || tag(block, 'content:encoded'),
      tag(block, 'pubDate') || tag(block, 'dc:date')))
  }
  if (items.length > 0) return items

  // Atom: <entry>
  for (const [, block] of xml.matchAll(/<entry\b[^>]*>([\s\S]*?)<\/entry>/gi)) {
    if (items.length >= limit) break
    const title = cleanText(tag(block, 'title'))
    if (!title) continue
    const links = [...block.matchAll(/<link\b[^>]*>/gi)].map((m) => m[0])
    const linkEl = links.find((l) => attr(l, 'rel') === 'alternate') ?? links.find((l) => attr(l, 'href')) ?? ''
    const link = absolute(linkEl ? attr(linkEl, 'href') : tag(block, 'link'), feed.url)
    items.push(makeItem(feed, title, link, tag(block, 'summary') || tag(block, 'content'),
      tag(block, 'published') || tag(block, 'updated') || tag(block, 'dc:date')))
  }
  return items
}

// ── The ESPI / EBI report lists of PAP Biznes (biznes.pap.pl/espi, /espi/ebi) ──
// An HTML page, no RSS: a table with one row per report (time, number, company, title):
//   <tr><td class="text-right">07:36</td><td class="text-left">23/2026</td>
//       <td class="text-left"><a href="?company=1393&selectCompany=1393">GreenX Metals Ltd.</a></td>
//       <td><a href="/wiadomosci/firmy/greenx-…">GREENX METALS LTD. (23/2026) Zawiadomienie o…</a></td></tr>
// The list is of one day, named in the links under the table ("/articles/espi/2026/10/9?limit=25").

// Just the table and the links under it: the rest of the page differs on every visit, and is
// not worth the CPU. null when the page has no such table (changed or an error page).
export function papListSection(html: string): string | null {
  const head = html.search(/>\s*godzina\s*</i)
  if (head < 0) return null
  const start = html.lastIndexOf('<table', head)
  const day = html.indexOf('/articles/', head)
  return html.slice(start < 0 ? head : start, day < 0 ? head + 300_000 : day + 40)
}

// "YYYY-MM-DD" in Warsaw
function warsawDay(ms: number): string {
  const d = new Date(ms + warsawOffset(ms))
  return d.toISOString().slice(0, 10)
}

const pad2 = (n: string) => n.padStart(2, '0')

// Newest first, as on the page. Title: "GreenX Metals Ltd.: Zawiadomienie o…" (company, then the
// title without the repeated name and number), like Bankier's "KOOL2PLAY S.A.: …".
export function parsePapList(section: string, feed: FeedConfig, limit = Infinity, now = Date.now()): NewsItem[] {
  const listDay = section.match(/\/articles\/(?:espi|ebi)\/(\d{4})\/(\d{1,2})\/(\d{1,2})/)
  let day = listDay ? `${listDay[1]}-${pad2(listDay[2])}-${pad2(listDay[3])}` : warsawDay(now)
  const items: NewsItem[] = []
  for (const [, row] of section.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const time = row.match(/<td[^>]*>\s*(\d{1,2}):(\d{2})\s*<\/td>/)
    if (!time) {
      // A day heading inside the table: "2026.10.09 – Piątek"
      const d = row.match(/(\d{4})\.(\d{2})\.(\d{2})/)
      if (d) day = `${d[1]}-${d[2]}-${d[3]}`
      continue
    }
    const report = row.match(/<a\b[^>]*href="(\/wiadomosci\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/i)
    if (!report) continue
    const company = cleanText(row.match(/<a\b[^>]*href="\?company=[^"]*"[^>]*>([\s\S]*?)<\/a>/i)?.[1] ?? '')
    const full = cleanText(report[2])
    const text = full.replace(/^.*?\(\d+\/\d{4}\)\s*/, '') || full
    items.push(makeItem(feed, company ? `${company}: ${text}` : full, absolute(decodeEntities(report[1]), feed.url), '',
      `${day} ${pad2(time[1])}:${time[2]}`))
    if (items.length >= limit) break
  }
  return items
}

// The response body in the charset the feed declares (header, then <?xml encoding?>).
// Polish feeds are sometimes ISO-8859-2 / windows-1250, which fetch's .text() would garble.
export function decodeBody(buf: ArrayBuffer, contentType: string | null): string {
  const bytes = new Uint8Array(buf)
  const head = new TextDecoder('latin1').decode(bytes.subarray(0, 300))
  const charset =
    contentType?.match(/charset=["']?([\w-]+)/i)?.[1] ??
    head.match(/<\?xml[^>]*encoding=["']([\w-]+)["']/i)?.[1] ??
    'utf-8'
  try { return new TextDecoder(charset.toLowerCase()).decode(bytes) }
  catch { return new TextDecoder('utf-8').decode(bytes) }
}

// Dedupe (same id, or same source + link across channels) and sort newest first
export function finalizeItems(all: NewsItem[]): NewsItem[] {
  const seen = new Set<string>()
  const out = all.filter((it) => {
    const keys = [it.id, it.link ? `${it.source}|${it.link}` : '']
    if (keys.some((k) => k && seen.has(k))) return false
    keys.forEach((k) => k && seen.add(k))
    return true
  })
  const t = (it: NewsItem) => (it.pubDate ? Date.parse(it.pubDate) : 0)
  return out.sort((a, b) => t(b) - t(a))
}
