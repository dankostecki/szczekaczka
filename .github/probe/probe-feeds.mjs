// Temporary diagnostic #2: Google News search with when:1d (last day only) vs without (removed after use)
const UA = 'Mozilla/5.0 (compatible; Szczekaczka/1.0; +https://github.com/dankostecki/szczekaczka)'
const tag = (b, n) => (b.match(new RegExp(`<${n}[^>]*>([\\s\\S]*?)</${n}>`, 'i'))?.[1] ?? '')
for (const sec of ['markets', 'business', 'world']) for (const extra of ['', '+when:1d', '+when:2h']) {
  const url = `https://news.google.com/rss/search?q=site:reuters.com/${sec}${extra}&hl=en-US&gl=US&ceid=US:en`
  const r = await fetch(url, { headers: { 'User-Agent': UA } })
  const body = await r.text()
  const items = [...body.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) => m[1])
  const now = Date.now()
  const ages = items.map((b) => (now - Date.parse(tag(b, 'pubDate'))) / 3600000)
  const within = (h) => ages.filter((a) => a < h).length
  console.log(`${sec.padEnd(9)} ${extra.padEnd(9)} ${r.status} ${String(body.length).padStart(6)} B items ${String(items.length).padStart(3)}  <1h ${within(1)}  <3h ${within(3)}  <24h ${within(24)}  >48h ${ages.filter((a) => a > 48).length}  newest ${Math.min(...ages).toFixed(2)} h`)
}
