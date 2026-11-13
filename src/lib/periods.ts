// Periods of time in a translation: "THREE-MONTH LOW" is "najniższy poziom od trzech miesięcy", not "trzyletnie minimum". The translation
// model sometimes takes a month, a week or a day for a year, or the other way round. Where the original says how many of which unit
// ("3-month", "six-week", "52-WEEK", "a year", "multi-month"), a Polish period of the same number with another unit, one the original
// does not have for that number, gets the original's unit; the form of the word stays (its case, its number, its letters). Polish periods:
// the compound adjectives ("trzyletni", "6-tygodniowe", "wielomiesięcznego") and a number with the noun ("od trzech lat", "trzy lata",
// "od 3 miesięcy", "od kilku tygodni", "od roku"). A number the original has with two units, or with none, is left as it is. Put right
// in the translation as the server receives it and in the ones already kept (the page, saved posts), as ordinals.ts does for "siódty".

type Unit = 'day' | 'week' | 'month' | 'year'
const MULTI = -1 // "multi-month", "several weeks", "wieloletni", "od kilku lat"

// ── The original ──
const EN_NUM: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  fifteen: 15, eighteen: 18, twenty: 20, thirty: 30, fifty: 50, multi: MULTI, several: MULTI, few: MULTI,
}
const EN = new RegExp(`(?<![\\p{L}\\p{N}])(\\d{1,3}|${Object.keys(EN_NUM).join('|')})[\\s-]+(day|week|month|year)s?(?!\\p{L})`, 'giu')

// The periods the original names: for each number, its units
function periodsOf(en: string): Map<number, Set<Unit>> {
  const said = new Map<number, Set<Unit>>()
  for (const m of en.matchAll(EN)) {
    const n = /^\d/.test(m[1]) ? Number(m[1]) : EN_NUM[m[1].toLowerCase()]
    let units = said.get(n)
    if (!units) said.set(n, (units = new Set()))
    units.add(m[2].toLowerCase() as Unit)
  }
  return said
}

// ── The translation ──
// A number as Polish writes it before the noun (any case), and as the first part of a compound ("trzy|letni", "pięcio|miesięczny")
const PL_NUM: [n: number, words: string[], prefixes: string[]][] = [
  [2, ['dwa', 'dwie', 'dwóch', 'dwu', 'dwoma', 'dwiema', 'dwóm'], ['dwu']],
  [3, ['trzy', 'trzech', 'trzem', 'trzema'], ['trzy']],
  [4, ['cztery', 'czterech', 'czterem', 'czterema'], ['cztero']],
  [5, ['pięć', 'pięciu', 'pięcioma'], ['pięcio']],
  [6, ['sześć', 'sześciu', 'sześcioma'], ['sześcio']],
  [7, ['siedem', 'siedmiu', 'siedmioma'], ['siedmio']],
  [8, ['osiem', 'ośmiu', 'ośmioma'], ['ośmio']],
  [9, ['dziewięć', 'dziewięciu', 'dziewięcioma'], ['dziewięcio']],
  [10, ['dziesięć', 'dziesięciu', 'dziesięcioma'], ['dziesięcio']],
  [11, ['jedenaście', 'jedenastu'], ['jedenasto']],
  [12, ['dwanaście', 'dwunastu'], ['dwunasto']],
  [15, ['piętnaście', 'piętnastu'], ['piętnasto']],
  [18, ['osiemnaście', 'osiemnastu'], ['osiemnasto']],
  [20, ['dwadzieścia', 'dwudziestu'], ['dwudziesto']],
  [30, ['trzydzieści', 'trzydziestu'], ['trzydziesto']],
  [50, ['pięćdziesiąt', 'pięćdziesięciu'], ['pięćdziesięcio']],
  [MULTI, ['kilka', 'kilku', 'kilkoma', 'wiele', 'wielu'], ['wielo', 'kilku']],
]
const WORD_N = new Map(PL_NUM.flatMap(([n, words]) => words.map((w) => [w, n] as const)))
const PREFIX_N = new Map(PL_NUM.flatMap(([n, , prefixes]) => prefixes.map((p) => [p, n] as const)))
const numberOf = (s: string, map: Map<string, number>) => (/^\d/.test(s) ? Number(s.replace(/-$/, '')) : map.get(s.toLowerCase()))
const alt = (list: Iterable<string>) => [...list].sort((a, b) => b.length - a.length).join('|')

// The compound adjectives: the year's is soft ("letni", "letnia", "letniego"), the others hard ("miesięczny", "tygodniowa", "dniowego")
const STEM: Record<Unit, string> = { year: 'letn', month: 'miesięczn', week: 'tygodniow', day: 'dniow' }
const SOFT = ['iego', 'iemu', 'iej', 'imi', 'ich', 'ia', 'ie', 'ią', 'im', 'i']
const HARD = ['ego', 'emu', 'ej', 'ymi', 'ych', 'a', 'e', 'ą', 'ym', 'y']
const toHard = (e: string) => HARD[SOFT.indexOf(e)]
const toSoft = (e: string) => SOFT[HARD.indexOf(e)]
const COMPOUND = new RegExp(`(?<!\\p{L})(\\d{1,3}-|${alt(PREFIX_N.keys())})(${STEM.year}(?:${SOFT.join('|')})|(?:${STEM.month}|${STEM.week}|${STEM.day})(?:${HARD.join('|')}))(?!\\p{L})`, 'giu')

// The nouns after a number, by form: G the genitive plural ("od trzech lat", "pięć lat"), N the nominative and accusative plural
// ("trzy lata"), L the locative ("w trzech latach"), I the instrumental ("trzema latami"), S the genitive singular after "od" ("od roku")
type Form = 'G' | 'N' | 'L' | 'I' | 'S'
const NOUN: Record<Unit, Record<Form, string>> = {
  year: { G: 'lat', N: 'lata', L: 'latach', I: 'latami', S: 'roku' },
  month: { G: 'miesięcy', N: 'miesiące', L: 'miesiącach', I: 'miesiącami', S: 'miesiąca' },
  week: { G: 'tygodni', N: 'tygodnie', L: 'tygodniach', I: 'tygodniami', S: 'tygodnia' },
  day: { G: 'dni', N: 'dni', L: 'dniach', I: 'dniami', S: 'dnia' },
}
const UNITS = Object.keys(NOUN) as Unit[]
const PLURALS = new Set(UNITS.flatMap((u) => (['G', 'N', 'L', 'I'] as Form[]).map((f) => NOUN[u][f])))
const PLURAL = new RegExp(`(?<![\\p{L}\\p{N}])(\\d{1,3}|${alt(WORD_N.keys())})(\\s+)(${alt(PLURALS)})(?!\\p{L})`, 'giu')
// "od roku", "od miesiąca", "od tygodnia": one of them, the number not said ("od dnia" is a date as often: "od dnia wyborów")
const SINGULAR = new RegExp(`(?<!\\p{L})(od)(\\s+)(roku|miesiąca|tygodnia)(?!\\p{L})(?!\\s+\\d)`, 'giu')
// Before these a number takes the genitive ("od trzech dni", "od 3 dni")
const GENITIVE_BEFORE = /(?:^|[^\p{L}])(?:od|do|z|ze|ponad|około|blisko|prawie|niemal|sprzed|u|bez|dla|wokół|powyżej|poniżej)\s+$/iu
const NOMINATIVE_WORDS = new Set(['dwa', 'dwie', 'trzy', 'cztery'])

// "dni" is the genitive and the nominative: the number and the word before it tell which
function formOfDays(number: string, before: string): Form {
  if (NOMINATIVE_WORDS.has(number.toLowerCase())) return 'N'
  if (!/^\d/.test(number)) return 'G'
  const n = Number(number), last = n % 10, teen = n % 100 >= 12 && n % 100 <= 14
  return last >= 2 && last <= 4 && !teen && !GENITIVE_BEFORE.test(before) ? 'N' : 'G'
}

// The word in the letters of the one it replaces: "Trzyletnie" → "Trzymiesięczne", "LAT" → "MIESIĘCY"
const likeCase = (was: string, word: string) => (was === was.toUpperCase() && was !== was.toLowerCase() ? word.toUpperCase() : word)

export function fixPeriods(pl: string, en: string): string {
  const said = periodsOf(en)
  if (said.size === 0 || !pl) return pl
  // the unit the original has for this number instead, when it has exactly one and not this one
  const instead = (n: number | undefined, unit: Unit): Unit | null => {
    const units = n === undefined ? undefined : said.get(n)
    return units && !units.has(unit) && units.size === 1 ? [...units][0] : null
  }
  return pl
    .replace(COMPOUND, (all, prefix: string, rest: string) => {
      const low = rest.toLowerCase()
      const unit = UNITS.find((u) => low.startsWith(STEM[u]))!
      const to = instead(numberOf(prefix.toLowerCase(), PREFIX_N), unit)
      if (!to) return all
      const ending = low.slice(STEM[unit].length)
      const hard = unit === 'year' ? toHard(ending) : ending
      return prefix + likeCase(rest, STEM[to] + (to === 'year' ? toSoft(hard) : hard))
    })
    .replace(PLURAL, (all, number: string, space: string, noun: string, offset: number, whole: string) => {
      const low = noun.toLowerCase()
      const unit = UNITS.find((u) => Object.values(NOUN[u]).includes(low))!
      const to = instead(numberOf(number, WORD_N), unit)
      if (!to) return all
      const form = unit === 'day' && low === 'dni' ? formOfDays(number, whole.slice(Math.max(0, offset - 12), offset))
        : (Object.keys(NOUN[unit]) as Form[]).find((f) => NOUN[unit][f] === low)!
      return number + space + likeCase(noun, NOUN[to][form])
    })
    .replace(SINGULAR, (all, od: string, space: string, noun: string) => {
      const low = noun.toLowerCase()
      const unit = UNITS.find((u) => NOUN[u].S === low)!
      const to = instead(1, unit)
      return to && to !== 'day' ? od + space + likeCase(noun, NOUN[to].S) : all
    })
}
