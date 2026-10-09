// Temporary diagnostic: how MacroNext's calendar pages are built (removed after use)
const UA = 'Mozilla/5.0 (compatible; Szczekaczka/1.0; +https://github.com/dankostecki/szczekaczka)'
async function get(url, ua = UA) {
  const t0 = Date.now()
  try {
    const r = await fetch(url, { headers: { 'User-Agent': ua, Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8', 'Accept-Language': 'pl,en;q=0.8' } })
    return { r, body: await r.text(), ms: Date.now() - t0 }
  } catch (e) { return { r: null, body: '', ms: Date.now() - t0, err: e.message } }
}
const hdr = (r) => r ? `${r.status} ` + ['content-type', 'cache-control', 'age', 'etag', 'last-modified', 'server', 'cf-cache-status', 'set-cookie', 'vary'].map((k) => `${k}=${r.headers.get(k) ?? '-'}`).join(' ') : 'ERR'
const text = (s) => s.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()

const rb = await get('https://macronext.pl/robots.txt')
console.log('=== robots.txt', hdr(rb.r), '\n' + rb.body.slice(0, 1500))

for (const u of ['https://macronext.pl/pl/dane-makro/d/2026-10-9', 'https://macronext.pl/pl/dane-makro/d/2026-10-12', 'https://macronext.pl/pl/dane-makro/w/2026-10-5']) {
  const { r, body, ms, err } = await get(u)
  console.log(`\n\n=================== ${u} -> ${hdr(r)} bytes=${body.length} ms=${ms} ${err ?? ''} final=${r?.url}`)
  const t = body.search(/<table[^>]*calendarfull/i)
  console.log(`calendarfull at ${t}; <tr: ${(body.match(/<tr\b/gi) || []).length}; dow-wrap: ${(body.match(/dow-wrap/g) || []).length}; fa-align-justify: ${(body.match(/fa-align-justify/g) || []).length}; child: ${(body.match(/class="[^"]*child/g) || []).length}; holidayss: ${(body.match(/holidayss/g) || []).length}`)
  console.log('title:', body.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim())
  console.log('tz hints:', [...new Set((text(body).match(/.{0,60}(czas polski|CET|CEST|GMT|UTC|strefa czasowa|timezone).{0,60}/gi) || []))].slice(0, 8))
  console.log('scripts/xhr hints:', [...new Set(body.match(/["'](\/[^"']*(api|ajax|json|calendar|kalendarz|dane-makro)[^"']*)["']/gi) || [])].slice(0, 25))
  console.log('regulamin links:', [...new Set(body.match(/href="[^"]*(regulamin|terms|polityka|warunki)[^"]*"/gi) || [])])
  if (u.includes('/d/2026-10-9') || u.includes('/d/2026-10-12')) {
    if (t >= 0) {
      const end = body.indexOf('</table>', t)
      const table = body.slice(t, end + 8)
      console.log(`table bytes=${table.length}`)
      console.log('--- thead/th:', [...table.matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/gi)].map((m) => text(m[1])))
      console.log('--- RAW first 6000 chars of table:\n' + table.slice(0, 6000))
      console.log('--- ROWS (class | cells):')
      for (const m of table.matchAll(/<tr\b([^>]*)>([\s\S]*?)<\/tr>/gi)) {
        const cls = m[1].match(/class="([^"]*)"/)?.[1] ?? ''
        const cells = [...m[2].matchAll(/<td\b([^>]*)>([\s\S]*?)<\/td>/gi)].map((c) => {
          const cc = c[1].match(/class="([^"]*)"/)?.[1] ?? ''
          const imp = c[2].match(/fa-align-justify[^"]*"/)?.[0] ?? ''
          return `${cc ? '[' + cc + ']' : ''}${imp ? '{' + imp + '}' : ''}${text(c[2])}`
        })
        console.log(`<${cls}> ${cells.join(' | ')}`)
      }
      const inf = table.search(/Inflacja/)
      if (inf >= 0) console.log('--- RAW around Inflacja:\n' + table.slice(Math.max(0, inf - 2500), inf + 2500))
    } else {
      console.log('--- no table in HTML; page text start:\n' + text(body).slice(0, 2500))
      console.log('--- RAW body middle:\n' + body.slice(Math.floor(body.length / 3), Math.floor(body.length / 3) + 3000))
    }
  }
}
