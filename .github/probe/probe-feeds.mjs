// Temporary diagnostic #2: where to get every ESPI/EBI report (listings, RSS, robots.txt)
const UA = 'Mozilla/5.0 (compatible; Szczekaczka/1.0; +https://github.com/dankostecki/szczekaczka)'
const BROWSER = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36'
async function get(url, ua = UA) {
  try {
    const r = await fetch(url, { headers: { 'User-Agent': ua, Accept: '*/*', 'Accept-Language': 'pl,en;q=0.8' }, redirect: 'follow' })
    return { status: r.status, type: r.headers.get('content-type'), cache: r.headers.get('cache-control'), age: r.headers.get('age'), url: r.url, body: await r.text() }
  } catch (e) { return { status: 'ERR ' + e.message, body: '' } }
}
const strip = (s) => s.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&#160;/g, ' ').replace(/\s+/g, ' ').trim()

// robots.txt
for (const host of ['https://espiebi.pap.pl', 'https://biznes.pap.pl', 'https://www.bankier.pl']) {
  const r = await get(host + '/robots.txt')
  console.log(`\n=== ${host}/robots.txt (${r.status})\n${r.body.slice(0, 1500)}`)
}

// RSS guesses, with our UA and a browser UA
const guesses = ['https://espiebi.pap.pl/rss.xml', 'https://espiebi.pap.pl/rss', 'https://espiebi.pap.pl/feed', 'https://espiebi.pap.pl/rss/espi', 'https://espiebi.pap.pl/espi/rss.xml',
  'https://biznes.pap.pl/rss', 'https://biznes.pap.pl/espi/rss', 'https://biznes.pap.pl/rss/espi', 'https://biznes.pap.pl/rss.xml', 'https://biznes.pap.pl/espi.xml']
for (const u of guesses) for (const ua of [UA, BROWSER]) {
  const r = await get(u, ua)
  console.log(`${u} [${ua === UA ? 'our UA' : 'browser UA'}] -> ${r.status} ${r.type} bytes=${r.body.length} items=${(r.body.match(/<item\b/gi) ?? []).length}`)
}

// Listings: structure around report links
for (const u of ['https://espiebi.pap.pl/', 'https://biznes.pap.pl/espi', 'https://www.bankier.pl/gielda/wiadomosci/komunikaty-spolek']) {
  const r = await get(u)
  console.log(`\n=== ${u} -> ${r.status} ${r.type} cache=${r.cache} age=${r.age} bytes=${r.body.length} final=${r.url}`)
  const rss = [...r.body.matchAll(/href=["']([^"']*(rss|feed|xml)[^"']*)["']/gi)].map((m) => m[1])
  console.log('rss-like hrefs:', [...new Set(rss)].slice(0, 15).join(' '))
  const i = r.body.search(/EQUNICO/i)
  if (i >= 0) console.log('--- raw around EQUNICO:\n' + r.body.slice(Math.max(0, i - 1500), i + 700))
  // all anchor hrefs that look like report pages
  const hrefs = [...r.body.matchAll(/href=["']([^"']+)["']/gi)].map((m) => m[1])
  const counts = {}
  for (const h of hrefs) { const k = h.replace(/[0-9]+/g, 'N').replace(/[?#].*$/, '').split('/').slice(0, 4).join('/'); counts[k] = (counts[k] ?? 0) + 1 }
  console.log('href patterns:', Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, v]) => `${v}× ${k}`).join(' | '))
  const text = strip(r.body)
  const j = text.search(/EQUNICO/i)
  console.log('--- text around EQUNICO:\n' + (j >= 0 ? text.slice(Math.max(0, j - 800), j + 800) : text.slice(0, 1500)))
}
