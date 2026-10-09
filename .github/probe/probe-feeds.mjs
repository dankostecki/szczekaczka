// Temporary diagnostic #5: markup of one entry of Bankier's report list, and where the list starts and ends
const UA = 'Mozilla/5.0 (compatible; Szczekaczka/1.0; +https://github.com/dankostecki/szczekaczka)'
const r = await fetch('https://www.bankier.pl/gielda/wiadomosci/komunikaty-spolek', { headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8', 'Accept-Language': 'pl,en;q=0.8' } })
const body = await r.text()
console.log(`status=${r.status} bytes=${body.length} last-modified=${r.headers.get('last-modified')} age=${r.headers.get('age')} etag=${r.headers.get('etag')}`)
const ids = [...body.matchAll(/https:\/\/www\.bankier\.pl\/wiadomosc\/[A-Za-z0-9-]+-(\d{7})\.html/g)]
const reports = ids.filter((m) => /^9\d{6}$/.test(m[1]) && m[1] !== '9208836')
const first = reports[0].index, last = reports.at(-1).index
console.log(`first report link at ${first}, last at ${last}, list spans ${last - first} chars`)
console.log('--- 2500 chars before the first report link:\n' + body.slice(first - 2500, first))
console.log('--- the first entry and the next one:\n' + body.slice(first, first + 3000))
console.log('--- after the last report link:\n' + body.slice(last, last + 1500))
// conditional request: does Bankier answer 304?
const lm = r.headers.get('last-modified')
if (lm) { const c = await fetch('https://www.bankier.pl/gielda/wiadomosci/komunikaty-spolek', { headers: { 'User-Agent': UA, 'If-Modified-Since': lm } }); console.log('conditional:', c.status) }
