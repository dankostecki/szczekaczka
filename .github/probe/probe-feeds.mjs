// Temporary diagnostic #3: completeness and delay of Bankier's ESPI RSS vs the PAP Biznes ESPI/EBI list
const UA = 'Mozilla/5.0 (compatible; Szczekaczka/1.0; +https://github.com/dankostecki/szczekaczka)'
async function get(url) {
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: '*/*', 'Accept-Language': 'pl,en;q=0.8' } })
    return { status: r.status, headers: r.headers, body: await r.text() }
  } catch (e) { return { status: 'ERR ' + e.message, headers: new Headers(), body: '' } }
}
const clean = (s) => s.replace(/<[^>]+>/g, ' ').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#0?39;/g, "'").replace(/\s+/g, ' ').trim()
const hhmm = () => new Date().toLocaleTimeString('pl-PL', { timeZone: 'Europe/Warsaw', hour: '2-digit', minute: '2-digit', second: '2-digit' })

// 1. Structure of the PAP lists (raw HTML of the first rows)
for (const u of ['https://biznes.pap.pl/espi', 'https://biznes.pap.pl/ebi', 'https://biznes.pap.pl/espi/ebi']) {
  const r = await get(u)
  const i = r.body.indexOf('/articles/espi/') >= 0 ? r.body.indexOf('/articles/espi/') : r.body.search(/\/articles\/ebi\//)
  console.log(`\n=== ${u} -> ${r.status} ${r.headers.get('content-type')} etag=${r.headers.get('etag')} last-modified=${r.headers.get('last-modified')} cache=${r.headers.get('cache-control')} bytes=${r.body.length}`)
  if (i >= 0) console.log(r.body.slice(Math.max(0, i - 1200), i + 1800))
}
const rss = await get('https://biznes.pap.pl/rss')
console.log('\n=== biznes.pap.pl/rss first items:\n' + [...rss.body.matchAll(/<item\b[\s\S]*?<\/item>/gi)].slice(0, 5).map((m) => m[0].slice(0, 400)).join('\n---\n'))

// 2. Poll both every 60 s for 20 minutes; note when each report shows up where
const papRows = (html) => {
  const out = new Map()
  for (const m of html.matchAll(/href="(\/articles\/(?:espi|ebi)\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)) {
    const t = clean(m[2]); if (t && !out.has(m[1])) out.set(m[1], t)
  }
  return out
}
const bankierRows = (xml) => new Map([...xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)].map(([, b]) => {
  const t = (n) => (b.match(new RegExp(`<${n}[^>]*>([\\s\\S]*?)</${n}>`, 'i'))?.[1] ?? '').replace(/<!\[CDATA\[|\]\]>/g, '').trim()
  return [t('link').replace(/\?.*$/, ''), `${t('pubDate').slice(17, 22)} ${clean(t('title'))}`]
}))
const firstSeen = { pap: new Map(), bankier: new Map() }
for (let n = 0; n < 20; n++) {
  const [p, b] = await Promise.all([get('https://biznes.pap.pl/espi'), get('https://www.bankier.pl/rss/espi.xml')])
  const pr = papRows(p.body), br = bankierRows(b.body)
  const newP = [...pr].filter(([k]) => !firstSeen.pap.has(k)), newB = [...br].filter(([k]) => !firstSeen.bankier.has(k))
  for (const [k, v] of newP) firstSeen.pap.set(k, `${hhmm()} ${v}`)
  for (const [k, v] of newB) firstSeen.bankier.set(k, `${hhmm()} ${v}`)
  console.log(`\n[${hhmm()}] PAP ${p.status} rows=${pr.size} new=${n ? newP.length : '-'} | Bankier ${b.status} items=${br.size} new=${n ? newB.length : '-'} age=${b.headers.get('age')}`)
  if (n) { for (const [, v] of newP) console.log(`   PAP+ ${v.slice(0, 140)}`); for (const [, v] of newB) console.log(`   BNK+ ${v.slice(0, 140)}`) }
  else { console.log('   PAP first rows: ' + [...pr.values()].slice(0, 12).map((v) => v.slice(0, 70)).join(' || ')); console.log('   Bankier: ' + [...br.values()].map((v) => v.slice(0, 60)).join(' || ')) }
  if (n < 19) await new Promise((r) => setTimeout(r, 60_000))
}
