// Temporary diagnostic #3: full calendar tables of a few days, as test fixtures (removed after use)
const UA = 'Mozilla/5.0 (compatible; Szczekaczka/1.0; +https://github.com/dankostecki/szczekaczka)'
for (const day of ['2026-10-6', '2026-10-7', '2026-10-8', '2026-10-9', '2026-10-10', '2026-10-13', '2026-10-14']) {
  const r = await fetch(`https://macronext.pl/pl/dane-makro/d/${day}`, { headers: { 'User-Agent': UA, 'Accept-Language': 'pl' } })
  const body = await r.text()
  const s = body.search(/<table[^>]*calendarfull/)
  const e = body.indexOf('</table>', s)
  console.log(`@@@BEGIN ${day} ${r.status} ${body.length}`)
  console.log(body.slice(s, e + 8))
  console.log(`@@@END ${day}`)
}
