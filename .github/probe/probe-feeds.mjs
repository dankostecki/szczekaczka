// Temporary diagnostic: how the Bankier ESPI feed behaves (item count, turnover, gaps, caching)
const UA = 'Mozilla/5.0 (compatible; Szczekaczka/1.0; +https://github.com/dankostecki/szczekaczka)'
const H = { 'User-Agent': UA, Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*', 'Accept-Language': 'pl,en;q=0.8' }
const ESPI = 'https://www.bankier.pl/rss/espi.xml'
const items = (xml) => [...xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)].map(([, b]) => {
  const t = (n) => (b.match(new RegExp(`<${n}[^>]*>([\\s\\S]*?)</${n}>`, 'i'))?.[1] ?? '').replace(/<!\[CDATA\[|\]\]>/g, '').trim()
  return { title: t('title'), link: t('link') || t('guid'), pubDate: t('pubDate'), desc: t('description').length, order: b.slice(0, 200).replace(/\s+/g, ' ').match(/<(\w+)/g)?.slice(0, 6).join('') }
})
const hdr = (r, ...n) => n.map((k) => `${k}=${r.headers.get(k) ?? '-'}`).join(' ')
async function get(url, extra = {}) {
  const t0 = Date.now()
  const r = await fetch(url, { headers: { ...H, ...extra }, redirect: 'follow' })
  const body = r.status === 200 ? await r.text() : ''
  return { r, body, ms: Date.now() - t0 }
}

// 1. One look at the feed
let { r, body, ms } = await get(ESPI)
console.log(`ESPI status=${r.status} bytes=${body.length} ms=${ms} ${hdr(r, 'content-type', 'cache-control', 'age', 'etag', 'last-modified', 'expires', 'x-cache', 'cf-cache-status', 'server', 'via')}`)
let list = items(body)
console.log(`items=${list.length}; first item tag order: ${list[0]?.order}`)
for (const i of list) console.log(`  ${i.pubDate} | desc ${i.desc} | ${i.title.slice(0, 90)} | ${i.link.slice(-40)}`)
console.log('EQUNICO 9210030 in feed:', body.includes('9210030'))

// 2. Conditional GET right away: does it answer 304 when nothing changed?
const et = r.headers.get('etag'), lm = r.headers.get('last-modified')
if (et || lm) { const c = await get(ESPI, { ...(et ? { 'If-None-Match': et } : {}), ...(lm ? { 'If-Modified-Since': lm } : {}) }); console.log(`conditional: status=${c.r.status}`) }

// 3. Poll every 10 s for 6 minutes: turnover and gaps, plus conditional GET vs plain GET
let prev = new Set(list.map((i) => i.link)), prevEt = et, prevLm = lm
for (let n = 1; n <= 36; n++) {
  await new Promise((res) => setTimeout(res, 10_000))
  const [plain, cond] = await Promise.all([get(ESPI), get(ESPI, { ...(prevEt ? { 'If-None-Match': prevEt } : {}), ...(prevLm ? { 'If-Modified-Since': prevLm } : {}) })])
  const now = items(plain.body)
  const links = new Set(now.map((i) => i.link))
  const fresh = now.filter((i) => !prev.has(i.link))
  const overlap = now.filter((i) => prev.has(i.link)).length
  const span = now.length ? `${now.at(-1).pubDate} .. ${now[0].pubDate}` : ''
  const stale304 = cond.r.status === 304 && fresh.length > 0
  console.log(`#${n} status=${plain.r.status} items=${now.length} new=${fresh.length} overlap=${overlap}${overlap === 0 && prev.size ? ' GAP!' : ''} cond=${cond.r.status}${stale304 ? ' STALE-304!' : ''} ${hdr(plain.r, 'age', 'cache-control')} span ${span}`)
  for (const i of fresh) console.log(`    + ${i.pubDate} | ${i.title.slice(0, 90)}`)
  if (plain.r.status === 200) { prev = links; prevEt = plain.r.headers.get('etag'); prevLm = plain.r.headers.get('last-modified') }
}

// 4. Other places with ESPI/EBI reports: do they have a longer list?
const others = [
  'https://www.bankier.pl/rss/espi.xml?limit=50',
  'https://www.bankier.pl/rss/ebi.xml',
  'https://www.bankier.pl/rss/komunikaty.xml',
  'https://www.bankier.pl/gielda/wiadomosci/komunikaty-spolek',
  'https://www.bankier.pl/gielda/wiadomosci/komunikaty-spolek/2',
  'https://espiebi.pap.pl/rss.xml',
  'https://espiebi.pap.pl/rss',
  'https://espiebi.pap.pl/',
  'https://www.stockwatch.pl/rss/komunikaty.aspx',
  'https://www.stockwatch.pl/komunikaty-spolek/',
  'https://www.parkiet.com/rss/komunikaty-espi',
  'https://www.parkiet.com/komunikaty-espi',
  'https://www.gpw.pl/komunikaty-spolek',
  'https://biznes.pap.pl/espi',
]
for (const u of others) {
  try {
    const o = await get(u)
    const n = items(o.body).length
    const links = (o.body.match(/9210030|EQUNICO/gi) ?? []).length
    const rss = [...o.body.matchAll(/<link[^>]+type=["']application\/(rss|atom)\+xml["'][^>]*>/gi)].map((m) => m[0].match(/href=["']([^"']+)/)?.[1]).filter(Boolean)
    console.log(`${u} -> ${o.r.status} ${o.r.headers.get('content-type')} bytes=${o.body.length} items=${n} equnico=${links} rss-links=${rss.join(' ')}`)
  } catch (e) { console.log(`${u} -> ${e.message}`) }
}
