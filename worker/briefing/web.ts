// Reading web pages on the server, for the fact-check, with care for the sites and for the server:
// - only https addresses of public names: no IP addresses, no local or internal names, no ports, no logins in the address,
//   none of the domains on the block list, and not this site itself; every redirect is checked the same way (at most 3);
// - robots.txt is honoured (RFC 9309: a server error means "do not crawl"), and so are "noai" robots rules;
// - nothing behind a paywall or a login is read: 401, 402 and 403 stop, and so does a page that marks itself as not free
//   (isAccessibleForFree: false), whatever text it carries; no cookies, no accounts, no archives or bypass services;
// - at most 1.5 MB of a page is read, HTML only; only a few relevant paragraphs are kept, for the check, not to republish.
// The Workers runtime reaches only the public internet anyway; these checks do not rely on it.
import { cleanBlocks, decodeBody, decodeEntities } from '../../src/lib/parse'
import { tokens } from './collect'

export type PageStatus = 'ok' | 'blocked-url' | 'robots' | 'restricted' | 'paywall' | 'noai' | 'not-html' | 'too-large' | 'http-error' | 'timeout' | 'network' | 'empty'

export interface Page {
  url: string
  finalUrl: string
  host: string
  domain: string             // registrable domain ("bbc.co.uk", "reuters.com")
  status: PageStatus
  httpStatus?: number
  title?: string
  publisher?: string
  publishedAt?: string | null // as the page states it; null when it does not
  modifiedAt?: string | null
  lang?: string
  excerpt?: string            // the relevant paragraphs (at most ~3000 characters)
  fetchedAt: number
}

export interface WebOptions { blockedDomains: string[]; ownHosts: string[]; userAgent: string; timeoutMs: number; maxBytes: number }

const LOCAL_SUFFIXES = ['localhost', 'local', 'internal', 'intranet', 'lan', 'home', 'corp', 'arpa', 'test', 'example', 'invalid', 'onion', 'localdomain']

// Common suffixes under which names are registered (a short list: enough to tell apart the publishers of the news)
const SUFFIXES = new Set(['co.uk', 'org.uk', 'gov.uk', 'ac.uk', 'me.uk', 'com.au', 'net.au', 'org.au', 'gov.au', 'co.jp', 'or.jp', 'ne.jp', 'go.jp',
  'com.pl', 'net.pl', 'org.pl', 'gov.pl', 'edu.pl', 'info.pl', 'biz.pl', 'waw.pl', 'com.br', 'gov.br', 'com.cn', 'gov.cn', 'com.hk', 'gov.hk',
  'com.sg', 'gov.sg', 'com.tw', 'co.in', 'gov.in', 'co.kr', 'go.kr', 'co.za', 'com.mx', 'com.tr', 'co.nz', 'co.il', 'com.ar', 'com.ua'])

export function registrableDomain(host: string): string {
  const labels = host.toLowerCase().replace(/\.$/, '').replace(/^www\./, '').split('.')
  if (labels.length <= 2) return labels.join('.')
  const two = labels.slice(-2).join('.')
  return SUFFIXES.has(two) ? labels.slice(-3).join('.') : two
}

const onList = (host: string, list: string[]) => list.some((d) => host === d || host.endsWith(`.${d}`))

export function checkUrl(raw: string, o: Pick<WebOptions, 'blockedDomains' | 'ownHosts'>): { ok: true; url: URL } | { ok: false; reason: string } {
  if (raw.length > 2000) return { ok: false, reason: 'address too long' }
  let url: URL
  try { url = new URL(raw) } catch { return { ok: false, reason: 'not an address' } }
  if (url.protocol !== 'https:') return { ok: false, reason: 'not https' }
  if (url.username || url.password) return { ok: false, reason: 'login in the address' }
  if (url.port && url.port !== '443') return { ok: false, reason: 'a port other than 443' }
  const host = url.hostname.toLowerCase().replace(/\.$/, '')
  if (host.startsWith('[') || /^[\d.]+$/.test(host) || /^0x/i.test(host)) return { ok: false, reason: 'an IP address' }
  const labels = host.split('.')
  if (labels.length < 2 || labels.some((l) => !l || l.length > 63)) return { ok: false, reason: 'not a public name' }
  const tld = labels[labels.length - 1]
  if (!/^(?:[a-z]{2,63}|xn--[a-z0-9-]{2,59})$/.test(tld) || LOCAL_SUFFIXES.includes(tld)) return { ok: false, reason: 'not a public name' }
  if (onList(host, o.ownHosts)) return { ok: false, reason: 'this site' }
  if (onList(host, o.blockedDomains)) return { ok: false, reason: 'a blocked domain' }
  url.hash = ''
  return { ok: true, url }
}

// ── robots.txt (RFC 9309) ──
type Rule = { allow: boolean; path: string }
export function robotsRules(txt: string, agent: string): Rule[] {
  const groups: { agents: string[]; rules: Rule[] }[] = []
  let current: { agents: string[]; rules: Rule[] } | null = null
  let lastWasAgent = false
  for (const rawLine of txt.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*/, '').trim()
    const m = /^([A-Za-z-]+)\s*:\s*(.*)$/.exec(line)
    if (!m) continue
    const key = m[1].toLowerCase(), value = m[2].trim()
    if (key === 'user-agent') {
      if (!current || !lastWasAgent) { current = { agents: [], rules: [] }; groups.push(current) }
      current.agents.push(value.toLowerCase())
      lastWasAgent = true
    } else if ((key === 'allow' || key === 'disallow') && current) {
      if (value) current.rules.push({ allow: key === 'allow', path: value })
      lastWasAgent = false
    } else lastWasAgent = false
  }
  const me = agent.toLowerCase()
  const mine = groups.filter((g) => g.agents.some((a) => a !== '*' && me.includes(a)))
  return (mine.length ? mine : groups.filter((g) => g.agents.includes('*'))).flatMap((g) => g.rules)
}

function ruleMatches(rule: string, path: string): number {
  // "*" any characters, "$" the end; the length of the rule is how specific it is
  const re = new RegExp(`^${rule.split('*').map((p) => p.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*').replace(/\\\$$/, '$')}`)
  return re.test(path) ? rule.length : -1
}

export function robotsAllow(rules: Rule[], pathAndQuery: string): boolean {
  let best = -1, allow = true
  for (const r of rules) {
    const n = ruleMatches(r.path, pathAndQuery)
    if (n > best || (n === best && r.allow)) { if (n >= 0) { best = n; allow = r.allow } }
  }
  return allow
}

// ── Reading a page ──
export interface PageInfo { title?: string; publisher?: string; publishedAt: string | null; modifiedAt: string | null; lang?: string; paywalled: boolean; noai: boolean; paragraphs: string[] }

const isoOf = (v: unknown): string | null => {
  if (typeof v !== 'string' || !v.trim()) return null
  const t = Date.parse(v.trim())
  return Number.isFinite(t) ? new Date(t).toISOString() : null
}

function attrs(tag: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const m of tag.matchAll(/([a-zA-Z:_-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/g)) out[m[1].toLowerCase()] = decodeEntities(m[3] ?? m[4] ?? m[5] ?? '')
  return out
}

// The part of a page between an opening tag and the last matching closing one (found with indexOf: cheap on a big page)
function between(html: string, lower: string, tag: string): string | null {
  const open = lower.indexOf(`<${tag}`)
  if (open < 0 || !/[\s>]/.test(lower[open + tag.length + 1] ?? '')) return null
  const close = lower.lastIndexOf(`</${tag}>`)
  return close > open ? html.slice(lower.indexOf('>', open) + 1, close) : null
}

const MAX_TEXT_HTML = 150_000 // of the article's HTML, the part that is read (its text is near the start)

export function readPage(html: string): PageInfo {
  const lower = html.toLowerCase()
  const bodyAt = lower.indexOf('<body')
  const head = html.slice(0, bodyAt > 0 ? bodyAt : 200_000)
  const meta = new Map<string, string>()
  for (const [tag] of head.matchAll(/<meta\b[^>]*>/gi)) {
    const a = attrs(tag)
    const key = (a.property ?? a.name ?? a.itemprop ?? '').toLowerCase()
    if (key && a.content !== undefined && !meta.has(key)) meta.set(key, a.content)
  }
  // JSON-LD (in the head or the body): the dates, the publisher, and whether the page says it is behind a paywall
  let ldPublished: string | null = null, ldModified: string | null = null, ldPublisher: string | undefined, ldHeadline: string | undefined, paywalled = false
  for (let at = lower.indexOf('application/ld+json'), n = 0; at >= 0 && n < 20; at = lower.indexOf('application/ld+json', at + 1), n++) {
    const start = lower.indexOf('>', at), end = lower.indexOf('</script>', start)
    if (start < 0 || end < 0) break
    let data: unknown
    try { data = JSON.parse(html.slice(start + 1, end).trim()) } catch { continue }
    const walk = (x: unknown, depth: number) => {
      if (depth > 6 || !x || typeof x !== 'object') return
      if (Array.isArray(x)) { x.forEach((y) => walk(y, depth + 1)); return }
      const o = x as Record<string, unknown>
      ldPublished ??= isoOf(o.datePublished)
      ldModified ??= isoOf(o.dateModified)
      ldHeadline ??= typeof o.headline === 'string' ? o.headline : undefined
      const pub = o.publisher as { name?: unknown } | undefined
      if (!ldPublisher && pub && typeof pub.name === 'string') ldPublisher = pub.name
      if (o.isAccessibleForFree === false || (typeof o.isAccessibleForFree === 'string' && o.isAccessibleForFree.toLowerCase() === 'false')) paywalled = true
      for (const k of ['@graph', 'mainEntity', 'hasPart']) if (o[k]) walk(o[k], depth + 1)
    }
    walk(data, 0)
  }
  const timeTag = html.slice(0, 400_000).match(/<time\b[^>]*\b(?:itemprop\s*=\s*["']datePublished["']|pubdate)[^>]*>/i)?.[0]
  const robots = `${meta.get('robots') ?? ''} ${meta.get('googlebot') ?? ''}`.toLowerCase()
  const title = meta.get('og:title') ?? ldHeadline ?? head.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]
  const publishedAt = isoOf(meta.get('article:published_time')) ?? ldPublished ?? isoOf(meta.get('datepublished')) ?? isoOf(meta.get('parsely-pub-date'))
    ?? isoOf(meta.get('pubdate')) ?? isoOf(meta.get('publish-date')) ?? isoOf(meta.get('dc.date.issued')) ?? (timeTag ? isoOf(attrs(timeTag).datetime) : null)
  const modifiedAt = isoOf(meta.get('article:modified_time')) ?? ldModified ?? isoOf(meta.get('og:updated_time')) ?? isoOf(meta.get('datemodified'))

  // The text: the article if the page marks one, else its main part, else the body; without scripts, menus, forms
  const region = (between(html, lower, 'article') ?? between(html, lower, 'main') ?? (bodyAt > 0 ? html.slice(bodyAt) : html)).slice(0, MAX_TEXT_HTML)
  const text = region.replace(/<(script|style|noscript|svg|template|iframe|form|nav|header|footer|aside|button|select)\b[\s\S]*?<\/\1>/gi, ' ')
  const paragraphs = cleanBlocks(text).filter((p) => p.length >= 40 || /\d/.test(p)).slice(0, 400)
  return {
    title: title ? decodeEntities(title).replace(/\s+/g, ' ').trim().slice(0, 300) : undefined,
    publisher: (meta.get('og:site_name') ?? ldPublisher)?.trim().slice(0, 120),
    publishedAt, modifiedAt,
    lang: head.match(/<html\b[^>]*\blang\s*=\s*["']?([\w-]+)/i)?.[1],
    paywalled,
    noai: /\bnoai\b/.test(robots),
    paragraphs,
  }
}

// The paragraphs that matter for the claims: the first two (the lead), then those with most of the claims' names, words
// and numbers, in the order of the page, up to `max` characters
export function excerptFor(paragraphs: string[], about: string[], max = 3000): string {
  const words = new Set(about.flatMap((a) => tokens(a)).filter((w) => w.length >= 4 || /\d/.test(w)))
  const scored = paragraphs.map((p, i) => {
    let s = 0
    for (const w of tokens(p)) if (words.has(w)) s += /\d/.test(w) ? 2 : 1
    return { p, i, s: i < 2 ? Infinity : s }
  })
  const picked: typeof scored = []
  let size = 0
  for (const x of [...scored].sort((a, b) => b.s - a.s || a.i - b.i)) {
    if (x.s === 0 || size + x.p.length > max) continue
    picked.push(x)
    size += x.p.length + 1
  }
  return picked.sort((a, b) => a.i - b.i).map((x) => x.p).join('\n')
}

// ── Fetching ──
type Fetch = typeof fetch

async function readCapped(res: Response, max: number): Promise<ArrayBuffer | null> {
  const length = Number(res.headers.get('content-length'))
  if (Number.isFinite(length) && length > max) { await res.body?.cancel(); return null }
  if (!res.body) return new ArrayBuffer(0)
  const reader = res.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > max) { await reader.cancel(); return null }
    chunks.push(value)
  }
  const out = new Uint8Array(size)
  let at = 0
  for (const c of chunks) { out.set(c, at); at += c.byteLength }
  return out.buffer
}

// A GET that follows at most 3 redirects, each to an address that passes checkUrl
async function safeGet(raw: string, o: WebOptions, accept: string, fetchFn: Fetch): Promise<{ res: Response; url: URL } | { error: PageStatus; url?: URL }> {
  let target = checkUrl(raw, o)
  for (let hop = 0; hop <= 3; hop++) {
    if (!target.ok) return { error: 'blocked-url' }
    let res: Response
    try {
      res = await fetchFn(target.url.toString(), {
        headers: { 'User-Agent': o.userAgent, Accept: accept, 'Accept-Language': 'pl,en;q=0.8' },
        redirect: 'manual', signal: AbortSignal.timeout(o.timeoutMs),
      })
    } catch (e) { return { error: (e as Error)?.name === 'TimeoutError' ? 'timeout' : 'network', url: target.url } }
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      await res.body?.cancel()
      let next: string
      try { next = new URL(res.headers.get('location')!, target.url).toString() } catch { return { error: 'blocked-url' } }
      target = checkUrl(next, o)
      continue
    }
    return { res, url: target.url }
  }
  return { error: 'blocked-url' }
}

export type RobotsCache = Map<string, Rule[] | 'all' | 'none'>

async function robotsFor(url: URL, o: WebOptions, cache: RobotsCache, fetchFn: Fetch): Promise<Rule[] | 'all' | 'none'> {
  const key = url.host
  const known = cache.get(key)
  if (known) return known
  const got = await safeGet(`https://${url.host}/robots.txt`, o, 'text/plain,*/*;q=0.5', fetchFn)
  let rules: Rule[] | 'all' | 'none'
  if ('error' in got) rules = 'none' // unreachable (or redirected somewhere not allowed): RFC 9309 says do not crawl
  else if (got.res.status >= 500) { await got.res.body?.cancel(); rules = 'none' }
  else if (got.res.status >= 400) { await got.res.body?.cancel(); rules = 'all' }
  else {
    const buf = await readCapped(got.res, 500_000)
    rules = buf ? robotsRules(new TextDecoder().decode(buf), o.userAgent.match(/SzczekaczkaBot/i)?.[0] ?? 'SzczekaczkaBot') : 'none'
  }
  cache.set(key, rules)
  return rules
}

export async function fetchPage(raw: string, about: string[], o: WebOptions, cache: RobotsCache, fetchFn: Fetch = fetch, now = Date.now()): Promise<Page> {
  const base = (u: URL | undefined, status: PageStatus, more: Partial<Page> = {}): Page => {
    const host = u?.hostname ?? (() => { try { return new URL(raw).hostname } catch { return '' } })()
    return { url: raw, finalUrl: u?.toString() ?? raw, host, domain: host ? registrableDomain(host) : '', status, fetchedAt: now, ...more }
  }
  const first = checkUrl(raw, o)
  if (!first.ok) return base(undefined, 'blocked-url')
  const robots = await robotsFor(first.url, o, cache, fetchFn)
  if (robots === 'none' || (robots !== 'all' && !robotsAllow(robots, first.url.pathname + first.url.search))) return base(first.url, 'robots')
  const got = await safeGet(first.url.toString(), o, 'text/html,application/xhtml+xml;q=0.9', fetchFn)
  if ('error' in got) return base(got.url ?? first.url, got.error)
  const { res, url } = got
  // A redirect to another site: its robots.txt has a say too
  if (url.host !== first.url.host) {
    const other = await robotsFor(url, o, cache, fetchFn)
    if (other === 'none' || (other !== 'all' && !robotsAllow(other, url.pathname + url.search))) { await res.body?.cancel(); return base(url, 'robots') }
  }
  if (res.status === 401 || res.status === 402 || res.status === 403 || res.status === 407) { await res.body?.cancel(); return base(url, 'restricted', { httpStatus: res.status }) }
  if (!res.ok) { await res.body?.cancel(); return base(url, 'http-error', { httpStatus: res.status }) }
  const type = res.headers.get('content-type') ?? ''
  if (!/text\/html|application\/xhtml\+xml/i.test(type)) { await res.body?.cancel(); return base(url, 'not-html', { httpStatus: res.status }) }
  if (/\bnoai\b/i.test(res.headers.get('x-robots-tag') ?? '')) { await res.body?.cancel(); return base(url, 'noai', { httpStatus: res.status }) }
  const buf = await readCapped(res, o.maxBytes)
  if (!buf) return base(url, 'too-large', { httpStatus: res.status })
  const info = readPage(decodeBody(buf, type))
  const dated = { title: info.title, publisher: info.publisher, publishedAt: info.publishedAt, modifiedAt: info.modifiedAt, lang: info.lang, httpStatus: res.status }
  if (info.paywalled) return base(url, 'paywall', dated)
  if (info.noai) return base(url, 'noai', dated)
  const excerpt = excerptFor(info.paragraphs, about)
  if (!excerpt) return base(url, 'empty', dated)
  return base(url, 'ok', { ...dated, excerpt })
}
