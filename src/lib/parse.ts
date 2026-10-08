// RSS / Atom parsing on the server (Node has no DOMParser).
import { XMLParser } from 'fast-xml-parser'
import type { FeedConfig } from './sources'

// What /api/news sends to the browser
export interface NewsItem {
  id: string
  title: string
  link: string
  description: string
  pubDate: string // ISO, '' when the feed gives no usable date
  source: string
  label: string
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
  processEntities: true,
  htmlEntities: true,
  isArray: (name) => ['channel', 'item', 'entry', 'link'].includes(name),
})

type Node = Record<string, unknown>
const asArray = (v: unknown): Node[] => (Array.isArray(v) ? v : v == null ? [] : [v]) as Node[]

function text(v: unknown): string {
  if (v == null) return ''
  if (typeof v === 'string' || typeof v === 'number') return String(v).trim()
  if (Array.isArray(v)) return text(v[0])
  if (typeof v === 'object') return text((v as Node)['#text'])
  return ''
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

export const cleanText = (html: string) =>
  decodeEntities(html.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim()

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
// or anything the native parser reads once a zone is put on it ("Wed, 08 Oct 2026 10:15:00")
function parseWarsaw(s: string): number {
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?)?$/)
  if (iso) return warsawToUtc(+iso[1], +iso[2], +iso[3], +(iso[4] ?? 0), +(iso[5] ?? 0), +(iso[6] ?? 0))
  const pl = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:,?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/)
  if (pl) return warsawToUtc(+pl[3], +pl[2], +pl[1], +(pl[4] ?? 0), +(pl[5] ?? 0), +(pl[6] ?? 0))
  const wall = new Date(`${s.replace(/\s*(GMT|UTC)$/i, '')} GMT`)
  if (Number.isNaN(wall.getTime())) return NaN
  return warsawToUtc(wall.getUTCFullYear(), wall.getUTCMonth() + 1, wall.getUTCDate(),
    wall.getUTCHours(), wall.getUTCMinutes(), wall.getUTCSeconds())
}

// A zone at the end: "+0100", "+01:00", "CET", "CEST"
const ZONE = /\s*(?:([+-])(\d{2}):?(\d{2})|\b(CEST|CET)\b)$/i

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
  if (!z && !/(GMT|UTC|Z)$/i.test(s)) ms = parseWarsaw(s)
  else if (offset === 60 || offset === 120) ms = parseWarsaw(s.slice(0, z!.index).trim())
  else ms = new Date(s).getTime()
  if (Number.isNaN(ms)) ms = new Date(s).getTime()
  return Number.isNaN(ms) ? '' : new Date(ms).toISOString()
}

function absolute(link: string, base: string): string {
  if (!link) return ''
  try { return new URL(link, base).toString() } catch { return link }
}

// Collect every value stored under `key` anywhere in the tree (like querySelectorAll)
function collect(node: unknown, key: string, out: Node[] = []): Node[] {
  if (Array.isArray(node)) { node.forEach((n) => collect(n, key, out)); return out }
  if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node as Node)) {
      if (k === key) out.push(...asArray(v))
      else if (!k.startsWith('@_') && k !== '#text') collect(v, key, out)
    }
  }
  return out
}

function makeItem(feed: FeedConfig, title: string, link: string, description: string, date: string): NewsItem {
  const desc = cleanText(description)
  return {
    id: `${feed.source}:${feed.label}:${link || title}`,
    title, link,
    description: desc === title ? '' : desc,
    pubDate: parseDate(date),
    source: feed.source,
    label: feed.label,
  }
}

export function parseFeedXml(xml: string, feed: FeedConfig): NewsItem[] {
  let doc: unknown
  try { doc = parser.parse(xml) } catch { return [] }
  const items: NewsItem[] = []

  // RSS 2.0 keeps <item> in <channel>, RSS 1.0 (RDF) next to it
  const rssItems = collect(doc, 'item')
  if (rssItems.length > 0) {
    for (const it of rssItems) {
      const title = cleanText(text(it.title))
      if (!title) continue
      const enclosure = asArray(it.enclosure)[0]
      const link = absolute(text(asArray(it.link)[0]) || (enclosure ? String(enclosure['@_url'] ?? '') : '') || text(it.guid), feed.url)
      items.push(makeItem(feed, title, link, text(it.description) || text(it['content:encoded']),
        text(it.pubDate) || text(it['dc:date'])))
    }
    return items
  }

  // Atom: <entry>
  for (const en of collect(doc, 'entry')) {
    const title = cleanText(text(en.title))
    if (!title) continue
    const links = asArray(en.link)
    const linkEl = links.find((l) => l['@_rel'] === 'alternate') ?? links.find((l) => l['@_href']) ?? links[0]
    const link = absolute(linkEl ? String(linkEl['@_href'] ?? text(linkEl)) : '', feed.url)
    items.push(makeItem(feed, title, link, text(en.summary) || text(en.content),
      text(en.published) || text(en.updated) || text(en['dc:date'])))
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
