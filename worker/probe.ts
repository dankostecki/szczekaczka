// TEMPORARY (to be removed after the test): fetches a fixed list of market-data pages from
// Cloudflare and reports what came back, to see which sources let this server in.
// /api/probe-sources; no addresses come from the request, and one result is reused for 10 minutes.
export const PROBE_URLS: [string, string][] = [
  ['stooq-quotes', 'https://stooq.pl/q/l/?s=wig20+pkn+kgh+pko+usdpln+eurpln+chfpln+gbppln&f=sd2t2ohlcv&h&e=csv'],
  ['stooq-quotes-p', 'https://stooq.pl/q/l/?s=wig20+pkn+usdpln&f=sd2t2ohlcvp&h&e=csv'],
  ['stooq-wig20-page', 'https://stooq.pl/t/?i=532'],
  ['stooq-mwig40-page', 'https://stooq.pl/t/?i=533'],
  ['stooq-history', 'https://stooq.pl/q/d/l/?s=pkn&i=d'],
  ['nbp-table-a', 'https://api.nbp.pl/api/exchangerates/tables/A/last/2/?format=json'],
  ['bankier-akcje', 'https://www.bankier.pl/gielda/notowania/akcje'],
  ['bankier-forex', 'https://www.bankier.pl/waluty/kursy-walut/forex'],
  ['biznesradar-akcje', 'https://www.biznesradar.pl/gielda/akcje_gpw'],
  ['biznesradar-wig20', 'https://www.biznesradar.pl/gielda/indeks:WIG20'],
  ['yahoo-chart-pkn', 'https://query1.finance.yahoo.com/v8/finance/chart/PKN.WA?range=5d&interval=1d'],
  ['yahoo-chart-eurpln', 'https://query1.finance.yahoo.com/v8/finance/chart/EURPLN=X?range=1d&interval=5m'],
]
const UA = 'Mozilla/5.0 (compatible; Szczekaczka/1.0; +https://github.com/dankostecki/szczekaczka)'
let last: { at: number; body: string } | null = null

export async function probeSources(): Promise<Response> {
  if (last && Date.now() - last.at < 600_000) return new Response(last.body, { headers: { 'Content-Type': 'application/json' } })
  const results = await Promise.all(PROBE_URLS.map(async ([name, url]) => {
    const t0 = Date.now()
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: '*/*', 'Accept-Language': 'pl,en;q=0.8' }, signal: AbortSignal.timeout(15_000) })
      const body = await r.text()
      const text = body.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
      const at = Math.max(0, text.search(/ORLEN|PKN|KGHM|EUR\/PLN|EURPLN|USD/i))
      return { name, status: r.status, ms: Date.now() - t0, bytes: body.length, type: r.headers.get('content-type'),
        server: r.headers.get('server'), mitigated: r.headers.get('cf-mitigated'),
        title: body.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim().slice(0, 80) ?? null,
        start: body.slice(0, 300), around: text.slice(Math.max(0, at - 100), at + 500) }
    } catch (e) {
      return { name, error: String(e), ms: Date.now() - t0 }
    }
  }))
  last = { at: Date.now(), body: JSON.stringify({ at: new Date().toISOString(), results }, null, 1) }
  return new Response(last.body, { headers: { 'Content-Type': 'application/json' } })
}
