// Temporary diagnostic #2: MacroNext robots/terms and a full week of rows (removed after use)
const UA = 'Mozilla/5.0 (compatible; Szczekaczka/1.0; +https://github.com/dankostecki/szczekaczka)'
const get = async (url) => { const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'pl' } }); return { r, body: await r.text() } }
const text = (s) => s.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/\s+/g, ' ').trim()
const rb = await get('https://macronext.pl/robots.txt')
console.log('=== robots.txt', rb.r.status, rb.r.headers.get('content-type'), '\n' + rb.body.slice(0, 2000))
const reg = await get('https://macronext.pl/pl/regulamin')
const t = text(reg.body)
console.log('\n=== regulamin', reg.r.status, t.length)
const hits = new Set()
for (const m of t.matchAll(/[^.]{0,300}(kopiow|rozpowszechn|wykorzyst|automatyczn|robot|scrap|komercyjn|prawa autorsk|utwor|baz[ay] danych|dane makro|kalendar|udostępni|cytow|źródł)[^.]{0,300}\./gi)) hits.add(m[0].trim())
console.log([...hits].slice(0, 30).join('\n---\n'))
for (const u of ['https://macronext.pl/pl/dane-makro/d/2026-10-9', 'https://macronext.pl/pl/dane-makro/d/2026-10-09', 'https://macronext.pl/pl/dane-makro/d/2026-10-10']) {
  const { r, body } = await get(u)
  console.log(`\n=== ${u} -> ${r.status} bytes=${body.length} rows=${(body.match(/<tr\b/g) || []).length} dow=${(body.match(/class="dow"[^<]*<strong><a[^>]*>([^<]*)/) || [])[1]}`)
}
for (const u of ['https://macronext.pl/pl/dane-makro/w/2026-10-5', 'https://macronext.pl/pl/dane-makro/w/2026-10-12', 'https://macronext.pl/pl/dane-makro/w/2026-9-28']) {
  const { body } = await get(u)
  const table = body.slice(body.search(/<table[^>]*calendarfull/i))
  console.log(`\n=== ${u}`)
  for (const m of table.matchAll(/<tr\b([^>]*)>([\s\S]*?)<\/tr>/gi)) {
    const cls = m[1].match(/class="([^"]*)"/)?.[1] ?? ''
    const cells = [...m[2].matchAll(/<td\b([^>]*)>([\s\S]*?)<\/td>/gi)].map((c) => {
      const cc = c[1].match(/class="([^"]*)"/)?.[1] ?? ''
      const imp = c[2].match(/fa-align-justify (\w+)/)?.[1] ?? ''
      return `${cc && cc !== 'impdate' ? '[' + cc + ']' : ''}${imp ? '{' + imp + '}' : ''}${text(c[2])}`
    })
    if (cells.length) console.log(`${cls ? '<' + cls + '> ' : ''}${cells.join(' | ')}`)
  }
}
