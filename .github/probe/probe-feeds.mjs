// Temporary diagnostic: Reuters sections through Google News search RSS (removed after use)
const UA = 'Mozilla/5.0 (compatible; Szczekaczka/1.0; +https://github.com/dankostecki/szczekaczka)'
const FEEDS = {
  MARKETS: 'https://news.google.com/rss/search?q=site:reuters.com/markets&hl=en-US&gl=US&ceid=US:en',
  BUSINESS: 'https://news.google.com/rss/search?q=site:reuters.com/business&hl=en-US&gl=US&ceid=US:en',
  WORLD: 'https://news.google.com/rss/search?q=site:reuters.com/world&hl=en-US&gl=US&ceid=US:en',
}
const tag = (b, n) => (b.match(new RegExp(`<${n}[^>]*>([\\s\\S]*?)</${n}>`, 'i'))?.[1] ?? '')
for (const [name, url] of Object.entries(FEEDS)) {
  const t0 = Date.now()
  const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/rss+xml, application/xml, */*' } })
  const body = await r.text()
  console.log(`\n=== ${name} ${r.status} ${body.length} B ${Date.now() - t0} ms ${['content-type', 'cache-control', 'etag', 'last-modified', 'expires'].map((k) => `${k}=${r.headers.get(k)}`).join(' ')}`)
  const items = [...body.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) => m[1])
  const dates = items.map((b) => Date.parse(tag(b, 'pubDate'))).filter(Boolean)
  const now = Date.now(), h = (x) => ((now - x) / 3600000).toFixed(1)
  console.log(`items ${items.length}; newest ${h(Math.max(...dates))} h ago, oldest ${h(Math.min(...dates))} h ago; within 24 h: ${dates.filter((d) => now - d < 86400000).length}; in order: ${dates.every((d, i) => i === 0 || dates[i - 1] >= d)}`)
  console.log('ages (h) in feed order:', dates.slice(0, 40).map(h).join(' '))
  if (name === 'MARKETS') {
    console.log('--- channel head:\n' + body.slice(0, body.indexOf('<item>')).slice(0, 1200))
    console.log('--- first two items raw:\n' + items.slice(0, 2).map((b) => `<item>${b}</item>`).join('\n'))
  }
  for (const b of items.slice(0, 6)) console.log(`  ${tag(b, 'pubDate')} | ${tag(b, 'title')} | src=${tag(b, 'source')} | guid=${tag(b, 'guid').slice(0, 40)}`)
  const titles = items.map((b) => tag(b, 'title'))
  console.log(`titles ending " - Reuters": ${titles.filter((t) => / - Reuters$/.test(t)).length}/${titles.length}; others: ${JSON.stringify(titles.filter((t) => !/ - Reuters$/.test(t)).slice(0, 5))}`)
}
// Where an article link leads without a browser
const first = (await (await fetch(FEEDS.MARKETS, { headers: { 'User-Agent': UA } })).text()).match(/<link>(https:\/\/news\.google\.com\/rss\/articles\/[^<]+)<\/link>/)?.[1]
if (first) {
  const r = await fetch(first, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36' }, redirect: 'manual' })
  const b = await r.text()
  console.log(`\n=== article link ${first.slice(0, 90)}… -> ${r.status} location=${r.headers.get('location')} bytes=${b.length} title=${b.match(/<title>([^<]*)/)?.[1]} has reuters url: ${(b.match(/https:\/\/www\.reuters\.com\/[^"'\s<]+/) || [])[0]}`)
}
