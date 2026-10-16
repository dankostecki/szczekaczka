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
  say?: string    // what is read aloud when it differs from `description`, one part per line (MacroNext's stock calendar)
  // The lead as the reading window shows it (Reader.tsx, lib/body.ts): one line per paragraph, a list item as "- text", a subheading as
  // "## text". Only where it says more than `description` (several lines, or a lead cut short there); `description` is the same text as one line
  body?: string
  // The Polish translation of a channel in English (FeedConfig.translate, worker/translate.ts); null: the post could not be
  // translated (shown as it is, not tried again)
  pl?: { title: string; description: string; body?: string } | null
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

// The lines of a lead: a paragraph, a break or a list item (as "- text") starts a new one, the rest as in cleanText
const NEW_LINE = '\u0001'
export const cleanBlocks = (html: string): string[] =>
  decodeEntities(html
    .replace(/<\/?(?:b|i|em|strong|span|a|u|small|sup|sub|font)\b[^>]*>/gi, '')
    .replace(/<li\b[^>]*>/gi, `${NEW_LINE}- `)
    .replace(/<br\s*\/?>|<\/(?:p|div|li|ul|ol|h[1-6]|tr|table|blockquote)>|<(?:p|div|ul|ol|h[1-6]|tr|table|blockquote)\b[^>]*>/gi, NEW_LINE)
    .replace(/<[^>]+>/g, ' '))
    .split(NEW_LINE).map((l) => l.replace(/\s+/g, ' ').trim()).filter((l) => l && l !== '-')

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

export function warsawToUtc(y: number, mo: number, d: number, h = 0, mi = 0, s = 0): number {
  const guess = Date.UTC(y, mo - 1, d, h, mi, s)
  return guess - warsawOffset(guess - warsawOffset(guess))
}

// Wall-clock time in New York (NYSE's hours) to UTC ms. The USA and Poland change between summer
// and winter time on different weekends, so the gap between them is 5 or 6 hours.
const newYorkFmt = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York', hourCycle: 'h23',
  year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
})
function newYorkOffset(utcMs: number): number {
  const hour = Math.floor(utcMs / 3_600_000) * 3_600_000
  const parts = newYorkFmt.formatToParts(new Date(hour))
  const n = (t: string) => Number(parts.find((p) => p.type === t)?.value)
  return Date.UTC(n('year'), n('month') - 1, n('day'), n('hour'), n('minute')) - hour
}
export function newYorkToUtc(y: number, mo: number, d: number, h = 0, mi = 0): number {
  const guess = Date.UTC(y, mo - 1, d, h, mi)
  return guess - newYorkOffset(guess - newYorkOffset(guess))
}

// The Polish calendar date at a moment
export function warsawDate(utcMs: number): { y: number; m: number; d: number } {
  const wall = new Date(utcMs + warsawOffset(utcMs))
  return { y: wall.getUTCFullYear(), m: wall.getUTCMonth() + 1, d: wall.getUTCDate() }
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
// What the row shows of a lead (the server cuts `description` here), and how much of it the reading window gets
export const MAX_LEAD = 500
const MAX_BODY = 3000
const BLOCK_TAG = /<(?:br|p|li|div|h[1-6])\b/i

// The lines of a lead as one text, cut at a line (or a word) when it is too long
export function joinBody(lines: string[], max = MAX_BODY): string {
  const text = lines.join('\n')
  if (text.length <= max) return text
  const cut = text.slice(0, max)
  return `${cut.slice(0, Math.max(cut.lastIndexOf('\n'), cut.lastIndexOf(' '), max - 200))}…`
}

function makeItem(feed: FeedConfig, title: string, link: string, description: string, date: string): NewsItem {
  const raw = description.length > MAX_RAW_LEAD ? description.slice(0, MAX_RAW_LEAD).replace(/<[^>]*$/, '') : description
  const desc = cleanText(raw)
  // The reading window shows the lines of the lead; with no break in it, only a lead the row cuts short has more to show
  let body = ''
  if (desc !== title && (desc.length > MAX_LEAD || BLOCK_TAG.test(raw))) {
    const lines = cleanBlocks(raw)
    if (lines.length > 1 || desc.length > MAX_LEAD) body = joinBody(lines)
  }
  return {
    id: `${feed.source}:${feed.label}:${link || title}`,
    title, link,
    description: desc === title ? '' : desc,
    ...(body ? { body } : {}),
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

// ── The list of company reports on Bankier.pl (bankier.pl/gielda/wiadomosci/komunikaty-spolek) ──
// Bankier's ESPI RSS has only some of the reports; this page has them all, newest first:
//   <li class="m-quotes-announcements-list__item"><div class="m-quotes-announcements-item">
//     <span class="m-quotes-announcements-item__date">09.10.2026 10:42</span>
//     <a class="m-quotes-announcements-item__anchor" href="https://www.bankier.pl/wiadomosc/…-9210077.html" …>
//       PRIME ASI SA: Zawiadomienie w trybie art. 19 ust. 1 MAR</a>
//     <div class="a-quotes-badge -white -source"><span class="value">espi</span></div>…

// Just the list: the rest of the page (about 570 KB) is not worth the CPU, and differs on every
// visit. null when the page has no list (changed, or an error page).
export function bankierListSection(html: string): string | null {
  // The list's class, alone or with others added to it (not a style rule), else the first of its rows
  const start = /class="[^"]*\bm-quotes-announcements-list(?=["\s])/.exec(html)?.index ?? html.indexOf('<li class="m-quotes-announcements-list__item')
  if (start < 0) return null
  const end = html.indexOf('</ul>', start)
  return html.slice(start, end < 0 ? start + 200_000 : end)
}

export function parseBankierList(section: string, feed: FeedConfig, limit = Infinity): NewsItem[] {
  const items: NewsItem[] = []
  for (const [, li] of section.matchAll(/<li class="m-quotes-announcements-list__item[^"]*"[^>]*>([\s\S]*?)<\/li>/g)) {
    const a = li.match(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/)
    const title = a ? cleanText(a[2]) : ''
    if (!a || !title) continue
    const date = li.match(/__date">\s*([\d.]+\s+\d{1,2}:\d{2})/)?.[1] ?? '' // "09.10.2026 10:42", Warsaw time
    items.push(makeItem(feed, title, absolute(decodeEntities(a[1]), feed.url), '', date))
    if (items.length >= limit) break
  }
  return items
}

// ── The public web preview of a Telegram channel (t.me/s/<channel>) ──
// The latest ~20 posts, oldest first; each one:
//   <div class="tgme_widget_message text_not_supported_wrap js-widget_message" data-post="WalterBloomberg/34446" …>
//     (a reply quotes the post it answers: <a class="tgme_widget_message_reply" …><div class="tgme_widget_message_text js-message_reply_text">…)
//     <div class="tgme_widget_message_text js-message_text" dir="auto">$NVDA - NVIDIA …<br/><br/>(@WalterBloomberg)</div>
//     … <a class="tgme_widget_message_date" href="https://t.me/WalterBloomberg/34446"><time datetime="2026-10-15T17:58:03+00:00" …>
// Posts without text (a photo alone) and service messages (a pinned post) are left out. The rest of the page (views,
// counters) changes on every visit, so the server compares the posts read from it, not the page.
const TELEGRAM_POST = /<div\b(?=[^>]*\sclass="tgme_widget_message\b([^"]*)")(?=[^>]*\sdata-post="(\w+)\/(\d+)")[^>]*>/g
const TELEGRAM_TEXT = /<div class="tgme_widget_message_text\b[^"]*\bjs-message_text\b[^"]*"[^>]*>/

// The HTML inside the element that starts at `from` (just after its opening tag), up to its own </div>
function divInner(html: string, from: number): string {
  const re = /<(\/?)div\b[^>]*>/g
  re.lastIndex = from
  let depth = 1
  for (let m; (m = re.exec(html)); ) {
    depth += m[1] ? -1 : 1
    if (depth === 0) return html.slice(from, m.index)
  }
  return html.slice(from)
}

export function parseTelegram(html: string, feed: FeedConfig, limit = Infinity): NewsItem[] {
  const posts = [...html.matchAll(TELEGRAM_POST)]
  const items: NewsItem[] = []
  posts.forEach((m, i) => {
    const [, classes, channel, id] = m
    const block = html.slice(m.index!, posts[i + 1]?.index ?? html.length)
    if (/\bservice_message\b/.test(classes) || block.includes('tgme_widget_service_strong_text')) return
    const text = TELEGRAM_TEXT.exec(block)
    if (!text) return
    // The lines of the post, without the channel's own handle at the end ("(@WalterBloomberg)", on its own line or after the text)
    const own = new RegExp(`(?:^@${channel}|\\s*\\(@${channel}\\))$`, 'i')
    const lines = divInner(block, text.index + text[0].length).split(/<br\s*\/?>/i).map(cleanText).filter(Boolean)
    while (lines.length && own.test(lines[lines.length - 1])) {
      const last = lines.pop()!.replace(own, '')
      if (last) { lines.push(last); break }
    }
    if (!lines.length) return
    const date = (block.match(/class="tgme_widget_message_date\b[\s\S]*?<time\b[^>]*\bdatetime="([^"]+)"/) ?? block.match(/<time\b[^>]*\bdatetime="([^"]+)"/))?.[1] ?? ''
    const item = makeItem(feed, lines[0], `https://t.me/${channel}/${id}`, '', date)
    // The lines after the title are the lead; as a list in the reading window (a post of a title and one line has no more to show)
    items.push({ ...item, description: lines.slice(1).join(' '), ...(lines.length > 2 ? { body: joinBody(lines.slice(1)) } : {}) })
  })
  return items.slice(-limit)
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
