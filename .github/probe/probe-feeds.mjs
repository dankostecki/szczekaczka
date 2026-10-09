// Temporary diagnostic #4: is Bankier's report list page complete, and how is it built?
const UA = 'Mozilla/5.0 (compatible; Szczekaczka/1.0; +https://github.com/dankostecki/szczekaczka)'
async function get(url, accept = 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8') {
  const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: accept, 'Accept-Language': 'pl,en;q=0.8' } })
  return { r, body: await r.text() }
}
const hdr = (r) => ['content-type', 'cache-control', 'age', 'etag', 'last-modified', 'server', 'cf-cache-status'].map((k) => `${k}=${r.headers.get(k) ?? '-'}`).join(' ')
for (const u of ['https://www.bankier.pl/gielda/wiadomosci/komunikaty-spolek', 'https://www.bankier.pl/gielda/wiadomosci/komunikaty-spolek/2']) {
  const { r, body } = await get(u)
  console.log(`\n=== ${u} -> ${r.status} bytes=${body.length} ${hdr(r)}`)
  const links = [...body.matchAll(/href="(https:\/\/www\.bankier\.pl\/wiadomosc\/[^"]+-(\d{7})\.html)"/g)]
  const ids = [...new Set(links.map((m) => m[2]))]
  console.log(`report-like links: ${links.length}, unique ids: ${ids.length}; PRIME 9210077: ${body.includes('9210077')}, EQUNICO 9210030: ${body.includes('9210030')}`)
  const first = body.indexOf('/wiadomosc/')
  // first report entry's raw markup and where the list starts and ends
  const i = body.search(/href="https:\/\/www\.bankier\.pl\/wiadomosc\/[A-Z0-9]/)
  if (i >= 0) console.log('--- raw around the first company-report link:\n' + body.slice(Math.max(0, i - 1500), i + 1500))
  // all report titles with any nearby time
  for (const m of [...body.matchAll(/<a[^>]+href="https:\/\/www\.bankier\.pl\/wiadomosc\/([^"]+)"[^>]*>([\s\S]{0,300}?)<\/a>/g)].slice(0, 60)) {
    const text = m[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    if (text) console.log(`  ${m[1].slice(-12)} | ${text.slice(0, 110)}`)
  }
}
// The RSS now, for comparison
const rss = await get('https://www.bankier.pl/rss/espi.xml', 'application/rss+xml, */*')
console.log('\n=== RSS: ' + [...rss.body.matchAll(/<pubDate>([^<]+)<\/pubDate>/g)].map((m) => m[1].slice(17, 22)).join(' ') + ` | PRIME in RSS: ${rss.body.includes('9210077')}`)
// PAP from GitHub still works? (it fails from Cloudflare)
const pap = await get('https://biznes.pap.pl/espi')
console.log(`\n=== PAP from GitHub -> ${pap.r.status} bytes=${pap.body.length} ${hdr(pap.r)} PRIME: ${/prime/i.test(pap.body)}`)
