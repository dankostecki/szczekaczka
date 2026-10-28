// MacroNext's calendars for today: macro data (macronext.pl/pl/kalendarium-dzis), what is released
// when, announced 10 minutes before; and the stock market (macronext.pl/pl/dzis-na-gieldzie),
// announced before the sessions. Shared by the Cloudflare Worker (worker/macro.ts) and the page
// (how it is read aloud).
import { cleanText, newYorkToUtc, warsawToUtc } from './parse'
import { sayAloudParts } from './say'

// How long before the release the announcement goes out
export const LEAD_MINUTES = 10
// When the server reads the pages, Polish time: after midnight, when they show the new day, and
// again in the morning, for consensus figures added since
export const FETCH_TIMES: [number, number][] = [[0, 30], [6, 30]]
export const fetchTimesText = () => FETCH_TIMES.map(([h, m]) => `${h}:${String(m).padStart(2, '0')}`).join(' i ')

export interface MacroRow {
  time: string      // "14:30"; '' when the source gives none ("?")
  country: string
  importance: 'wysoka' | 'srednia' | 'niska' | 'nieznana'
  title: string
  period: string    // "wrzesień", "II kw.", "tydzień"
  forecast: string  // the source's "Prognoza", read as the consensus
  previous: string
  children: MacroRow[] // the parts of a report ("Inflacja konsumencka": CPI r/r, core CPI r/r…)
}

const IMPORTANCE = { higw: 'wysoka', medw: 'srednia', loww: 'niska' } as const
const cell = (html: string) => cleanText(html).replace(/\s+%/g, '%')

// The rows of the day's table, reports with their parts. null when the page has no calendar
// table or is for another day (the source moved us elsewhere).
export function parseDay(html: string, y: number, m: number, d: number): MacroRow[] | null {
  const start = html.search(/<table[^>]*\bcalendarfull\b/)
  if (start < 0) return null
  const end = html.indexOf('</table>', start)
  const table = html.slice(start, end < 0 ? undefined : end)
  const day = table.match(/dane-makro\/d\/(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (day && (+day[1] !== y || +day[2] !== m || +day[3] !== d)) return null
  const rows: MacroRow[] = []
  let parent: MacroRow | null = null
  for (const tr of table.matchAll(/<tr\b([^>]*)>([\s\S]*?)<\/tr>/gi)) {
    if (/holiday/i.test(tr[1])) continue
    const tds = [...tr[2].matchAll(/<td\b([^>]*)>([\s\S]*?)<\/td>/gi)]
    if (tds.length !== 7) continue
    const imp = tds[2][2].match(/fa-align-justify\s+(higw|medw|loww)/)?.[1] as keyof typeof IMPORTANCE | undefined
    const time = cell(tds[0][2]).match(/\d{1,2}:\d{2}/)?.[0] ?? ''
    const row: MacroRow = {
      time: time && time.padStart(5, '0'),
      country: cell(tds[1][2]).replace(/^Wlk\. Brytania$/, 'Wielka Brytania'),
      importance: imp ? IMPORTANCE[imp] : 'nieznana',
      title: cell(tds[2][2]),
      period: cell(tds[3][2]),
      forecast: cell(tds[5][2]),
      previous: cell(tds[6][2]),
      children: [],
    }
    if (!row.title) continue
    if (/\bchild\b/.test(tds[2][1]) && parent) {
      // A part of the report above: its time, country and importance
      parent.children.push({ ...row, time: row.time || parent.time, country: parent.country, importance: parent.importance })
    } else {
      parent = row
      rows.push(row)
    }
  }
  return rows
}

// ── Which rows are announced (as in MacroNext_AGENT_INSTRUCTIONS.md) ──

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l')

// Central-bank events are announced whatever their importance and country
const BANK_PHRASES = ['bank centraln', 'banku centraln', 'polityk monetarn', 'polityki monetarn', 'stop procentow', 'stopy procentow',
  'stopa procentow', 'stopa referencyjn', 'protokol z posiedzenia', 'konferencja prasowa', 'decyzja banku', 'bundesbank', 'riksbank',
  'norges bank', 'banxico', 'bank rosji', 'bank japonii', 'bank anglii', 'bank kanady', 'bank korei', 'ludowy bank chin', 'bezowa ksiega']
const BANK_NAMES = ['fed', 'fomc', 'ecb', 'ebc', 'boe', 'boc', 'snb', 'rba', 'rbnz', 'cnb', 'rpp', 'nbp', 'boj', 'pboc', 'rbi', 'bcb', 'sarb',
  'mnb', 'nbr', 'nbs', 'bok', 'tcmb']
const BANK_WORD = new RegExp(`(^|[^a-z])(${BANK_NAMES.join('|')})(?![a-z])`)

export function centralBank(title: string): boolean {
  const t = norm(title)
  return BANK_PHRASES.some((p) => t.includes(p)) || BANK_WORD.test(t)
}

// Ordinary data from these countries is left out
const SKIPPED_COUNTRIES = ['wegry', 'rumunia', 'czechy', 'slowacja']

export function announced(row: MacroRow, parentTitle = ''): boolean {
  const bank = centralBank(row.title) || (parentTitle !== '' && centralBank(parentTitle))
  if (bank) return true
  if (row.importance !== 'wysoka' && row.importance !== 'srednia') return false
  return !SKIPPED_COUNTRIES.includes(norm(row.country))
}

// ── How a row is said ──

const QUALIFIERS: [RegExp, string][] = [
  [/(^|\s)n\.s\.a\.(?=\s|$)/g, ', dane niewyrównane sezonowo,'],
  [/(^|\s)s\.a\.(?=\s|$)/g, ', dane wyrównane sezonowo,'],
  [/(^|\s)w\.d\.a\.(?=\s|$)/g, ', dane wyrównane o liczbę dni roboczych,'],
  [/(^|\s)fin\.(?=\s|$)/g, ', odczyt finalny,'],
  [/(^|\s)wst\.(?=\s|$)/g, ', odczyt wstępny,'],
]
const CHANGES: Record<string, string> = {
  'r/r': 'rok do roku', 'm/m': 'miesiąc do miesiąca', 'k/k': 'kwartał do kwartału', 't/t': 'tydzień do tygodnia',
  'USD': 'w dolarach', 'EUR': 'w euro', 'JPY': 'w jenach', 'GBP': 'w funtach', 'GPB': 'w funtach', 'CHF': 'we frankach',
  'CAD': 'w dolarach kanadyjskich', 'AUD': 'w dolarach australijskich', 'NZD': 'w dolarach nowozelandzkich',
  'CNY': 'w juanach', 'PLN': 'w złotych', 'CZK': 'w koronach czeskich', 'SEK': 'w koronach szwedzkich',
  'NOK': 'w koronach norweskich', 'DKK': 'w koronach duńskich', 'HUF': 'w forintach', 'RON': 'w lejach', 'TRY': 'w lirach',
}
const CHANGE_WORDS = Object.values(CHANGES).join('|').replace(/\//g, '\\/')

// "Produkcja przemysłowa n.s.a. fin. (r/r)" -> "Produkcja przemysłowa, dane niewyrównane sezonowo, odczyt finalny rok do roku"
export function sayTitle(title: string): string {
  let t = ` ${title} `
  for (const [re, said] of QUALIFIERS) t = t.replace(re, `$1${said}`)
  t = t.replace(/\(([^()]+)\)/g, (m, inside: string) => (CHANGES[inside.trim()] ? `, ${CHANGES[inside.trim()]}` : /^[a-ząćęłńóśźż]+$/.test(inside) ? ` ${inside}` : m))
    .replace(/(^|\s)wg(?=\s)/g, '$1według').replace(/(^|\s)ws\.(?=\s)/g, '$1w sprawie').replace(/(^|\s)nt\.(?=\s)/g, '$1na temat')
  return t
    .replace(/\s*,(\s*,)*\s*/g, ', ')
    .replace(new RegExp(`,\\s+(${CHANGE_WORDS})`, 'g'), ' $1')
    .replace(/\s+/g, ' ').replace(/^[\s,]+|[\s,]+$/g, '')
}

const QUARTERS: Record<string, string> = { I: 'pierwszy', II: 'drugi', III: 'trzeci', IV: 'czwarty' }

// "wrzesień" -> "za wrzesień", "II kw." -> "za drugi kwartał"
export function sayPeriod(period: string): string {
  const p = period.trim()
  if (!p) return ''
  const q = p.match(/^(I|II|III|IV)\s*kw\.?(?:\s*(\d{4}))?$/i)
  if (q) return `za ${QUARTERS[q[1].toUpperCase()]} kwartał${q[2] ? ` ${q[2]}` : ''}`
  if (/^tydzień$/i.test(p)) return 'za ostatni tydzień'
  return `za ${p}`
}

// "Inflacja CPI rok do roku za wrzesień, konsensus 3,6%, poprzednio 3,3%."
export function sayRow(row: MacroRow): string {
  const parts = [[sayTitle(row.title), sayPeriod(row.period)].filter(Boolean).join(' ')]
  if (row.forecast) parts.push(`konsensus ${row.forecast}`)
  if (row.previous) parts.push(`poprzednio ${row.previous}`)
  const line = parts.join(', ')
  return line.endsWith('.') ? line : `${line}.`
}

// ── Announcements: everything released at one time goes in one ──

export interface MacroGroup {
  id: string          // "MACRONEXT:MAKRO:2026-10-09T12:30" (the release, UTC); "…:2026-10-09:dzis" for the day's undated ones
  at: number          // release time, ms; for the undated ones, when they are announced (MORNING)
  day: string         // "2026-10-9", for the link
  allDay?: boolean    // releases without a time ("?"): announced in the morning, "Dziś …"
  countries: string[] // of the data
  lines: string[]     // the data, one line per row read; with the country in front where it changes, when there are several
  say?: string[]      // the stock market: the same rows as they are read aloud ("Spółka LPP, dzień ustalenia …"), one part each
  talks?: string[]    // speeches and meetings, named in the title without a country: "wystąpienie szefowej Fed z Bostonu (Susan Collins)"
  title?: string      // the stock market: the title as it is, announced at `at` itself
  until?: number      // the stock market: not announced after this
  digest?: boolean    // the morning's repeat of the day's calendar (DIGEST_AT): its link says so, or it would be the one of a release at the same time
  done?: boolean      // announced (or too late to)
}

// Releases without a time are announced together at this time (Polish), after the morning reading
export const MORNING: [number, number] = [6, 40]

const TALK = /^(wystąpienie|konferencja|przemówienie|zeznanie|spotkanie|szczyt|seminarium|sympozjum|debata)/i
// "wystąpienie szefowej Fed z Bostonu (Susan Collins)", from its line
const talkName = (line: string) => line.replace(/\.$/, '').replace(/^\p{Lu}/u, (c) => c.toLocaleLowerCase('pl'))

// The day's rows that are announced, grouped by release time; those without a time ("?") in one
// group of their own, announced in the morning. A report with parts is read by its parts only.
export function dayGroups(rows: MacroRow[], keyPrefix: string, y: number, m: number, d: number): MacroGroup[] {
  const groups = new Map<number, { id: string; at: number; day: string; allDay?: boolean; rows: MacroRow[] }>()
  const day = `${y}-${m}-${d}`
  const add = (row: MacroRow) => {
    const hm = row.time.match(/^(\d{2}):(\d{2})$/)
    const at = hm ? warsawToUtc(y, m, d, +hm[1], +hm[2]) : warsawToUtc(y, m, d, ...MORNING)
    const key = hm ? at : -1
    let g = groups.get(key)
    if (!g) {
      const id = hm ? `${keyPrefix}:${new Date(at).toISOString().slice(0, 16)}` : `${keyPrefix}:${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}:dzis`
      g = { id, at, day, ...(hm ? {} : { allDay: true }), rows: [] }
      groups.set(key, g)
    }
    g.rows.push(row)
  }
  for (const row of rows) {
    if (!row.children.length) { if (announced(row)) add(row); continue }
    for (const c of row.children) if (announced(c, row.title)) add(c)
  }
  const built = [...groups.values()].map(({ rows: all, ...g }): MacroGroup => {
    const data = all.filter((r) => !TALK.test(r.title))
    const countries = [...new Set(data.map((r) => r.country).filter(Boolean))]
    return {
      ...g,
      countries,
      lines: data.map((row, i) => (countries.length > 1 && row.country && row.country !== data[i - 1]?.country ? `${row.country}: ${sayRow(row)}` : sayRow(row))),
      talks: all.filter((r) => TALK.test(r.title)).map((r) => talkName(sayRow(r))),
    }
  })
  const digest = morningMacro(built, keyPrefix, y, m, d)
  return [...built, ...(digest ? [digest] : [])].sort((a, b) => a.at - b.at)
}

const plural = (n: number, one: string, few: string, many: string) =>
  n === 1 ? one : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? few : many

// The countries as they follow "dane makro z": "z USA", "ze strefy euro", "z Wielkiej Brytanii"
const FROM: Record<string, string> = {
  'USA': 'USA', 'Strefa Euro': 'strefy euro', 'Polska': 'Polski', 'Niemcy': 'Niemiec', 'Francja': 'Francji', 'Włochy': 'Włoch',
  'Hiszpania': 'Hiszpanii', 'Wielka Brytania': 'Wielkiej Brytanii', 'Japonia': 'Japonii', 'Chiny': 'Chin', 'Kanada': 'Kanady',
  'Australia': 'Australii', 'Nowa Zelandia': 'Nowej Zelandii', 'Szwajcaria': 'Szwajcarii', 'Szwecja': 'Szwecji', 'Norwegia': 'Norwegii',
  'Dania': 'Danii', 'Czechy': 'Czech', 'Węgry': 'Węgier', 'Rumunia': 'Rumunii', 'Słowacja': 'Słowacji', 'Turcja': 'Turcji',
  'Rosja': 'Rosji', 'Ukraina': 'Ukrainy', 'Indie': 'Indii', 'Chile': 'Chile', 'Brazylia': 'Brazylii', 'Meksyk': 'Meksyku',
  'RPA': 'RPA', 'Korea Płd.': 'Korei Południowej', 'Korea Południowa': 'Korei Południowej', 'Holandia': 'Holandii',
  'Austria': 'Austrii', 'Belgia': 'Belgii', 'Irlandia': 'Irlandii', 'Portugalia': 'Portugalii', 'Grecja': 'Grecji',
  'Finlandia': 'Finlandii', 'Hongkong': 'Hongkongu', 'Singapur': 'Singapuru', 'Tajwan': 'Tajwanu', 'Izrael': 'Izraela',
}

// "dane makro z USA i Kanady", "dane makro ze strefy euro"; a country not in the list above: "dane makro: Islandia"
function dataFrom(countries: string[]): string {
  const names = countries.map((c) => FROM[c])
  if (!names.length) return 'dane makro'
  if (names.some((n) => !n)) return `dane makro: ${countries.join(', ')}`
  const list = names.length > 1 ? `${names.slice(0, -1).join(', ')} i ${names.at(-1)}` : names[0]
  return `dane makro ${/^([sśzźż][^aeiouyąęó]|włoch)/i.test(list) ? 'ze' : 'z'} ${list}`
}

// "8:00", "14:30"
const clockOf = (t: number) => new Date(t).toLocaleTimeString('pl-PL', { timeZone: 'Europe/Warsaw', hour: 'numeric', minute: '2-digit' })

const inMinutes = (n: number) => `Za ${n} ${plural(n, 'minutę', 'minuty', 'minut')}`

// The announcement's title, on the list as it is read: the minutes left and the release time.
// Speeches and meetings are named, without a country. "Za 10 minut o godzinie 16:00 dane makro z USA",
// "Za 10 minut o godzinie 22:00 wystąpienie szefowej Fed z Bostonu (Susan Collins)", "… dane makro
// z USA oraz wystąpienie …", "Dziś bez podanej godziny: dane makro z Chin". minutes: fewer when it
// is announced late. Read aloud: sayMacroTitle.
export function groupTitle(g: MacroGroup, minutes = LEAD_MINUTES): string {
  if (g.title) return g.title
  const what = [g.lines.length ? dataFrom(g.countries) : '', ...(g.talks ?? [])].filter(Boolean).join(' oraz ')
  return g.allDay ? `Dziś bez podanej godziny: ${what}` : `${inMinutes(minutes)} o godzinie ${clockOf(g.at)} ${what}`
}

const HOURS = ['zero', 'pierwszej', 'drugiej', 'trzeciej', 'czwartej', 'piątej', 'szóstej', 'siódmej', 'ósmej', 'dziewiątej', 'dziesiątej',
  'jedenastej', 'dwunastej', 'trzynastej', 'czternastej', 'piętnastej', 'szesnastej', 'siedemnastej', 'osiemnastej', 'dziewiętnastej',
  'dwudziestej', 'dwudziestej pierwszej', 'dwudziestej drugiej', 'dwudziestej trzeciej']

// The minutes of a clock time in words, 1 to 59 ("pięćdziesiąt", "zero pięć" with the zero): a number left as digits after "osiemnastej" a voice
// puts in the genitive too ("osiemnastej pięćdziesięciu"), on a computer, though a phone says "pięćdziesiąt"
const MINUTE_ONES = ['', 'jeden', 'dwa', 'trzy', 'cztery', 'pięć', 'sześć', 'siedem', 'osiem', 'dziewięć']
const MINUTE_TEENS = ['dziesięć', 'jedenaście', 'dwanaście', 'trzynaście', 'czternaście', 'piętnaście', 'szesnaście', 'siedemnaście', 'osiemnaście', 'dziewiętnaście']
const MINUTE_TENS = ['', '', 'dwadzieścia', 'trzydzieści', 'czterdzieści', 'pięćdziesiąt']
const minuteWords = (n: number) => (n < 10 ? MINUTE_ONES[n] : n < 20 ? MINUTE_TEENS[n - 10] : [MINUTE_TENS[Math.floor(n / 10)], MINUTE_ONES[n % 10]].filter(Boolean).join(' '))

// The title as it is said, with the hour in words: "Za 10 minut o godzinie szesnastej dane makro
// z USA" while the release is ahead (the minutes counted again, for one read a few minutes after it
// came), "O godzinie szesnastej dane makro z USA" once it is out. Also for the earlier "O 16:00 …".
// Just after midnight: "Za 10 minut, trzydzieści minut po północy, dane makro z Japonii".
// sentAt: when the announcement was made (the server's clock, so a computer clock that is behind does not add minutes)
export function sayMacroTitle(title: string, link: string, sentAt: number, now = Date.now()): string {
  const t = title.match(/^(?:Za \d+ \S+ o godzinie|O) (\d{1,2}):(\d{2}) /)
  if (!t) return title
  const d = link.match(/(\d{4})-(\d{1,2})-(\d{1,2})[-#]\d{1,2}:\d{2}$/)
  const left = d ? Math.ceil((warsawToUtc(+d[1], +d[2], +d[3], +t[1], +t[2]) - Math.max(now, sentAt)) / 60_000) : 0
  const rest = title.slice(t[0].length)
  const soon = left >= 1 ? inMinutes(Math.min(left, LEAD_MINUTES)) : ''
  const hour = +t[1], minute = +t[2]
  if (hour === 0) {
    const night = minute === 0 ? 'o północy' : `${minute === 1 ? 'minutę' : `${minute} ${plural(minute, 'minutę', 'minuty', 'minut')}`} po północy`
    return soon ? `${soon}, ${night}, ${rest}` : `${night[0].toLocaleUpperCase('pl')}${night.slice(1)}, ${rest}`
  }
  const at = `godzinie ${HOURS[hour]}${minute === 0 ? '' : `${t[2].startsWith('0') ? ' zero' : ''} ${minuteWords(minute)}`}`
  return soon ? `${soon} o ${at} ${rest}` : `O ${at} ${rest}`
}

// ── The morning's repeat ──
// Before the morning briefing (docs/poranny-przeglad.md), at these Polish times, what the day brings is said once more in one piece each:
// the macro calendar, the Warsaw session, the American results before and after their session. What was announced at its own time stays;
// these repeat it for the one who listens to the morning in one go.
export const DIGEST_AT = { macro: [7, 30], gpw: [7, 35], usa: [7, 40] } satisfies Record<string, [number, number]>
const DIGEST_STILL_MS = 45 * 60_000 // one found late is still made for this long; later it would only get in the way of the briefing

const upperFirst = (s: string) => s.charAt(0).toLocaleUpperCase('pl') + s.slice(1)

// "o godzinie czternastej trzydzieści", "o północy", "30 minut po północy": the time of a release, as it is said
function atWords(at: number): string {
  const [hour, minute] = clockOf(at).split(':').map(Number)
  if (hour === 0) return minute === 0 ? 'o północy' : `${minute === 1 ? 'minutę' : `${minute} ${plural(minute, 'minutę', 'minuty', 'minut')}`} po północy`
  return `o godzinie ${HOURS[hour]}${minute === 0 ? '' : `${minute < 10 ? ' zero' : ''} ${minuteWords(minute)}`}`
}

// The day's macro calendar from now on: the releases at or after the digest's time, and those without a time. Each in its time, with
// the country; read: the time and what it is ("O godzinie czternastej trzydzieści dane makro z Kanady."), then the rows as in the announcement.
// The ones before it are out already (announced at their time), and their forecasts would only confuse. null when nothing is left.
export function morningMacro(groups: MacroGroup[], keyPrefix: string, y: number, m: number, d: number): MacroGroup | null {
  const at = warsawToUtc(y, m, d, ...DIGEST_AT.macro)
  const ahead = groups.filter((g) => g.allDay || g.at >= at).sort((a, b) => Number(!!a.allDay) - Number(!!b.allDay) || a.at - b.at)
  if (!ahead.length) return null
  const lines: string[] = [], say: string[] = []
  for (const g of ahead) {
    const when = g.allDay ? 'Bez godziny' : clockOf(g.at)
    lines.push(...g.lines.map((line) => (g.countries.length === 1 ? `${when} ${g.countries[0]}: ${line}` : `${when} ${line}`)),
      ...(g.talks ?? []).map((talk) => `${when} ${upperFirst(talk)}`))
    const what = [g.lines.length ? dataFrom(g.countries) : '', ...(g.talks ?? [])].filter(Boolean).join(' oraz ')
    say.push(g.allDay ? `Bez podanej godziny: ${what}.` : `${upperFirst(atWords(g.at))} ${what}.`, ...g.lines)
  }
  const ymd = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  return { id: `${keyPrefix}:${ymd}:rano`, at, day: `${y}-${m}-${d}`, countries: [...new Set(ahead.flatMap((g) => g.countries))], lines, say,
    title: 'Dziś w kalendarium makro', until: at + DIGEST_STILL_MS, digest: true }
}

// ── The stock market today (macronext.pl/pl/dzis-na-gieldzie) ──

export interface StockRow {
  company: string // "LPP", "PepsiCo"
  market: string  // "GPW", "NC" (NewConnect), "NYSE", "LSE"…
  time: string    // "przed sesją", "po sesji"; '' when not given
  event: string   // "Dzień ustalenia prawa do dywidendy 500 zł na akcję."
}

// The day's rows; null when the page has no table or is for another day
export function parseStockDay(html: string, y: number, m: number, d: number): StockRow[] | null {
  const start = html.search(/<table[^>]*\bcompany-agenda\b/)
  if (start < 0) return null
  const end = html.indexOf('</table>', start)
  const table = html.slice(start, end < 0 ? undefined : end)
  const day = table.match(/kalendarium\/d\/(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (day && (+day[1] !== y || +day[2] !== m || +day[3] !== d)) return null
  const rows: StockRow[] = []
  for (const tr of table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const tds = [...tr[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((c) => cleanText(c[1]))
    if (tds.length !== 5 || !tds[0] || !tds[4]) continue
    rows.push({ company: tds[0], market: tds[2].toUpperCase(), time: tds[3].replace(/^(null|-|brak)$/i, ''), event: tds[4] })
  }
  return rows
}

// When they are announced: the Warsaw session (GPW, NewConnect) only in the morning's repeat (DIGEST_AT; an announcement of its own at
// 8:50 would be the same one an hour later, so there is none), still up to the opening of the session; American results before the
// session at 5:15 in New York (11:15 Polish time, 10:15 in the weeks when only one of the two has changed the clock), after it
// (the companies that report then, before the session ends) at 15:55 (21:55 Polish time)
export const GPW_OPENS: [number, number] = [9, 0]
export const US_BEFORE_AT: [number, number] = [5, 15]
export const US_AFTER_AT: [number, number] = [15, 55]
const STILL_MS = 2 * 3600_000 // one found late is still announced for this long
const POLISH = ['GPW', 'NC']
const US: Record<string, string> = { NYSE: 'NYSE', NASDAQ: 'Nasdaq' }

const listPl = (names: string[]) => (names.length > 1 ? `${names.slice(0, -1).join(', ')} i ${names.at(-1)}` : names[0] ?? '')
const sentence = (s: string) => (/[.!?]$/.test(s) ? s : `${s}.`)

// "Raport za III kwartał 2026 roku opublikują: Citigroup, Goldman Sachs oraz Taiwan Semiconductor
// Manufacturing Company – nie podano godziny publikacji." One line per event, companies together. A single company
// is read "Spółka PepsiCo, dzień ustalenia praw do dywidendy 1,5 USD na akcję.": the word, the name, the event.
function usLines(known: StockRow[], unknown: StockRow[]): { lines: string[]; say: string[] } {
  const byEvent = new Map<string, { known: string[]; unknown: string[] }>()
  const add = (r: StockRow, k: 'known' | 'unknown') => {
    const event = r.event.replace(/\.$/, '')
    if (!byEvent.has(event)) byEvent.set(event, { known: [], unknown: [] })
    byEvent.get(event)![k].push(r.company)
  }
  known.forEach((r) => add(r, 'known'))
  unknown.forEach((r) => add(r, 'unknown'))
  const lines: string[] = [], say: string[] = []
  for (const [event, g] of byEvent) {
    const names = [listPl(g.known), g.unknown.length ? `${listPl(g.unknown)} – nie podano godziny publikacji` : ''].filter(Boolean).join(' oraz ')
    const report = event.match(/^Publikacja raportu (.+)$/i)
    const many = g.known.length + g.unknown.length > 1
    const verb = many ? 'opublikują' : 'opublikuje'
    lines.push(report ? `Raport ${report[1]} ${verb}: ${names}.` : many ? `${event}: ${names}.` : `${names}: ${event}.`)
    // Read aloud. One company, an event of its own: the name first, then the event (the time not given at the end). The report
    // of several in one sentence, with no colon or dash in it: each of them is a long pause, in front of the names and of the "oraz"
    const spoken = names.replace(' – nie podano', ', nie podano')
    say.push(!report && !many ? `Spółka ${g.known[0] ?? g.unknown[0]}, ${event}${g.unknown.length ? ', nie podano godziny publikacji' : ''}.`
      : report ? `Raport ${report[1]} ${verb} ${spoken}.` : many ? `${event}: ${spoken}.` : `${spoken}: ${event}.`)
  }
  return { lines, say }
}

// The day's announcements of the stock calendar: the Warsaw session at 7:35 (the morning's repeat, DIGEST_AT, is the only one), the American
// results before their session and, of those who report after it, before it ends; and the morning's repeat of the American ones in one at 7:40
export function stockGroups(rows: StockRow[], keyPrefix: string, y: number, m: number, d: number): MacroGroup[] {
  const day = `${y}-${m}-${d}`
  const ymd = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  const groups: MacroGroup[] = []
  const group = (id: string, at: number, title: string, lines: string[], say?: string[], more: { digest?: true; until?: number } = {}) =>
    groups.push({ id: `${keyPrefix}:${ymd}:${id}`, at, day, countries: [], lines, say, title, until: more.until ?? at + (more.digest ? DIGEST_STILL_MS : STILL_MS),
      ...(more.digest ? { digest: true } : {}) })

  const polish = rows.filter((r) => POLISH.includes(r.market))
  if (polish.length) {
    const gpw = polish.some((r) => r.market === 'GPW'), nc = polish.some((r) => r.market === 'NC')
    const title = gpw && nc ? 'Dziś na giełdzie GPW i NewConnect' : gpw ? 'Dziś na giełdzie GPW' : 'Dziś na NewConnect'
    const lines = polish.map((r) => sentence(`${r.company}: ${r.event}`)), say = polish.map((r) => sentence(`Spółka ${r.company}, ${r.event}`))
    group('gpw-rano', warsawToUtc(y, m, d, ...DIGEST_AT.gpw), title, lines, say, { digest: true, until: warsawToUtc(y, m, d, ...GPW_OPENS) })
  }
  const us = rows.filter((r) => r.market in US)
  const before = us.filter((r) => /przed/i.test(r.time)), after = us.filter((r) => /po\s+sesji/i.test(r.time))
  const unknown = us.filter((r) => !before.includes(r) && !after.includes(r))
  const where = (rs: StockRow[]) => [...new Set(rs.map((r) => US[r.market]))].join(' i ')
  const us1 = before.length || unknown.length ? usLines(before, unknown) : null
  const us2 = after.length ? usLines(after, []) : null
  if (us1) group('usa-przed', newYorkToUtc(y, m, d, ...US_BEFORE_AT), `Dziś na ${where([...before, ...unknown])} przed sesją`, us1.lines, us1.say)
  if (us2) group('usa-po', newYorkToUtc(y, m, d, ...US_AFTER_AT), `Dziś na ${where(after)} po sesji`, us2.lines, us2.say)
  if (us1 || us2) {
    // both in one: "Przed sesją:" and "Po sesji:" in front of the lines, and said as parts of their own in front of the rows
    const both = !!(us1 && us2)
    const title = both ? `Dziś na ${where(us)} przed sesją i po sesji` : us1 ? `Dziś na ${where([...before, ...unknown])} przed sesją` : `Dziś na ${where(after)} po sesji`
    group('usa-rano', warsawToUtc(y, m, d, ...DIGEST_AT.usa), title,
      [...(us1?.lines.map((l) => (both ? `Przed sesją: ${l}` : l)) ?? []), ...(us2?.lines.map((l) => (both ? `Po sesji: ${l}` : l)) ?? [])],
      [...(both ? ['Przed sesją.'] : []), ...(us1?.say ?? []), ...(both ? ['Po sesji.'] : []), ...(us2?.say ?? [])], { digest: true })
  }
  return groups.sort((a, b) => a.at - b.at)
}

// Numbers with their units in words: shared with all news (say.ts)
export { sayNumbers } from './say'

// What is read for an announcement of MacroNext (speech.ts): the title as it is said, then (where the lead is read) the rows as they are
// said, one part each, all as a newsreader says it
export function macroSpoken(it: { title: string; link: string; time: number; say?: string; description: string }, withLead: boolean, now: number): string[] {
  return [`${sayMacroTitle(it.title, it.link, it.time, now)}.`, ...(withLead ? (it.say ?? it.description).split('\n') : [])].filter(Boolean).flatMap(sayAloudParts)
}
