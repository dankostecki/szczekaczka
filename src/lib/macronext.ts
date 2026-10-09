// MacroNext's calendar of macro data (macronext.pl/pl/dane-makro/d/2026-10-9): what is
// released when, read from the day's page, and the announcement read 10 minutes before.
// Shared by the Cloudflare Worker (worker/macro.ts) and the page (how it is read aloud).
import { cleanText, warsawToUtc } from './parse'

// How long before the release the announcement goes out
export const LEAD_MINUTES = 10
// When the server reads the calendar, Polish time: just after midnight, for the new day, and
// again in the morning, for consensus figures added since. Tomorrow's page is read too, so
// releases right after midnight are known in time.
export const FETCH_TIMES: [number, number][] = [[0, 1], [6, 30]]
export const fetchTimesText = () => FETCH_TIMES.map(([h, m]) => `${h}:${String(m).padStart(2, '0')}`).join(' i ')

// The day's page, as linked from each announcement
export const dayUrl = (base: string, y: number, m: number, d: number) => `${base}${y}-${m}-${d}`

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
  talks?: string[]    // speeches and meetings, named in the title without a country: "wystąpienie szefowej Fed z Bostonu (Susan Collins)"
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
  return [...groups.values()].map(({ rows: all, ...g }) => {
    const data = all.filter((r) => !TALK.test(r.title))
    const countries = [...new Set(data.map((r) => r.country).filter(Boolean))]
    return {
      ...g,
      countries,
      lines: data.map((row, i) => (countries.length > 1 && row.country && row.country !== data[i - 1]?.country ? `${row.country}: ${sayRow(row)}` : sayRow(row))),
      talks: all.filter((r) => TALK.test(r.title)).map((r) => talkName(sayRow(r))),
    }
  }).sort((a, b) => a.at - b.at)
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

// The announcement's title, as it stays on the list: with the release time, which does not go out
// of date. Speeches and meetings are named, without a country. "O 16:00 dane makro z USA",
// "O 22:00 wystąpienie szefowej Fed z Bostonu (Susan Collins)", "O 14:30 dane makro z USA oraz
// wystąpienie …", "Dziś bez podanej godziny: dane makro z Chin". Read aloud: sayMacroTitle.
export function groupTitle(g: MacroGroup): string {
  const what = [g.lines.length ? dataFrom(g.countries) : '', ...(g.talks ?? [])].filter(Boolean).join(' oraz ')
  return `${g.allDay ? 'Dziś bez podanej godziny:' : `O ${clockOf(g.at)}`} ${what}`
}

const HOURS = ['zero', 'pierwszej', 'drugiej', 'trzeciej', 'czwartej', 'piątej', 'szóstej', 'siódmej', 'ósmej', 'dziewiątej', 'dziesiątej',
  'jedenastej', 'dwunastej', 'trzynastej', 'czternastej', 'piętnastej', 'szesnastej', 'siedemnastej', 'osiemnastej', 'dziewiętnastej',
  'dwudziestej', 'dwudziestej pierwszej', 'dwudziestej drugiej', 'dwudziestej trzeciej']

// The title as it is said: "Za 10 minut dane makro z USA" while the release is ahead (when the
// announcement comes, or soon after it), "O szesnastej dane makro z USA" once it is out.
// sentAt: when the announcement was made (the server's clock, so a computer clock that is behind does not add minutes)
export function sayMacroTitle(title: string, link: string, sentAt: number, now = Date.now()): string {
  const t = title.match(/^O (\d{1,2}):(\d{2}) /)
  if (!t) return title
  const d = link.match(/\/d\/(\d{4})-(\d{1,2})-(\d{1,2})#/)
  const left = d ? Math.ceil((warsawToUtc(+d[1], +d[2], +d[3], +t[1], +t[2]) - Math.max(now, sentAt)) / 60_000) : 0
  const rest = title.slice(t[0].length)
  if (left >= 1) {
    const n = Math.min(left, LEAD_MINUTES)
    return `Za ${n} ${plural(n, 'minutę', 'minuty', 'minut')} ${rest}`
  }
  const minutes = t[2] === '00' ? '' : t[2].startsWith('0') ? ` zero ${+t[2]}` : ` ${t[2]}`
  return `O ${HOURS[+t[1]]}${minutes} ${rest}`
}

// ── Reading aloud: numbers with their units in words ──

const UNITS: Record<string, [string, string, string, string]> = { // one, 2–4, 5+, a fraction
  'tys.': ['tysiąc', 'tysiące', 'tysięcy', 'tysiąca'],
  'mln': ['milion', 'miliony', 'milionów', 'miliona'],
  'mld': ['miliard', 'miliardy', 'miliardów', 'miliarda'],
  'bln': ['bilion', 'biliony', 'bilionów', 'biliona'],
  'pkt': ['punkt', 'punkty', 'punktów', 'punktu'],
  'godz.': ['godzina', 'godziny', 'godzin', 'godziny'],
}

// "-41,7 tys." -> "minus 41,7 tysiąca", "-2,1 mln brk" -> "minus 2,1 miliona baryłek"
export function sayNumbers(text: string): string {
  return text
    .replace(/(^|[\s(])-(?=\d)/g, '$1minus ')
    .replace(/(\d+(?:,\d+)?)\s*(tys\.|godz\.|(?:mln|mld|bln|pkt)(?![a-ząćęłńóśźż]))(\s+brk\b)?/g,
      (m: string, num: string, unit: string, barrels: string | undefined, at: number, all: string) => {
        const forms = UNITS[unit]
        const word = num.includes(',') ? forms[3] : plural(+num, forms[0], forms[1], forms[2])
        // "8 tys. Stopa…", or at the very end: the abbreviation's dot also ended the sentence
        const end = unit.endsWith('.') && !barrels && /^\s*($|[A-ZĄĆĘŁŃÓŚŹŻ])/.test(all.slice(at + m.length))
        return `${num} ${word}${barrels ? ' baryłek' : ''}${end ? '.' : ''}`
      })
}
