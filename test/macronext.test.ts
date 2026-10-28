// The morning's repeat of MacroNext's calendars (7:30 macro, 7:35 GPW, 7:40 American results before and after the session):
// when, what is in them, that what was announced at its own time stays, and that they are said right
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DIGEST_AT, dayGroups, groupTitle, macroSpoken, morningMacro, stockGroups, type MacroRow, type StockRow } from '../src/lib/macronext'
import { splitItem } from '../src/lib/body'
import { finalizeItems, warsawToUtc, type NewsItem } from '../src/lib/parse'
import { FEEDS } from '../src/lib/sources'
import { withTime } from '../src/lib/news'
import { checkMacro, macroDueAt, MACRO_VERSION } from '../worker/macro'
import type { FeedState } from '../worker/feeds'

const row = (time: string, country: string, title: string, more: Partial<MacroRow> = {}): MacroRow =>
  ({ time, country, importance: 'wysoka', title, period: 'wrzesień', forecast: '', previous: '', children: [], ...more })
const MACRO_ROWS: MacroRow[] = [
  row('03:30', 'Chiny', 'PMI dla przemysłu', { forecast: '50,2', previous: '50,1' }),
  row('07:30', 'Francja', 'Produkcja przemysłowa (m/m)', { forecast: '0,3%', previous: '-0,1%' }),
  row('14:30', 'Kanada', 'Stopa bezrobocia', { forecast: '6,5%', previous: '6,4%' }),
  row('14:30', 'USA', 'Zamówienia na dobra trwałe (m/m)', { forecast: '0,5%', previous: '0,2%' }),
  row('20:00', 'USA', 'Wystąpienie szefowej Fed z Bostonu (Susan Collins)', { importance: 'srednia', period: '' }),
  row('', 'Chiny', 'Handel zagraniczny'),
  row('09:00', 'Węgry', 'Sprzedaż detaliczna', { importance: 'niska' }), // not announced
]
const STOCK_ROWS: StockRow[] = [
  { company: 'LPP', market: 'GPW', time: '', event: 'Dzień ustalenia prawa do dywidendy 500 zł na akcję.' },
  { company: 'GREENZEB', market: 'NC', time: '', event: 'NWZA ws. zmiany statutu.' },
  { company: 'PepsiCo', market: 'NYSE', time: 'przed sesją', event: 'Publikacja raportu za III kwartał 2026 roku.' },
  { company: 'Citigroup', market: 'NYSE', time: 'przed sesją', event: 'Publikacja raportu za III kwartał 2026 roku.' },
  { company: 'Netflix', market: 'NASDAQ', time: 'po sesji', event: 'Publikacja raportu za III kwartał 2026 roku.' },
  { company: 'Tesco', market: 'LSE', time: '', event: 'Publikacja raportu za I półrocze.' },
]
const clock = (t: number) => new Date(t).toLocaleTimeString('pl-PL', { timeZone: 'Europe/Warsaw', hour: '2-digit', minute: '2-digit' })

test('the times are Polish, whatever the season: 7:30, 7:35 and 7:40 in winter and in summer time', () => {
  assert.deepEqual(DIGEST_AT, { macro: [7, 30], gpw: [7, 35], usa: [7, 40] })
  for (const [y, m, d, offset] of [[2026, 10, 28, 1], [2026, 10, 24, 2], [2026, 3, 30, 2], [2026, 3, 27, 1], [2026, 7, 15, 2]] as const) {
    const macro = dayGroups(MACRO_ROWS, 'MACRONEXT:MAKRO', y, m, d).find((g) => g.digest)!
    const stock = stockGroups(STOCK_ROWS, 'MACRONEXT:GIEŁDA', y, m, d).filter((g) => g.digest)
    assert.equal(macro.at, Date.UTC(y, m - 1, d, 7 - offset, 30), `macro ${y}-${m}-${d}`)
    assert.deepEqual(stock.map((g) => [g.id.split(':').pop(), clock(g.at)]), [['gpw-rano', '07:35'], ['usa-rano', '07:40']])
  }
})

test('the macro digest: what is ahead (from its time) and what has no time, in order, with country and time; nothing already out', () => {
  const groups = dayGroups(MACRO_ROWS, 'MACRONEXT:MAKRO', 2026, 10, 28)
  const digest = groups.find((g) => g.digest)!
  assert.equal(digest.id, 'MACRONEXT:MAKRO:2026-10-28:rano')
  assert.equal(digest.title, 'Dziś w kalendarium makro')
  assert.equal(groupTitle(digest), 'Dziś w kalendarium makro')
  assert.deepEqual(digest.lines, [
    '7:30 Francja: Produkcja przemysłowa miesiąc do miesiąca za wrzesień, konsensus 0,3%, poprzednio -0,1%.',
    '14:30 Kanada: Stopa bezrobocia za wrzesień, konsensus 6,5%, poprzednio 6,4%.',
    '14:30 USA: Zamówienia na dobra trwałe miesiąc do miesiąca za wrzesień, konsensus 0,5%, poprzednio 0,2%.',
    '20:00 Wystąpienie szefowej Fed z Bostonu (Susan Collins)',
    'Bez godziny Chiny: Handel zagraniczny za wrzesień.',
  ])
  // the Chinese PMI (3:30) was announced at its time and is not in it; neither is the data not announced at all (Hungary)
  assert.ok(!digest.lines.some((l) => /PMI|Węgry|Sprzedaż detaliczna/.test(l)))
  assert.equal(groups.filter((g) => !g.digest).length, 5, 'the announcements at their own times are all there: 03:30, 07:30, 14:30, 20:00 and the one without a time')
  assert.equal(digest.until! - digest.at, 45 * 60_000)
})

test('the macro digest said: each release as a part with its time in words, then its rows', () => {
  const digest = dayGroups(MACRO_ROWS, 'MACRONEXT:MAKRO', 2026, 10, 28).find((g) => g.digest)!
  assert.deepEqual(digest.say!.filter((p) => /^(O |Bez )/.test(p)), [
    'O godzinie siódmej trzydzieści dane makro z Francji.',
    'O godzinie czternastej trzydzieści dane makro z Kanady i USA.',
    'O godzinie dwudziestej wystąpienie szefowej Fed z Bostonu (Susan Collins).',
    'Bez podanej godziny: dane makro z Chin.',
  ])
  assert.ok(digest.say!.includes('Kanada: Stopa bezrobocia za wrzesień, konsensus 6,5%, poprzednio 6,4%.'), 'rows as in the announcement (a country in front where it changes)')
})

test('no digest when nothing is left for the day, or nothing is announced at all', () => {
  const early = [row('03:30', 'Chiny', 'PMI dla przemysłu'), row('06:00', 'Niemcy', 'Zamówienia w przemyśle')]
  assert.ok(!dayGroups(early, 'MACRONEXT:MAKRO', 2026, 10, 28).some((g) => g.digest))
  assert.ok(!dayGroups([], 'MACRONEXT:MAKRO', 2026, 10, 28).some((g) => g.digest))
  assert.equal(morningMacro([], 'MACRONEXT:MAKRO', 2026, 10, 28), null)
  // only a release without a time: it is in
  assert.ok(dayGroups([row('', 'Chiny', 'Handel zagraniczny')], 'MACRONEXT:MAKRO', 2026, 10, 28).some((g) => g.digest))
})

test('the Warsaw session is announced once, at 7:35 (there is none at 8:50), and still up to its opening at 9:00', () => {
  const groups = stockGroups(STOCK_ROWS, 'MACRONEXT:GIEŁDA', 2026, 10, 28)
  const gpw = groups.filter((g) => /gpw/.test(g.id))
  assert.deepEqual(gpw.map((g) => g.id.split(':').pop()), ['gpw-rano'])
  const [digest] = gpw
  assert.equal(clock(digest.at), '07:35')
  assert.equal(clock(digest.until!), '09:00')
  assert.equal(digest.title, 'Dziś na giełdzie GPW i NewConnect')
  assert.deepEqual(digest.lines, ['LPP: Dzień ustalenia prawa do dywidendy 500 zł na akcję.', 'GREENZEB: NWZA ws. zmiany statutu.'])
  assert.deepEqual(digest.say, ['Spółka LPP, Dzień ustalenia prawa do dywidendy 500 zł na akcję.', 'Spółka GREENZEB, NWZA ws. zmiany statutu.'])
  assert.equal(digest.digest, true)
  // without Polish rows: none
  assert.ok(!stockGroups(STOCK_ROWS.filter((r) => r.market === 'NYSE'), 'k', 2026, 10, 28).some((g) => g.id.includes('gpw')))
  assert.equal(stockGroups(STOCK_ROWS.filter((r) => r.market === 'NC'), 'k', 2026, 10, 28).find((g) => g.digest)!.title, 'Dziś na NewConnect')
})

test('American results at 7:40: before and after the session in one, each under its own heading', () => {
  const groups = stockGroups(STOCK_ROWS, 'MACRONEXT:GIEŁDA', 2026, 10, 28)
  const digest = groups.find((g) => g.id.endsWith(':usa-rano'))!
  assert.equal(digest.title, 'Dziś na NYSE i Nasdaq przed sesją i po sesji')
  assert.deepEqual(digest.lines, [
    'Przed sesją: Raport za III kwartał 2026 roku opublikują: PepsiCo i Citigroup.',
    'Po sesji: Raport za III kwartał 2026 roku opublikuje: Netflix.',
  ])
  assert.deepEqual(digest.say, [
    'Przed sesją.', 'Raport za III kwartał 2026 roku opublikują PepsiCo i Citigroup.',
    'Po sesji.', 'Raport za III kwartał 2026 roku opublikuje Netflix.',
  ])
  // the two announcements at their own times are there as before
  assert.deepEqual(groups.filter((g) => !g.digest && /usa/.test(g.id)).map((g) => [g.id.split(':').pop(), g.title]), [['usa-przed', 'Dziś na NYSE przed sesją'], ['usa-po', 'Dziś na Nasdaq po sesji']])
  // only one of them: its title, no headings
  const before = stockGroups(STOCK_ROWS.filter((r) => r.market !== 'NASDAQ'), 'k', 2026, 10, 28).find((g) => g.id.endsWith('usa-rano'))!
  assert.equal(before.title, 'Dziś na NYSE przed sesją')
  assert.ok(before.lines.every((l) => !/^Przed sesją:/.test(l)) && !before.say!.includes('Przed sesją.'))
  const after = stockGroups(STOCK_ROWS.filter((r) => r.market === 'NASDAQ'), 'k', 2026, 10, 28).find((g) => g.id.endsWith('usa-rano'))!
  assert.equal(after.title, 'Dziś na Nasdaq po sesji')
  assert.ok(!stockGroups(STOCK_ROWS.filter((r) => r.market === 'GPW'), 'k', 2026, 10, 28).some((g) => g.id.includes('usa')))
})

// ── End to end: the page read, the announcements made at their times ──
const macroPage = (y: number, m: number, d: number, rows: MacroRow[]) => `<html><body><table class="tabdata calendarfull">
  <tr><td colspan="7"><a href="/pl/dane-makro/d/${y}-${m}-${d}">dziś</a></td></tr>
  ${rows.map((r) => `<tr><td>${r.time || '?'}</td><td>${r.country}</td><td><i class="fa-align-justify ${({ wysoka: 'higw', srednia: 'medw', niska: 'loww', nieznana: '' })[r.importance]}"></i>${r.title}</td><td>${r.period}</td><td></td><td>${r.forecast}</td><td>${r.previous}</td></tr>`).join('')}
</table></body></html>`
const stockPage = (y: number, m: number, d: number, rows: StockRow[]) => `<html><body><table class="company-agenda tabdata">
  <tr><td colspan="5"><a href="/pl/kalendarium/d/${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}/">dziś</a></td></tr>
  ${rows.map((r) => `<tr><td>${r.company}</td><td>${r.company}.X</td><td>${r.market}</td><td>${r.time}</td><td>${r.event}</td></tr>`).join('')}
</table></body></html>`

const [MAKRO, GIELDA] = [FEEDS.find((f) => f.format === 'macronext')!, FEEDS.find((f) => f.format === 'macronext-gielda')!]
const W = (hhmm: string, day = 28) => { const [h, mi] = hhmm.split(':').map(Number); return warsawToUtc(2026, 10, day, h, mi) }

async function run(feed: typeof MAKRO, page: string, times: string[]): Promise<{ at: string; items: NewsItem[] }[]> {
  const real = globalThis.fetch
  globalThis.fetch = (async () => new Response(page, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })) as typeof fetch
  try {
    let state: FeedState | undefined
    const out: { at: string; items: NewsItem[] }[] = []
    for (const t of times) {
      const r = await checkMacro(feed, state, feed.url, W(t))
      state = r.state
      if (r.add.length) out.push({ at: t, items: r.add })
    }
    return out
  } finally { globalThis.fetch = real }
}
// the checks the poller would make: every minute, from the morning reading to the afternoon
const minutes = (from: string, to: string) => { const out: string[] = []; for (let t = W(from); t <= W(to); t += 60_000) out.push(clock(t)); return out }

test('the poller makes them at 7:30, 7:35 and 7:40, once each, beside the announcements at their own times', async () => {
  const macro = await run(MAKRO, macroPage(2026, 10, 28, MACRO_ROWS), ['06:30', ...minutes('07:00', '20:30')])
  const bySlot = Object.fromEntries(macro.map((x) => [x.at, x.items.map((i) => i.title)]))
  assert.deepEqual(bySlot['07:30'], ['Dziś w kalendarium makro'])
  assert.ok(macro.some((x) => x.at === '14:20' && x.items.some((i) => /^Za 10 minut o godzinie 14:30 dane makro z Kanady i USA/.test(i.title))), 'the release at 14:30 is announced as before')
  assert.ok(macro.some((x) => x.at === '07:20' && x.items.some((i) => /^Za 10 minut o godzinie 7:30 dane makro z Francji/.test(i.title))), 'and the one at 7:30')
  assert.equal(macro.flatMap((x) => x.items).filter((i) => i.title === 'Dziś w kalendarium makro').length, 1, 'once')
  const stock = await run(GIELDA, stockPage(2026, 10, 28, STOCK_ROWS), ['06:30', ...minutes('07:00', '23:00')])
  assert.deepEqual(stock.map((x) => [x.at, x.items.map((i) => i.title)]), [
    ['07:35', ['Dziś na giełdzie GPW i NewConnect']],
    ['07:40', ['Dziś na NYSE i Nasdaq przed sesją i po sesji']],
    // 5:15 and 15:55 in New York: this week the USA is still on summer time and Poland is not, so 10:15 and 20:55 here
    ['10:15', ['Dziś na NYSE przed sesją']],
    ['20:55', ['Dziś na Nasdaq po sesji']],
  ])
})

test('every announcement has a link of its own, so that none of them is taken for another when the list is put together', async () => {
  const day = [row('07:30', 'Francja', 'Produkcja przemysłowa (m/m)', { forecast: '0,3%' }), row('14:30', 'USA', 'Zamówienia na dobra trwałe')]
  const made = (await run(MAKRO, macroPage(2026, 10, 28, day), ['06:30', ...minutes('07:00', '14:40')])).flatMap((x) => x.items)
  const links = made.map((i) => i.link)
  assert.equal(new Set(links).size, links.length, links.join('\n'))
  assert.ok(links.some((l) => l.endsWith('#2026-10-28-07:30-rano')))
  assert.ok(links.some((l) => l.endsWith('#2026-10-28-07:30')), 'a release at the same time as the digest')
  assert.equal(finalizeItems(made).length, made.length, 'none dropped as a duplicate')
})

test('the same for the stock calendar: the morning pieces and the two American ones have links of their own', async () => {
  const made = (await run(GIELDA, stockPage(2026, 10, 28, STOCK_ROWS), ['06:30', ...minutes('07:00', '23:00')])).flatMap((x) => x.items)
  assert.equal(made.length, 4)
  assert.equal(new Set(made.map((i) => i.link)).size, 4, made.map((i) => i.link).join('\n'))
  assert.equal(finalizeItems(made).length, 4)
})

test('found late: the digests are still made for 45 minutes, the Warsaw one up to the opening of the session; later none (the American ones of their own go on)', async () => {
  const titles = async (at: string) => ((await run(GIELDA, stockPage(2026, 10, 28, STOCK_ROWS), [at]))[0]?.items ?? []).map((i) => i.title).sort()
  assert.deepEqual(await titles('08:10'), ['Dziś na NYSE i Nasdaq przed sesją i po sesji', 'Dziś na giełdzie GPW i NewConnect'].sort())
  assert.deepEqual(await titles('08:50'), ['Dziś na giełdzie GPW i NewConnect'], 'the Warsaw session is not open yet; the American digest is past its 45 minutes')
  assert.deepEqual(await titles('09:30'), [], 'the session is open: it is not "before the session" any more')
})

test('the 8:50 announcement left in the state of an older version is dropped by the reading made at once, so it is not made today', async () => {
  const real = globalThis.fetch
  globalThis.fetch = (async () => new Response(stockPage(2026, 10, 28, STOCK_ROWS), { headers: { 'Content-Type': 'text/html; charset=utf-8' } })) as typeof fetch
  try {
    const stale = { id: 'MACRONEXT:GIEŁDA:2026-10-28:gpw', at: W('08:50'), day: '2026-10-28', countries: [], lines: ['LPP: …'], title: 'Dziś na giełdzie GPW i NewConnect', until: W('10:50') }
    const old: FeedState = { items: [], error: null, checkedAt: W('06:30'), parser: MACRO_VERSION - 1, calendar: [stale] }
    assert.equal(macroDueAt(old), 0)
    const r = await checkMacro(GIELDA, old, GIELDA.url, W('07:36'))
    assert.ok(!r.state.calendar!.some((g) => g.id.endsWith(':gpw')))
    assert.deepEqual(r.add.map((i) => i.title), ['Dziś na giełdzie GPW i NewConnect'], 'the one of the morning, at 7:36')
    const later = await checkMacro(GIELDA, r.state, GIELDA.url, W('08:51'))
    assert.deepEqual(later.add, [])
  } finally { globalThis.fetch = real }
})

test('state kept before this change (an older reading) is read again at once, so that the digests are there today', () => {
  const old: FeedState = { items: [], error: null, checkedAt: W('06:30'), parser: MACRO_VERSION - 1, calendar: [] }
  assert.equal(macroDueAt(old), 0)
  assert.ok(macroDueAt({ ...old, parser: MACRO_VERSION }) > W('06:30'))
})

test('in the reading window a row of the digest has its time and country as the label, with the figures beside it', () => {
  assert.deepEqual(splitItem('14:30 Kanada: Stopa bezrobocia za wrzesień, konsensus 6,5%, poprzednio 6,4%.', 'MACRONEXT'),
    { label: '14:30 Kanada', text: 'Stopa bezrobocia za wrzesień', figures: [{ name: 'konsensus', value: '6,5%' }, { name: 'poprzednio', value: '6,4%' }] })
  assert.equal(splitItem('7:30 Francja: Produkcja przemysłowa miesiąc do miesiąca za wrzesień', 'MACRONEXT').label, '7:30 Francja')
  assert.equal(splitItem('20:00 Wystąpienie szefowej Fed z Bostonu (Susan Collins)', 'MACRONEXT').label, undefined)
  assert.equal(splitItem('Przed sesją: Raport za III kwartał 2026 roku opublikują: PepsiCo i Citigroup.', 'MACRONEXT').label, 'Przed sesją')
  // other sources keep the rule they had
  assert.equal(splitItem('10:15 Foo: bar', 'STOOQ').label, undefined)
})

test('said: the title and the rows, with the hours in words and the exchange by name', async () => {
  const macro = await run(MAKRO, macroPage(2026, 10, 28, MACRO_ROWS), ['06:30', '07:30'])
  const item = withTime(macro.find((x) => x.at === '07:30')!.items.find((i) => i.title === 'Dziś w kalendarium makro')!)
  const text = macroSpoken(item, true, W('07:30')).join(' | ')
  assert.match(text, /^Dziś w kalendarium makro/)
  assert.match(text, /O godzinie czternastej trzydzieści dane makro z Kanady i USA/)
  assert.match(text, /O godzinie dwudziestej wystąpienie szefowej Fed/)
  const stock = await run(GIELDA, stockPage(2026, 10, 28, STOCK_ROWS), ['06:30', '07:40'])
  const us = withTime(stock.flatMap((x) => x.items).find((i) => /NYSE/.test(i.title))!)
  const said = macroSpoken(us, true, W('07:40')).join(' | ')
  assert.match(said, /^Dziś na nowojorskiej giełdzie i Nasdak przed sesją i po sesji/) // the voice's spelling of Nasdaq, as everywhere
  assert.match(said, /Przed sesją/)
  assert.match(said, /Po sesji/)
})
