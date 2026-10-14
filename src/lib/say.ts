// How text is said aloud, as a newsreader would: sayAloud. Speech voices read what is written,
// so the text is first put the way it is said: names in capitals as words, abbreviations, numbers
// with their units, quarters, years and Roman numerals in words, a pause after a colon.
//
// Names: voices spell out words in capitals that they do not know ("ARCHICOM" as A-R-C-H-…,
// "DI VOLIO" as "di V olio"), so company names in capitals are given to the voice as ordinary
// words ("Archicom", "Di Volio"). Short abbreviations stay in capitals and are spelled, as they
// should be (PKO, GPW, KGHM, CD); legal forms and a few titles are said in full.

import { US_NAMES, US_WORDS } from './names-us'
import { FIRM_NAMES } from './names-firms'
import { CODES, type CodeEntry, type CodeMode } from './codes-pl'
import { TITLES, FEMININE_NAMES, BIBLICAL_BOOKS } from './titles-pl'
import { sayParticiples } from './agree-pl'
import { EU_INSTITUTIONS, type EuGender } from './institutions-eu'
import { CENTRAL_BANKS, CENTRAL_BANK_GUARDS } from './central-banks'

const FORMS: [RegExp, string][] = [
  [/(?<!\p{L})S\.\s?K\.\s?A\.?(?!\p{L})/gu, 'spółka komandytowo-akcyjna'],
  [/(?<![\p{L}.])(?:S\.\s?A\.?|SA)(?!\p{L})/gu, 'spółka akcyjna'],
  [/(?<!\p{L})sp\.?\s?z\.?\s?o\.\s?o\.?(?!\p{L})/giu, 'spółka z ograniczoną odpowiedzialnością'],
  [/(?<!\p{L})sp\.\s?k\.(?!\p{L})/giu, 'spółka komandytowa'],
  [/(?<!\p{L})sp\.\s?j\.(?!\p{L})/giu, 'spółka jawna'],
  // English legal forms, in full as they are said ("HUUUGE, INC." -> "Hiudż, inkorporejtid"): Inc. incorporated, Corp. corporation, Ltd. limited
  [/(?<![\p{L}\d])(?:Inc|INC)\.?(?![\p{L}\d])/gu, 'inkorporejtid'],
  [/(?<![\p{L}\d])(?:Corp|CORP)\.?(?![\p{L}\d])/gu, 'korporejszyn'],
  [/(?<![\p{L}\d])(?:Ltd|LTD)\.?(?![\p{L}\d])/gu, 'limitid'],
  // "EQUNICO SE": after a name in capitals only, SE is a European company
  [/(?<=\p{Lu}{2}\s)SE(?!\p{L})/gu, 'spółka europejska'],
]

// Abbreviations of four letters and more that are spelled, not said as a word
const SPELLED = new Set(['FOMC', 'HICP', 'CPIF', 'MSCI', 'NYSE', 'OECD', 'IFRS'])
// Short words inside a name in capitals that are said as words ("VON", "DE")
const PARTICLES = new Set(['VON', 'VAN', 'DER', 'DEN', 'DEL', 'DOS', 'DAS', 'LOS', 'LAS', 'LES', 'DES', 'DIE', 'THE', 'AND', 'OF', 'UND'])
const VOWEL = /[AEIOUYĄĘÓ]/
// A short word that sounds like a syllable: "DI", "DOM", "BIT" (not PKO, PZU, ING, PGE, LPP)
const SYLLABLE = /^[^AEIOUYĄĘÓ][AEIOUYĄĘÓ][^AEIOUYĄĘÓ]?$/
const asWord = (w: string) => w[0] + w.slice(1).toLocaleLowerCase('pl')
// Letters as they are named in Polish
const PL_LETTERS: Record<string, string> = {
  A: 'a', B: 'be', C: 'ce', D: 'de', E: 'e', F: 'ef', G: 'gie', H: 'ha', I: 'i', J: 'jot', K: 'ka', L: 'el', M: 'em', N: 'en', O: 'o',
  P: 'pe', Q: 'ku', R: 'er', S: 'es', T: 'te', U: 'u', V: 'fał', W: 'wu', X: 'iks', Y: 'igrek', Z: 'zet',
}
const spell = (w: string) => [...w].map((c) => PL_LETTERS[c] ?? c).join(' ')
// Two letters, a consonant and a vowel (KO, PO): a voice says them as a word, but on their own they are an abbreviation
const SHORT_SYLLABLE = /^[^AEIOUYĄĘÓ][AEIOUYĄĘÓ]$/

// A word in capitals is said as a word when it is long enough to be one (4 letters and more, with
// a vowel). A short one goes with it when it is part of the same name and sounds like a syllable
// ("DI VOLIO", "DOM DEVELOPMENT", "VAN DER …"); on its own, or next to abbreviations, it stays an abbreviation.
function sayCapitals(text: string): string {
  const words = [...text.matchAll(/(?<!\p{L})\p{Lu}{2,}(?!\p{L})/gu)]
  if (words.length === 0) return text
  // Names: words in capitals with only spaces, hyphens or "&" between them
  const runs: RegExpMatchArray[][] = []
  for (const m of words) {
    const last = runs.at(-1)?.at(-1)
    if (last && /^[\s&-]+$/.test(text.slice(last.index! + last[0].length, m.index))) runs.at(-1)!.push(m)
    else runs.push([m])
  }
  const said = new Map<number, string>()
  for (const run of runs) {
    // On its own, not in a name: "klubu KO" is "klubu ka o"
    if (run.length === 1 && SHORT_SYLLABLE.test(run[0][0]) && PL_LETTERS[run[0][0][0]] && PL_LETTERS[run[0][0][1]]) { said.set(run[0].index!, spell(run[0][0])); continue }
    const long = (w: string) => w.length >= 4 && VOWEL.test(w) && !SPELLED.has(w)
    const named = run.some((m) => long(m[0]))
    for (const m of run) {
      const w = m[0]
      if (long(w)) said.set(m.index!, asWord(w))
      else if (named && PARTICLES.has(w)) said.set(m.index!, w.toLocaleLowerCase('pl'))
      else if (named && SYLLABLE.test(w)) said.set(m.index!, asWord(w))
    }
  }
  let out = '', at = 0
  for (const m of words) {
    const w = said.get(m.index!)
    if (w === undefined) continue
    out += text.slice(at, m.index) + w
    at = m.index! + m[0].length
  }
  return out + text.slice(at)
}

export function sayNames(text: string): string {
  let t = text
  for (const [re, said] of FORMS) {
    t = t.replace(re, (m, ...args) => {
      const at = args[args.length - 2] as number
      // At the start of a sentence: with a capital
      const word = at === 0 || /[.!?:]\s*$/.test(t.slice(0, at)) ? said[0].toLocaleUpperCase('pl') + said.slice(1) : said
      // Its dot also ended the sentence ("… Telestrada S.A. Raport …", or the very end): kept, for the pause
      return m.endsWith('.') && /^\s*($|\p{Lu})/u.test(t.slice(at + m.length)) ? `${word}.` : word
    })
  }
  return sayCapitals(t)
}

// ── Numbers and their units ──

const plural = (n: number, one: string, few: string, many: string) =>
  n === 1 ? one : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? few : many

type Forms = readonly [string, string, string, string]

// A currency: its word after a number (one, 2–4, 5+, and the genitive singular that a fraction takes), its gender (it shows in "jedna" and "dwie" before a
// feminine noun, "jedno" before a neuter one) and the small coin of its decimals ("12,50 USD" is "dwanaście dolarów i pięćdziesiąt centów")
interface Money { forms: Forms; gender: 'm' | 'f' | 'n'; minor?: Forms }
const GROSZE: Forms = ['grosz', 'grosze', 'groszy', 'grosza']
const CENT: Forms = ['cent', 'centy', 'centów', 'centa']
const crown = (stem: string): Forms => [`korona ${stem}a`, `korony ${stem}ie`, `koron ${stem}ich`, `korony ${stem}iej`]
const dollar = (stem: string): Forms => [`dolar ${stem}i`, `dolary ${stem}ie`, `dolarów ${stem}ich`, `dolara ${stem}iego`]
const MONEY: Record<string, Money> = {
  'zł': { forms: ['złoty', 'złote', 'złotych', 'złotego'], gender: 'm', minor: GROSZE },
  USD: { forms: ['dolar', 'dolary', 'dolarów', 'dolara'], gender: 'm', minor: CENT },
  EUR: { forms: ['euro', 'euro', 'euro', 'euro'], gender: 'n', minor: CENT },
  CHF: { forms: ['frank', 'franki', 'franków', 'franka'], gender: 'm', minor: ['centym', 'centymy', 'centymów', 'centyma'] },
  GBP: { forms: ['funt', 'funty', 'funtów', 'funta'], gender: 'm', minor: ['pens', 'pensy', 'pensów', 'pensa'] },
  CZK: { forms: crown('czesk'), gender: 'f', minor: ['halerz', 'halerze', 'halerzy', 'halerza'] },
  NOK: { forms: crown('norwesk'), gender: 'f' },
  SEK: { forms: crown('szwedzk'), gender: 'f' },
  DKK: { forms: crown('duńsk'), gender: 'f' },
  JPY: { forms: ['jen', 'jeny', 'jenów', 'jena'], gender: 'm' },
  CNY: { forms: ['juan', 'juany', 'juanów', 'juana'], gender: 'm' },
  HUF: { forms: ['forint', 'forinty', 'forintów', 'forinta'], gender: 'm' },
  RON: { forms: ['lej', 'leje', 'lei', 'leja'], gender: 'm' },
  RUB: { forms: ['rubel', 'ruble', 'rubli', 'rubla'], gender: 'm' },
  TRY: { forms: ['lira turecka', 'liry tureckie', 'lir tureckich', 'liry tureckiej'], gender: 'f' },
  UAH: { forms: ['hrywna', 'hrywny', 'hrywien', 'hrywny'], gender: 'f' },
  CAD: { forms: dollar('kanadyjsk'), gender: 'm', minor: CENT },
  AUD: { forms: dollar('australijsk'), gender: 'm', minor: CENT },
  NZD: { forms: dollar('nowozelandzk'), gender: 'm', minor: CENT },
}
// What else says a currency: the code PLN, the signs, the word itself ("5.000 złotych", "1,5 mln euro")
const MONEY_ALIAS: Record<string, string> = {
  PLN: 'zł', 'US$': 'USD', $: 'USD', '€': 'EUR', '£': 'GBP', euro: 'EUR',
  złotych: 'zł', złote: 'zł', złoty: 'zł', dolarów: 'USD', dolary: 'USD', dolar: 'USD', franków: 'CHF', franki: 'CHF', frank: 'CHF', funtów: 'GBP', funty: 'GBP', funt: 'GBP',
}
const moneyKey = (written: string) => MONEY_ALIAS[written] ?? written
const MONEY_CODES = ['zł', 'PLN', ...Object.keys(MONEY).filter((code) => code !== 'zł')].join('|')
const MONEY_WORDS = 'złotych|złote|złoty|dolarów|dolary|dolar|euro|franków|franki|frank|funtów|funty|funt'

const UNITS: Record<string, Forms> = { // one, 2–4, 5+, a fraction
  'tys.': ['tysiąc', 'tysiące', 'tysięcy', 'tysiąca'],
  'mln': ['milion', 'miliony', 'milionów', 'miliona'],
  'mld': ['miliard', 'miliardy', 'miliardów', 'miliarda'],
  'bln': ['bilion', 'biliony', 'bilionów', 'biliona'],
  'pkt': ['punkt', 'punkty', 'punktów', 'punktu'],
  'pkt proc.': ['punkt procentowy', 'punkty procentowe', 'punktów procentowych', 'punktu procentowego'],
  'pb': ['punkt bazowy', 'punkty bazowe', 'punktów bazowych', 'punktu bazowego'],
  'mkw': ['metr kwadratowy', 'metry kwadratowe', 'metrów kwadratowych', 'metra kwadratowego'],
  'proc.': ['procent', 'procent', 'procent', 'procent'],
  'godz.': ['godzina', 'godziny', 'godzin', 'godziny'],
  ...Object.fromEntries(Object.entries(MONEY).map(([code, money]) => [code, money.forms])),
}
// The units that are feminine, for the "jedna" and "dwie" of a long number
const UNIT_GENDER: Record<string, 'f'> = { 'godz.': 'f' }
const genderOf = (unit: string): 'm' | 'f' | 'n' => MONEY[unit]?.gender ?? UNIT_GENDER[unit] ?? 'm'
// After "mln", "tys."…: "5 mln zł" is "5 milionów złotych"
const OF_CURRENCY: Record<string, string> = Object.fromEntries(Object.entries(MONEY).map(([code, money]) => [code, money.forms[2]]))
// A number as it is written: "5.245.579,82" (Polish, dots between the thousands), "5 245 579,82" (spaces, the narrow and the hard ones too), "5,245,579.82"
// (English), "5'245'579.82" (Swiss), "5245579,82", "5245579.82" (a dot for the decimals). It does not go on with a digit, or a dot or a comma and a digit
// ("12.10.2026" and "1.2.3" are no amounts)
const AMOUNT_NUMBER = String.raw`(?:\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d{1,3}(?:[ \u00a0\u202f\u2009]\d{3})+(?:[.,]\d+)?|\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d{1,3}(?:['’]\d{3})+(?:[.,]\d+)?|\d+(?:[.,]\d+)?)(?!\d|[.,]\d)`
// The digits of a number as written and its decimals, "5.245.579,82" -> ["5245579", "82"]. A separator that stands once with three digits after it
// is the thousands one when the other kind (or a space) is not there for the decimals: "1.250" is a thousand two hundred and fifty (not "0.250", a quarter),
// "5,245" the Polish decimals unless a dollar or a pound stands before it ("$5,245"); two of them in a row ("1.234.567", "1,234,567") are thousands
function parseNumber(written: string, commaThousands = false): [string, string] {
  const t = written.replace(/[ \u00a0\u202f\u2009'’]/g, '')
  const dots = t.split('.').length - 1, commas = t.split(',').length - 1
  let decimal = ''
  if (dots && commas) decimal = t.lastIndexOf('.') > t.lastIndexOf(',') ? '.' : ','
  else if (dots === 1) decimal = t.length !== written.length || !/^[1-9]\d{0,2}\.\d{3}$/.test(t) ? '.' : ''
  else if (commas === 1) decimal = commaThousands && /^\d{1,3},\d{3}$/.test(t) ? '' : ','
  const at = decimal ? t.lastIndexOf(decimal) : -1
  return at < 0 ? [t.replace(/[.,]/g, ''), ''] : [t.slice(0, at).replace(/[.,]/g, ''), t.slice(at + 1)]
}
const digitsOf = ([whole, fraction]: [string, string]) => (fraction ? `${whole},${fraction}` : whole)
// "pkt.", "pkt. proc.", "pkt proc." and "p.p." are the percentage points; "pkt. procentowych" has the dot of "pkt." to drop
const UNIT_ALTERNATIVES = String.raw`tys\.|godz\.|pkt\.?\s?proc(?:\.|(?!\p{L}))|p\.\s?p\.|proc\.|pkt\.(?=\s+procentow)|(?:m\s?kw|mkw)\.?(?!\p{L})|m²|m2(?![\p{L}\d])|(?:mln|mld|bln|pkt|pb|${MONEY_CODES}|${MONEY_WORDS})(?!\p{L})|[€£$]`
const CURRENCY_AFTER = String.raw`(?:${MONEY_CODES}|${MONEY_WORDS})(?!\p{L})|[€£$]`
const UNIT = new RegExp(String.raw`(?<![\d.,])(${AMOUNT_NUMBER})(?:,[-–])?\s*(${UNIT_ALTERNATIVES})(\s+brk(?!\p{L}))?(?:\s+(${CURRENCY_AFTER}))?`, 'gu')
// A sign or a code before the amount: "$5,245.50", "€1,5 mln", "EUR 5.245.579,82", "PLN 5 000" are said as "5245,50 USD", "1,5 mln EUR", "5245579,82 EUR" (not a rate, "EUR 4,31 zł", which has a currency after it, and not the currency of an amount before it,
// "5 mln USD 3 proc.")
const CURRENCY_BEFORE = new RegExp(String.raw`(?<![\p{L}\d$€£])(?<!\d\s*(?:(?:mln|mld|bln|tys\.)\s*)?)(US\$|[€£$]|${MONEY_CODES.replace(/^zł\|/, '')})\s?(${AMOUNT_NUMBER})(?:\s?(mln|mld|bln|tys\.))?(?![\p{L}\d])(?!\s?(?:${MONEY_CODES}|${MONEY_WORDS})(?!\p{L}))`, 'gu')
// A range of amounts, one of them with a thousand or more: "od 5.000 do 10.000 zł", "z 5.000 do 10.000 zł", "2.500-3.000 zł": the first stands in the genitive and
// has no unit of its own, the second takes the unit
const AMOUNT_RANGE = new RegExp(String.raw`(?<![\d.,])(?:(od|z|ze)\s+)?(${AMOUNT_NUMBER})(\s?[-–]\s?|\s+do\s+)(?=(${AMOUNT_NUMBER})\s*(?:${UNIT_ALTERNATIVES}))`, 'giu')
// A number with no unit after it, written with separators ("1.234.567 akcji", "12 345 osób", "5'245'579"): the separators go, as a voice may read the groups as
// separate numbers or the dots as points. Spaces are the least sure: not after a digit and a space, not before another group (a phone number is "22 123 45 67"),
// not for "600 123 456", not after the words of numbers that are no amounts
const BARE_NUMBER = new RegExp(String.raw`(?<![\p{L}\d.,+§$€£])(?:\d{1,3}(?:\.\d{3})+,\d+|\d{1,3}(?:\.\d{3}){2,}|\d{1,3}(?:,\d{3})+\.\d+|\d{1,3}(?:,\d{3}){2,}|\d{1,3}(?:['’]\d{3})+(?:[.,]\d+)?|\d{1,3}(?:[\u00a0\u202f\u2009]\d{3})+(?:,\d+)?|(\d{1,3}(?: \d{3})+(?:,\d+)?))(?!\d|[.,]\d)`, 'gu')
const NOT_AN_AMOUNT = /(?:tel|telefon|kom|fax|nr|numer|NIP|KRS|REGON|PESEL|konto|rachunek|IBAN|ISBN|ISIN)\.?:?\s*$/iu
// "5.000 akcji", "1.250 osób": one dot and three digits, with a word after it, is a thousand and more, except for the numbers of a part of a document or a version
const SECTION_WORD = /(?:art|ust|pkt|lit|rozdz|par|nr|poz|tab|rys|zał|str|s|ver|wer|wersja|v|iso|rfc|sekcja|punkt|rozdział|załącznik|tabela|rysunek|strona|pozycja|numer|§)\.?\s*$/iu
const SINGLE_THOUSAND = /(?<![\p{L}\d.,+§$€£\/-])([1-9]\d{0,2}\.\d{3})(?=\s+\p{Ll}|\s*%)(?![\d]|[.,]\d)/gu
// "punktów proc." (the word is written out, only the "proc." is short) is "punktów procentowych", in the case of the noun
const POINT_PERCENT = /(?<!\p{L})(punkt(?:ów|y|u|em|ach|om|ami|owi)?|punkcie)\s+proc\./giu
const PERCENT_ADJECTIVE: Record<string, string> = {
  'punkt': 'procentowy', 'punkty': 'procentowe', 'punktów': 'procentowych', 'punktu': 'procentowego',
  'punktem': 'procentowym', 'punktach': 'procentowych', 'punktom': 'procentowym', 'punktami': 'procentowymi', 'punktowi': 'procentowemu',
  'punkcie': 'procentowym',
}
// Whether the dot of an abbreviation also ended the sentence: at the very end, or before a capital letter ("8 tys. Stopa…")
const endsSentence = (rest: string) => /^\s*($|\p{Lu})/u.test(rest)

// The unit below a big one: "5,483 mld" is 5 miliardów and 483 milionów, "1,234 mln" 1 milion and 234 tysiące; below a thousand
// there is the plain number ("5,483 tys." is "5 tysięcy 483"), null here, and nothing below that
const NEXT_UNIT: Record<string, string | null> = { 'bln': 'mld', 'mld': 'mln', 'mln': 'tys.', 'tys.': null }
// What a number written with decimals says: the whole part in the unit, then each group of three digits in the unit below, as
// pairs of an amount and its unit (null: the plain number). One or two decimals are the first group not filled up: "19,78 mln" is
// 19 milionów 780 tysięcy, "7,01 tys." 7 tysięcy 10, "6,1 tys." 6 tysięcy 100. Undefined when it is not written that way
function splitUnits(num: string, unit: string): [number, string | null][] | undefined {
  const [whole, fraction] = num.replace(/[\s\u00a0]/g, '').split(',')
  if (!fraction || fraction.length > 6 || !(unit in NEXT_UNIT)) return undefined
  const parts: [number, string | null][] = whole && +whole ? [[+whole, unit]] : []
  let below: string | null | undefined = NEXT_UNIT[unit]
  for (const group of fraction.padEnd(fraction.length > 3 ? 6 : 3, '0').match(/\d{3}/g)!) {
    if (below === undefined) return undefined
    if (+group) parts.push([+group, below])
    below = below === null ? undefined : NEXT_UNIT[below]
  }
  return parts.length ? parts : undefined
}

// Prepositions (and a few verbs and nouns: "w wysokości", "na poziomie", "rzędu") that ask for the genitive, with the words that only give a size in between ("do około 2 mld zł"): after them the unit is
// "do 2 miliardów złotych", "od 2 złotych", not "2 miliardy"
const GENITIVE_BEFORE = /(?:^|[\s(„"])(?:do|od|z|ze|bez|dla|u|wokół|obok|według|wg|spośród|wobec|powyżej|poniżej|zamiast|oprócz|wśród|sprzed|spod|brak|brakuje|brakowało|zabrakło|zabraknie|potrzeba|ciągu|czasie|okresie|przestrzeni|odstępie|wysokości|wartości|kwocie|kwoty|kwotą|sumy|cenie|ceny|ceną|kursie|kursu|limicie|limitu|równowartość|równowartości|równowartością|poziomie|rzędu|okolicach|granicach)\s+(?:(?:około|ok\.|blisko|prawie|niemal|ponad|nawet|aż|zaledwie|ledwie|przynajmniej)\s+)*$/iu
// The word after a number: the nominative by the number ("2 miliony", "5 milionów"), the genitive for "do 2 milionów", "do 1 miliona"
const unitForm = (forms: readonly string[], n: number, genitive: boolean) =>
  genitive ? (n === 1 ? forms[3] : forms[2]) : plural(n, forms[0], forms[1], forms[2])

// What a price is "per": "zł/l" is "złotych za litr"
const PER_UNIT: Record<string, string> = { l: 'litr', kg: 'kilogram', t: 'tonę', szt: 'sztukę', bbl: 'baryłkę', MWh: 'megawatogodzinę', kWh: 'kilowatogodzinę',
  GJ: 'gigadżul', mkw: 'metr kwadratowy', m2: 'metr kwadratowy', 'm²': 'metr kwadratowy' }

// A number in words, in the nominative or the genitive ("sześćset", "sześciuset"; "pięć milionów dwieście tysięcy", "pięciu milionów dwustu tysięcy"), up to
// 999 bilionów; a larger one stays in digits. A voice that reads "10 milionów 600 tysięcy" takes the genitive of "milionów" for the next number ("sześciuset"),
// so the parts are written out. A thousand, a million… of one are said without the "jeden" ("milion dwieście tysięcy").
const SCALES = ['', 'tys.', 'mln', 'mld', 'bln']
function numberWords(n: number, genitive: boolean): string {
  if (!(n > 0 && n < 1e15) || !Number.isInteger(n)) return String(n)
  if (n >= 1000) {
    const parts: string[] = []
    for (let scale = SCALES.length - 1; scale >= 0; scale--) {
      const group = Math.floor(n / 1000 ** scale) % 1000
      if (!group) continue
      // the last "jeden" of a long number stays in every case ("do stu jeden tysięcy", "do tysiąca jeden złotych")
      if (!scale) parts.push(group === 1 ? 'jeden' : numberWords(group, genitive))
      else parts.push(...(group === 1 ? [] : [numberWords(group, genitive)]), unitForm(UNITS[SCALES[scale]], group, genitive))
    }
    return parts.join(' ')
  }
  if (!genitive) return cardinal(n)
  const r = n % 100
  const tail = r < 10 ? [GEN_ONES[r]] : r < 20 ? [GEN_TEENS[r - 10]] : [GEN_TENS[Math.floor(r / 10)], GEN_ONES[r % 10]]
  const words = [GEN_HUNDREDS[Math.floor(n / 100)], ...tail].filter(Boolean).join(' ')
  // only a lone 1 is declined ("jednego miliona"); at the end of a longer number "jeden" stays ("do czterystu dziewięćdziesięciu jeden miliardów")
  return n > 1 ? words.replace(/ jednego$/, ' jeden') : words
}
// A number before a noun that has a gender: "jedna", "dwie" for a feminine one ("dwadzieścia dwie korony", not "dwa"), "jedno" for a neuter one ("jedno euro");
// the last word of the number is the one that changes, and a lone 1 in the genitive is "jednej" or "jednego"
function amountWords(n: number, genitive: boolean, gender: 'm' | 'f' | 'n'): string {
  const words = numberWords(n, genitive).split(' ')
  const last = words.length - 1
  if (gender !== 'm' && n === 1) words[last] = genitive ? (gender === 'f' ? 'jednej' : 'jednego') : gender === 'f' ? 'jedna' : 'jedno'
  else if (gender === 'f' && !genitive && n % 10 === 2 && n % 100 !== 12) words[last] = 'dwie'
  return words.join(' ')
}
// A number with no unit after it that says its gender ("jedna", "dwie" osoby): 1, 2 and the ones ending in them, except the teens
const hasGender = (n: number) => (n % 10 === 1 || n % 10 === 2) && (n % 100 < 11 || n % 100 > 19)
// "10 mln 600 tys. zł", "5 tys. 200 zł": a number after another with its unit, and one that another follows
const CHAIN_BEFORE = /(?:(?<![\d,])\d+\s*(?:bln|mld|mln|tys\.)\s+)+$/u
const CHAIN_AFTER = new RegExp(String.raw`^\s+\d+\s*(?:bln|mld|mln|tys\.|${MONEY_CODES})(?![\p{L}\d])`, 'u')

// "-41,7 tys." -> "minus 41,7 tysiąca", "-2,1 mln brk" -> "minus 2,1 miliona baryłek", "5 mln zł" -> "5 milionów złotych",
// "5,483 mld zł" -> "5 miliardów 483 miliony złotych", "13 pkt. proc." -> "13 punktów procentowych" (but "13 proc." -> "13 procent"),
// "5.245.579,82 zł" -> "pięć milionów dwieście czterdzieści pięć tysięcy pięćset siedemdziesiąt dziewięć złotych i osiemdziesiąt dwa grosze". An amount of a thousand
// and more is said in words, in the case the sentence asks for, whatever way it is written (dots, spaces, commas or an apostrophe between the thousands, a comma or
// a dot before the decimals, the currency before or after it, as a code, a sign or a word); a voice declines the digits as it likes, and after words it is often wrong
export function sayNumbers(text: string): string {
  return text
    .replace(/(^|[\s(])[-\u2212](?=\d)/g, '$1minus ')
    // "$5,245.50", "€1,5 mln", "EUR 5.245.579,82": the sign or the code after the amount
    .replace(CURRENCY_BEFORE, (m: string, sign: string, num: string, scale?: string) =>
      `${digitsOf(parseNumber(num, /^(?:US\$|\$|£)$/.test(sign)))}${scale ? ` ${scale}` : ''} ${moneyKey(sign)}`)
    // "7,06 zł/l" -> "7,06 zł za litr", "70 USD/bbl" -> "70 USD za baryłkę"
    .replace(new RegExp(String.raw`(\d\s?(?:${MONEY_CODES}))\/(l|kg|t|szt\.?|bbl|MWh|kWh|GJ|mkw|m2|m²)(?![\p{L}\d])`, 'gu'),
      (m: string, amount: string, per: string, at: number, all: string) =>
        `${amount} za ${PER_UNIT[per.replace(/\.$/, '')]}${per.endsWith('.') && endsSentence(all.slice(at + m.length)) ? '.' : ''}`)
    // "71,0 proc.", "4,00%", "5,0 mld zł": a decimal that is only zeros is the whole number
    .replace(new RegExp(String.raw`(?<![\d,.])(\d+),0+(?=\s?%(?![\p{L}\d])|\s*(?:tys\.|godz\.|pkt\s?proc\.|p\.\s?p\.|proc\.|(?:mln|mld|bln|pkt|pb|${MONEY_CODES})(?![\p{L}\d])))`, 'gu'), '$1')
    // "od 5.000 do 10.000 zł", "2.500-3.000 zł": the first of the two in words ("od pięciu tysięcy do …"), the second is left to its unit
    .replace(AMOUNT_RANGE, (m: string, lead: string | undefined, first: string, between: string, second: string) => {
      const [from, to] = [parseNumber(first), parseNumber(second)]
      const dash = /[-–]/.test(between)
      if (from[1] || to[1] || from[0].length > 15 || to[0].length > 15 || (!dash && !lead) || +from[0] >= +to[0] || +to[0] < 1000) return m
      return `${lead ?? 'od'} ${numberWords(+from[0], true)} do `
    })
    .replace(UNIT, (m: string, num: string, written: string, barrels: string | undefined, currencyWritten: string | undefined, at: number, all: string) => {
      const amount = parseNumber(num)
      // a decimal that is only zeros is the whole number: "5.245,00 zł" is "5245 zł"
      if (/^0+$/.test(amount[1])) amount[1] = ''
      const [whole, fraction] = amount
      const digits = digitsOf(amount)
      const currency = currencyWritten ? moneyKey(currencyWritten) : undefined
      const key = moneyKey(written)
      const unit = /^p\.\s?p\.$|^pkt\.?\s?proc\.?$/.test(key) ? 'pkt proc.' : key === 'pkt.' ? 'pkt' : /^(?:m\s?kw\.?|m²|m2)$/.test(key) ? 'mkw' : key.replace(/\s+/g, ' ')
      const forms = UNITS[unit]
      const n = whole.length <= 15 ? +whole : NaN
      const big = n >= 1000 && !fraction
      // "5 złotych", "10 euro": already in words, and nothing to add to a small number
      if (key !== written && /^[a-ząćęłńóśźż]+$/.test(written) && !big && !fraction && !currency) return m
      // after "10 mln" the next number is in the case of the first one: the genitive context is the one before the whole chain
      const rest = all.slice(at + m.length)
      const chain = all.slice(Math.max(0, at - 120), at).match(CHAIN_BEFORE)
      const chainStart = at - (chain?.[0].length ?? 0)
      const genitive = GENITIVE_BEFORE.test(all.slice(Math.max(0, chainStart - 60), chainStart))
      // "2,5-3,5 mln zł": the first number of a range has no unit of its own, so the second keeps the fraction, as the first has it
      const inRange = /\d[-–]$/.test(all.slice(Math.max(0, at - 2), at))
      const end = !currency && !barrels && written.endsWith('.') && endsSentence(rest)
      // "7,06 zł" -> "7 złotych i 6 groszy", "0,45 zł" -> "45 groszy", "2,5 zł" -> "2 złote i 50 groszy", "12,50 USD" -> "12 dolarów i 50 centów": one or two
      // decimals are the small coin
      const money = MONEY[unit]
      if (money?.minor && !currency && !barrels && !inRange && fraction && fraction.length <= 2 && n >= 0) {
        const small = +fraction.padEnd(2, '0')
        return [n ? `${amountWords(n, genitive, money.gender)} ${unitForm(forms, n, genitive)}` : '', `${numberWords(small, genitive)} ${unitForm(money.minor, small, genitive)}`].filter(Boolean).join(' i ')
      }
      const parts = inRange || Number.isNaN(n) ? undefined : splitUnits(digits, unit)
      if (parts) {
        // a number with a unit is in words; the last one with no unit only when it does not show a gender ("dwie osoby"), or when a currency follows it
        const said = parts.map(([count, u]) => {
          const words = u || !hasGender(count) || currency ? amountWords(count, genitive, u ? 'm' : currency ? genderOf(currency) : 'm') : String(count)
          return u ? `${words} ${unitForm(UNITS[u], count, genitive)}` : words
        }).join(' ')
        const [last, lastUnit] = parts[parts.length - 1]
        const noun = currency ? ` ${lastUnit ? OF_CURRENCY[currency] : unitForm(UNITS[currency], last, genitive)}` : ''
        return `${said}${barrels ? ' baryłek' : ''}${noun}${end ? '.' : ''}`
      }
      const word = fraction ? forms[3] : unitForm(forms, n, genitive)
      // "10 mln 600 tys. zł": the numbers of such a chain are in words too, when the noun is masculine or the number shows no gender
      const chained = (chain || CHAIN_AFTER.test(rest)) && !fraction && !Number.isNaN(n) && (unit in NEXT_UNIT || genderOf(unit) === 'm' || !hasGender(n))
      const spoken = big || chained ? amountWords(n, genitive, genderOf(unit)) : digits
      return `${spoken} ${word}${barrels ? ' baryłek' : ''}${currency ? ` ${OF_CURRENCY[currency]}` : ''}${end ? '.' : ''}`
    })
    .replace(BARE_NUMBER, (m: string, spaced: string | undefined, at: number, all: string) => {
      const before = all.slice(Math.max(0, at - 30), at)
      if (m.startsWith('0')) return m
      if (spaced && (/\d\s$/.test(before) || /^\s\d/.test(all.slice(at + m.length)) || /^\d{3} \d{3} \d{3}$/.test(m) || NOT_AN_AMOUNT.test(before))) return m
      // four groups of an address or a version ("192.168.100.200"): every one up to 255
      if (/^\d{1,3}(?:\.\d{3}){3}$/.test(m) && m.split('.').every((group) => +group <= 255 && !group.startsWith('0'))) return m
      return digitsOf(parseNumber(m, true))
    })
    .replace(SINGLE_THOUSAND, (m: string, num: string, at: number, all: string) => SECTION_WORD.test(all.slice(Math.max(0, at - 14), at)) ? m : digitsOf(parseNumber(num)))
    // "700 tys. mkw. magazynów" -> "700 tysięcy metrów kwadratowych magazynów": the dot ends the abbreviation, not the sentence
    .replace(/(tysiąc|tysiące|tysięcy|tysiąca|milion|miliony|milionów|miliona|miliard|miliardy|miliardów|miliarda|bilion|biliony|bilionów|biliona)(\s+)(?:m\s?kw|mkw)(\.?)(?![\p{L}\d])/gu,
      (m: string, scale: string, space: string, dot: string, at: number, all: string) =>
        `${scale}${space}metrów kwadratowych${dot && endsSentence(all.slice(at + m.length)) ? '.' : ''}`)
    .replace(POINT_PERCENT, (m: string, noun: string, at: number, all: string) =>
      `${noun} ${PERCENT_ADJECTIVE[noun.toLowerCase()]}${endsSentence(all.slice(at + m.length)) ? '.' : ''}`)
}

// ── Addresses: "przy Puławskiej 48" is "przy Puławskiej czterdzieści osiem" ──

// A house number is said as a plain number, whatever the street name before it: a voice may take it for an ordinal
// or give it the ending of the street ("czterdziestej ósmej"). So it is written out here.
const CARD_ONES = ['', 'jeden', 'dwa', 'trzy', 'cztery', 'pięć', 'sześć', 'siedem', 'osiem', 'dziewięć']
const CARD_TEENS = ['dziesięć', 'jedenaście', 'dwanaście', 'trzynaście', 'czternaście', 'piętnaście', 'szesnaście', 'siedemnaście', 'osiemnaście', 'dziewiętnaście']
const CARD_TENS = ['', '', 'dwadzieścia', 'trzydzieści', 'czterdzieści', 'pięćdziesiąt', 'sześćdziesiąt', 'siedemdziesiąt', 'osiemdziesiąt', 'dziewięćdziesiąt']
const CARD_HUNDREDS = ['', 'sto', 'dwieście', 'trzysta', 'czterysta', 'pięćset', 'sześćset', 'siedemset', 'osiemset', 'dziewięćset']
const GEN_ONES = ['', 'jednego', 'dwóch', 'trzech', 'czterech', 'pięciu', 'sześciu', 'siedmiu', 'ośmiu', 'dziewięciu']
const GEN_TEENS = ['dziesięciu', 'jedenastu', 'dwunastu', 'trzynastu', 'czternastu', 'piętnastu', 'szesnastu', 'siedemnastu', 'osiemnastu', 'dziewiętnastu']
const GEN_TENS = ['', '', 'dwudziestu', 'trzydziestu', 'czterdziestu', 'pięćdziesięciu', 'sześćdziesięciu', 'siedemdziesięciu', 'osiemdziesięciu', 'dziewięćdziesięciu']
const GEN_HUNDREDS = ['', 'stu', 'dwustu', 'trzystu', 'czterystu', 'pięciuset', 'sześciuset', 'siedmiuset', 'ośmiuset', 'dziewięciuset']
// 48 -> "czterdzieści osiem", 305 -> "trzysta pięć" (up to 999)
function cardinal(n: number): string {
  const r = n % 100
  const tail = r < 10 ? [CARD_ONES[r]] : r < 20 ? [CARD_TEENS[r - 10]] : [CARD_TENS[Math.floor(r / 10)], CARD_ONES[r % 10]]
  return [CARD_HUNDREDS[Math.floor(n / 100)], ...tail].filter(Boolean).join(' ') || 'zero'
}
// What stands before a street name: "ul.", "al.", "pl.", "os." and the words for them, or a preposition
// ("przy", "na", "w") and then a street name that is an adjective ("Puławskiej", "Alejach Jerozolimskich")
const STREET_MARKERS = new Set(['ul.', 'ulica', 'ulicy', 'ulicą', 'ulicę', 'al.', 'aleja', 'alei', 'aleje', 'alejach', 'aleją', 'pl.', 'plac', 'placu',
  'os.', 'osiedle', 'osiedlu', 'rondo', 'rondzie', 'rynek', 'rynku', 'skwer', 'skweru', 'bulwar', 'bulwaru'])
const STREET_PREPS = new Set(['przy', 'na', 'w', 'we', 'do', 'od', 'z', 'ze', 'u', 'pod', 'nad', 'za', 'przed', 'obok', 'koło', 'wzdłuż'])
const STREET_WORD = /^\p{Lu}[\p{L}-]*$/u
function isStreet(words: string[]): boolean {
  // the street name: up to three words with a capital letter, at the end
  let n = 0
  while (n < 3 && n < words.length && STREET_WORD.test(words[words.length - 1 - n].replace(/\.$/, ''))) n++
  if (n === 0) return false
  const last = words[words.length - 1].toLowerCase()
  const asks = (marker: string) => STREET_MARKERS.has(marker) || (STREET_PREPS.has(marker) && /(?:ej|ich)$/.test(last))
  const before = words[words.length - 1 - n]?.toLowerCase()
  if (before !== undefined && asks(before)) return true
  // at the start of a sentence the preposition has a capital letter too: "Przy Puławskiej 48"
  return n >= 2 && asks(words[words.length - n].toLowerCase())
}
// The number: 1 to 3 digits, a letter after it ("5A"), a second number after a slash ("63/65": "łamane przez"); not a
// decimal, a time, a date, a percentage or a range
const HOUSE = /((?:[\p{L}][\p{L}-]*\.?\s+){1,4})(\d{1,3})([A-Za-z])?(?:\/(\d{1,3})([A-Za-z])?)?(?![\p{L}\d]|[,.:]\d|%|[-–]\d)/gu
export const sayAddresses = (text: string) =>
  text.replace(HOUSE, (m: string, head: string, num: string, letter?: string, num2?: string, letter2?: string) => {
    if (!isStreet(head.trim().split(/\s+/))) return m
    const one = (n: string, l?: string) => `${cardinal(+n)}${l ? ` ${l}` : ''}`
    return `${head}${one(num, letter)}${num2 ? ` łamane przez ${one(num2, letter2)}` : ''}`
  })

// ── "nr 20/2024": a number of a document, not a fraction ──

// "Raport bieżący nr 20/2024" -> "Raport bieżący numer 20 przez 2024", the numbers after it in a list the same ("nr 5/2025 i 6/2025"
// -> "numer 5 przez 2025 i 6 przez 2025"). With more after the second number ("nr 3/2024/05") it stays as written.
const ISSUE = /(?<![\p{L}\d])(nr|numer)\.?\s*(\d{1,4})\/((?:19|20)\d{2}|\d{2})(?![\d\/]|-\d)/giu
const ISSUE_NEXT = /(przez (?:\d{2}|\d{4}))((?:,\s*|\s+(?:i|oraz|lub|albo)\s+))(\d{1,4})\/((?:19|20)\d{2}|\d{2})(?![\d\/])/gu
export function sayIssueNumbers(text: string): string {
  let t = text.replace(ISSUE, (m, word: string, n: string, year: string) => `${/^[A-Z]/.test(word) ? 'Numer' : 'numer'} ${n} przez ${year}`)
  for (let before = ''; before !== t; ) { before = t; t = t.replace(ISSUE_NEXT, '$1$2$3 przez $4') }
  return t
}

// ── Words made of a number: "19-latka" is "dziewiętnastolatka" ──

const C_UNITS = ['', 'jedno', 'dwu', 'trzy', 'cztero', 'pięcio', 'sześcio', 'siedmio', 'ośmio', 'dziewięcio']
const C_TEENS = ['dziesięcio', 'jedenasto', 'dwunasto', 'trzynasto', 'czternasto', 'piętnasto', 'szesnasto', 'siedemnasto', 'osiemnasto', 'dziewiętnasto']
const C_TENS = ['', '', 'dwudziesto', 'trzydziesto', 'czterdziesto', 'pięćdziesięcio', 'sześćdziesięcio', 'siedemdziesięcio', 'osiemdziesięcio', 'dziewięćdziesięcio']
const C_HUNDREDS = ['', 'stu', 'dwustu', 'trzystu', 'czterystu', 'pięćset', 'sześćset', 'siedemset', 'osiemset', 'dziewięćset']
function compound(n: number): string {
  if (n === 1000) return 'tysiąc'
  const r = n % 100
  return C_HUNDREDS[Math.floor(n / 100)] + (r === 0 ? '' : r < 10 ? C_UNITS[r] : r < 20 ? C_TEENS[r - 10] : C_TENS[Math.floor(r / 10)] + C_UNITS[r % 10])
}
// Not words but endings of numerals ("1-szy", "lata 90-te", "90-tych")
const NUMERAL_ENDING = /^(szy|sza|sze|szego|szej|szym|gi|ga|gie|giego|giej|gim|ci|cia|cie|ciego|ciej|cim|ty|ta|te|tego|tej|tym|tych|ych|ego|ej|ym)$/
// "15-proc. wzrost" -> "piętnastoprocentowy wzrost": the ending from the word after it ("podwyżka", "zadłużenie")
const percentAdjective = (next: string) => (/^\p{L}*a$/u.test(next) ? 'procentowa' : /^\p{L}*[eo]$/u.test(next) ? 'procentowe' : 'procentowy')
// "19-latka" -> "dziewiętnastolatka", "3-krotnie" -> "trzykrotnie", "2-letni" -> "dwuletni", "100-lecie" -> "stulecie"
export const sayCompounds = (text: string) =>
  text
    .replace(/(?<![\p{L}\d,.])(\d{1,4})-proc\.\s*(\p{L}*)/gu, (m, num: string, next: string) =>
      +num >= 1 && +num <= 1000 ? `${compound(+num)}${percentAdjective(next)}${next ? ` ${next}` : ''}` : m)
    .replace(/(?<![\p{L}\d,.])(\d{1,4})-(\p{Ll}+)/gu, (m, num: string, word: string) =>
      +num >= 1 && +num <= 1000 && word.length >= 4 && !NUMERAL_ENDING.test(word) ? compound(+num) + word : m)

// ── Quarters and years in words, in the case the word before asks for ──

type Kase = 'nom' | 'gen' | 'loc' | 'inst'
// The case after a preposition ("w III kw." -> "w trzecim kwartale", "za III kw." -> "za trzeci kwartał"); else the genitive
const CASE_AFTER: Record<string, Kase> = {
  w: 'loc', we: 'loc', po: 'loc', o: 'loc', przy: 'loc', na: 'nom', za: 'nom',
  przed: 'inst', nad: 'inst', pod: 'inst', między: 'inst', poza: 'inst',
}
const caseAfter = (before: string): Kase => CASE_AFTER[before.match(/(\p{L}+)\s*$/u)?.[1]?.toLocaleLowerCase('pl') ?? ''] ?? 'gen'

const ORD_UNITS = ['', 'pierwsz', 'drug', 'trzec', 'czwart', 'piąt', 'szóst', 'siódm', 'ósm', 'dziewiąt']
const ORD_TEENS = ['dziesiąt', 'jedenast', 'dwunast', 'trzynast', 'czternast', 'piętnast', 'szesnast', 'siedemnast', 'osiemnast', 'dziewiętnast']
const ORD_TENS = ['', '', 'dwudziest', 'trzydziest', 'czterdziest', 'pięćdziesiąt', 'sześćdziesiąt', 'siedemdziesiąt', 'osiemdziesiąt', 'dziewięćdziesiąt']
// An ordinal with an ending as written after a hard stem ("pierwsz" + "ej"); "drug" and "trzec" are
// soft: "drugiej", "trzecia"
function ordAs(stem: string, end: string): string {
  if (stem === 'drug' || stem === 'trzec') {
    end = end.replace(/^y/, 'i').replace(/^e/, 'ie')
    if (stem === 'trzec') end = end.replace(/^([aą])/, 'i$1')
  }
  return stem + end
}
// The masculine endings in each case; the neuter ones differ only in the nominative ("pierwsze")
const ENDS: Record<Kase, string> = { nom: 'y', gen: 'ego', loc: 'ym', inst: 'ym' }
const ord = (stem: string, k: Kase) => ordAs(stem, ENDS[k])
// 26 with "ego" -> "dwudziestego szóstego"
function ordinalAs(n: number, end: string): string {
  if (n < 10) return ordAs(ORD_UNITS[n], end)
  if (n < 20) return ordAs(ORD_TEENS[n - 10], end)
  const tens = ordAs(ORD_TENS[Math.floor(n / 10)], end)
  return n % 10 ? `${tens} ${ordAs(ORD_UNITS[n % 10], end)}` : tens
}
const ordinal = (n: number, k: Kase, neuter = false) => ordinalAs(n, neuter && k === 'nom' ? 'e' : ENDS[k])
const ROK: Record<Kase, string> = { nom: 'rok', gen: 'roku', loc: 'roku', inst: 'rokiem' }
// 2026 -> "dwa tysiące dwudziestego szóstego roku"
function yearWords(y: number, k: Kase): string {
  const n = y === 2000 ? ord('dwutysięczn', k) : y > 2000 && y < 2100 ? `dwa tysiące ${ordinal(y - 2000, k)}`
    : y === 1900 ? ord('tysiąc dziewięćsetn', k) : y > 1900 && y < 2000 ? `tysiąc dziewięćset ${ordinal(y - 1900, k)}` : String(y)
  return `${n} ${ROK[k]}`
}
const fullYear = (yy: string) => (yy.length === 4 ? +yy : +yy >= 80 ? 1900 + +yy : 2000 + +yy)

// 160 -> "sto sześćdziesiątego"; bigger numbers stay as they are
const ordinalUpTo199 = (n: number, k: Kase) => (n < 100 ? ordinal(n, k) : n === 100 ? ord('setn', k) : n < 200 ? `sto ${ordinal(n - 100, k)}` : String(n))
// "XXI" -> 21, up to 39; anything else NaN
const ROMAN_DIGIT: Record<string, number> = { I: 1, V: 5, X: 10 }
function roman(s: string): number {
  if (!s || !/^X{0,3}(?:IX|IV|V?I{0,3})$/.test(s)) return NaN
  return [...s].reduce((n, c, i) => n + (ROMAN_DIGIT[c] < (ROMAN_DIGIT[s[i + 1]] ?? 0) ? -ROMAN_DIGIT[c] : ROMAN_DIGIT[c]), 0)
}
const KWARTAL: Record<Kase, string> = { nom: 'kwartał', gen: 'kwartału', loc: 'kwartale', inst: 'kwartałem' }
const POLROCZE: Record<Kase, string> = { nom: 'półrocze', gen: 'półrocza', loc: 'półroczu', inst: 'półroczem' }
// The case a written-out noun is in
const NOUN_CASE: Record<string, Kase> = {
  kwartał: 'nom', kwartału: 'gen', kwartale: 'loc', kwartałem: 'inst',
  półrocze: 'nom', półrocza: 'gen', półroczu: 'loc', półroczem: 'inst',
}
// After the quarter, its year: "'26", "2026", "2026 r."
const YEAR_AFTER = String.raw`(?:\s?(?:'(\d{2})|((?:19|20)\d{2})(?:\s?r\.|\s?roku)?)(?![\d\p{L}]))?`
const QUARTER = new RegExp(String.raw`(?<![\p{L}\d])(IV|I{1,3}|[1-4])\s?(kw\.|kwarta(?:łu|łem|ł|le)(?!\p{L})|półr\.|półrocz(?:em|e|a|u)(?!\p{L}))` + YEAR_AFTER, 'gu')
const Q_QUARTER = new RegExp(String.raw`(?<![\p{L}\d])(?:Q([1-4])|([1-4])Q)(?:\s?'?(\d{2})(?![\d\p{L}])|\s((?:19|20)\d{2})(?![\d\p{L}]))?(?![\p{L}\d])`, 'gu')
const sentenceGoesOn = (rest: string) => !/^\s*($|\p{Lu})/u.test(rest)

// "w III kw. '26" -> "w trzecim kwartale dwa tysiące dwudziestego szóstego roku", "za II kw." -> "za drugi kwartał",
// "wyniki IV kw." -> "wyniki czwartego kwartału", "w I półr." -> "w pierwszym półroczu", "w 3Q26" -> "w trzecim kwartale …"
export function sayQuarters(text: string): string {
  const say = (n: number, half: boolean, k: Kase, yy?: string) =>
    `${ordinal(n, k, half)} ${(half ? POLROCZE : KWARTAL)[k]}${yy ? ` ${yearWords(fullYear(yy), 'gen')}` : ''}`
  return text
    .replace(QUARTER, (m, num: string, noun: string, short?: string, long?: string, at?: number, all?: string) => {
      const n = /\d/.test(num) ? +num : roman(num)
      const half = noun.startsWith('pół')
      if (half && n > 2) return m
      const k = NOUN_CASE[noun] ?? caseAfter(all!.slice(0, at))
      // "w III kw. Spółka…": the abbreviation's dot also ended the sentence
      const dot = /\.$/.test(m) && !sentenceGoesOn(all!.slice(at! + m.length)) ? '.' : ''
      return say(n, half, k, short ?? long) + dot
    })
    .replace(Q_QUARTER, (m, a?: string, b?: string, short?: string, long?: string, at?: number, all?: string) => {
      const before = all!.slice(0, at)
      // "Audi Q3" stays: a quarter only with its year or after a preposition
      const word = before.match(/(\p{L}+)\s*$/u)?.[1]?.toLocaleLowerCase('pl') ?? ''
      if (!(short ?? long) && !(word in CASE_AFTER) && !['z', 'ze', 'od', 'do', 'dla'].includes(word)) return m
      return say(+(a ?? b)!, false, caseAfter(before), short ?? long)
    })
}

// ── Months as Roman numerals: "po VIII" is "po sierpniu" ──

const MONTH_NAMES: Record<Kase, string[]> = {
  nom: ['styczeń', 'luty', 'marzec', 'kwiecień', 'maj', 'czerwiec', 'lipiec', 'sierpień', 'wrzesień', 'październik', 'listopad', 'grudzień'],
  gen: ['stycznia', 'lutego', 'marca', 'kwietnia', 'maja', 'czerwca', 'lipca', 'sierpnia', 'września', 'października', 'listopada', 'grudnia'],
  loc: ['styczniu', 'lutym', 'marcu', 'kwietniu', 'maju', 'czerwcu', 'lipcu', 'sierpniu', 'wrześniu', 'październiku', 'listopadzie', 'grudniu'],
  inst: ['styczniem', 'lutym', 'marcem', 'kwietniem', 'majem', 'czerwcem', 'lipcem', 'sierpniem', 'wrześniem', 'październikiem', 'listopadem', 'grudniem'],
}
// The case a month is in after these words: the preposition, or the noun it is the end, beginning or middle of
const MONTH_CASE: Record<string, Kase> = {
  po: 'loc', w: 'loc', we: 'loc', przy: 'loc', przed: 'inst', za: 'nom', do: 'gen', od: 'gen', z: 'gen', ze: 'gen', wg: 'gen', według: 'gen',
  koniec: 'gen', końca: 'gen', końcu: 'gen', początek: 'gen', początku: 'gen', połowie: 'gen', połowy: 'gen',
}
// After these a lone "I", "V" or "X" is a month too: nothing else is "na koniec X"
const MONTH_SURE = new Set(['po', 'koniec', 'końca', 'końcu', 'początek', 'początku', 'połowie', 'połowy'])
const MONTH_NUM = String.raw`(?:XII|XI|IX|X|VIII|VII|VI|IV|V|III|II|I)`
const MONTH_END = String.raw`(?![\p{L}\d]|[.,]\d)`
const MONTH_ONE = new RegExp(String.raw`(?<![\p{L}\d.,-])(${Object.keys(MONTH_CASE).join('|')})(\s+)(${MONTH_NUM})(?![-–])${MONTH_END}`, 'giu')
const MONTH_RANGE = new RegExp(String.raw`(?<![\p{L}\d.,-])(w\s+okresie|za\s+okres|okresie|okres|w|za)(\s+)(${MONTH_NUM})\s*[-–]\s*(${MONTH_NUM})${MONTH_END}`, 'giu')
const MONTH_FROM_TO = new RegExp(String.raw`(?<![\p{L}\d.,-])(od)(\s+)(${MONTH_NUM})(\s+do\s+)(${MONTH_NUM})${MONTH_END}`, 'giu')
// A numeral that goes with the next word is not a month: "po II wojnie", "w III RP", "w II kw.", "po V Symfonii", "w II wariancie". With a
// verb, a conjunction, a number or nothing after it, it is: "po VIII wyniosły", "do VII spadły", "w VIII br.", "po VIII wydatki wzrosły"
const ORDINAL_NOUNS = new Set(['symfonii', 'sonacie', 'sztuce', 'seansie', 'odcinku', 'szczeblu', 'stopniu', 'serialu', 'liceum', 'gimnazjum'])
const monthStays = (rest: string) => {
  const next = rest.match(/^\s+(\p{L}[\p{L}.]*)/u)?.[1]
  if (!next) return false
  const word = next.replace(/\.$/, '').toLocaleLowerCase('pl')
  return /^\p{Lu}/u.test(next) || NUMBERED.test(word) || /^(?:kw|półr|rp)$/.test(word) || next === 'w.' || ORDINAL_NOUNS.has(word) || MASC_LOC_E.has(word)
}

// A day and its month in Roman numerals: "do 11 X" -> "do 11 października", "od 1 I do 31 XII" -> "od 1 stycznia do 31 grudnia", "11 X 2026 r." ->
// "11 października …", "19-20 X" -> "19-20 października". A number of a day with a Roman numeral after it is a date, whatever stands before it
// ("Ceny paliw 19 X", "Wtorek 19 X"): "X" on its own is hardly ever anything else (a website, formerly Twitter, has no number before it).
// Only the lone "I" (it is "and" too) wants a word that goes with a date (do, od, z, na, po, w, dnia…), and "V" ("5 V" is five volts) a year.
const DATE_WORD = /(?:^|\s)(?:do|od|z|ze|na|po|przed|w|we|dnia|dniu|wg|według|stan|za|dzień|dzień)\s+$/iu
const YEAR_AFTER_MONTH = /^\s*(?:r\.|roku|rok|'\d\d|(?:19|20)\d{2}|dwa tysiące|tysiąc dziewięćset)/u
// "5 X 3" is a product or a size, a date only with a year or a time after it ("19 X 10:00")
const SIZE_AFTER = /^\s+\d(?!\d?[:.]\d{2})/u
const MONTH_DAY = new RegExp(String.raw`(?<![\p{L}\d.,/:-])(?:(\d{1,2})(\s?[-–]\s?))?(\d{1,2})(\s+)(${MONTH_NUM})(?![\p{L}\d-]|[.,]\d)`, 'gu')
export function sayMonthDays(text: string): string {
  return text.replace(MONTH_DAY, (m: string, first: string | undefined, dash: string | undefined, day: string, space: string, num: string, at: number, all: string) => {
    if (+day < 1 || +day > 31 || (first !== undefined && (+first < 1 || +first >= +day))) return m
    const rest = all.slice(at + m.length)
    const year = YEAR_AFTER_MONTH.test(rest)
    if (!year && (num === 'V' || (num === 'I' && !DATE_WORD.test(all.slice(0, at))))) return m
    if (!year && num === 'X' && SIZE_AFTER.test(rest)) return m
    const next = rest.match(/^\s+(\p{L}[\p{L}.]*)/u)?.[1]?.replace(/\.$/, '').toLocaleLowerCase('pl')
    if (next && (NUMBERED.test(next) || /^(?:kw|półr|rp)$/.test(next))) return m
    return `${first !== undefined ? `${first}${dash}` : ''}${day} ${MONTH_NAMES.gen[roman(num) - 1]}`
  })
}

// A range of small numbers before a noun that is counted: "w ciągu 2-3 lat" is "w ciągu dwóch trzech lat", "za 2-3 lata" "za dwa trzy lata", "1-2 godziny"
// "jedna dwie godziny", "po 2-3 latach" "po dwóch trzech latach". Written with a dash a voice says "2 minus 3"; the numbers are in the case the noun
// shows (the plural "lata" is the nominative, "latach" the locative) or, with "lat" and "dni", which are the genitive plural and also stand after
// 5 and more, the case the words before ask for ("w ciągu", "do", "od"…).
type Counted = { gender: 'm' | 'f' | 'n'; form: 'nom' | 'gen' | 'loc' | 'amb' }
const COUNTED: Record<string, Counted> = {}
for (const [gender, nom, gen, loc] of [
  ['m', 'lata', 'lat', 'latach'], ['m', 'miesiące', 'miesięcy', 'miesiącach'], ['m', 'tygodnie', 'tygodni', 'tygodniach'],
  ['m', 'dni', 'dni', 'dniach'], ['m', 'kwartały', 'kwartałów', 'kwartałach'], ['m', 'razy', 'razy', ''],
  ['f', 'godziny', 'godzin', 'godzinach'], ['f', 'minuty', 'minut', 'minutach'], ['f', 'sekundy', 'sekund', 'sekundach'],
  ['f', 'osoby', 'osób', 'osobach'],
] as const) {
  COUNTED[nom] = { gender, form: nom === gen ? 'amb' : 'nom' }
  COUNTED[gen] ??= { gender, form: 'gen' }
  if (loc) COUNTED[loc] = { gender, form: 'loc' }
}
const COUNT_RANGE = new RegExp(String.raw`(?<![\p{L}\d.,/:-])(\d{1,2})\s?[-–]\s?(\d{1,2})\s+(${Object.keys(COUNTED).join('|')})(?![\p{L}\d-])`, 'gu')
// 2, 3, 4 and the ones ending in them (not the teens) are the numbers that take the plural "lata", not "lat", in the nominative
const FEW = (n: number) => n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14)
// "jeden" is "jedna" and "dwa" is "dwie" with a feminine noun (as the last word of the number); a lone 1 in the genitive and the locative is "jednego",
// "jednej" (feminine) or "jednym" (the locative, masculine and neuter); at the end of a longer number "jeden" stays in every case
function countWords(n: number, kase: 'nom' | 'gen' | 'loc', gender: 'm' | 'f' | 'n'): string {
  const words = numberWords(n, kase !== 'nom').split(' ')
  const last = words.length - 1
  if (n === 1) words[last] = kase === 'nom' ? { m: 'jeden', f: 'jedna', n: 'jedno' }[gender] : gender === 'f' ? 'jednej' : kase === 'loc' ? 'jednym' : 'jednego'
  if (n % 10 === 2 && n % 100 !== 12 && kase === 'nom' && gender === 'f') words[last] = 'dwie'
  return words.join(' ')
}
export const sayCountRanges = (text: string) =>
  text.replace(COUNT_RANGE, (m: string, first: string, last: string, noun: string, at: number, all: string) => {
    const a = +first, b = +last
    if (a < 1 || a >= b) return m
    const { gender, form } = COUNTED[noun]
    const genitiveBefore = GENITIVE_BEFORE.test(all.slice(Math.max(0, at - 60), at))
    // "lat" after 2, 3, 4 can only be the genitive ("w ciągu 2-3 lat"); after 5 and more it is the genitive when the words before ask for it
    const kase = form === 'loc' ? 'loc' : form === 'nom' ? 'nom' : genitiveBefore || (form === 'gen' && (FEW(a) || FEW(b))) ? 'gen' : 'nom'
    return `${countWords(a, kase, gender)} ${countWords(b, kase, gender)} ${noun}`
  })

// Months and weeks written short: "po 8 m-cach" is "po ośmiu miesiącach", "w ciągu 12 m-cy" "w ciągu dwunastu miesięcy", "za 3 m-ce" "za trzy miesiące", "1 m-c"
// "jeden miesiąc", "po 5 mies." "po pięciu miesiącach", "przez 3 tyg." "przez trzy tygodnie". The ending of the short form says the case and the number of the noun; a
// number is put in words in the case the noun asks (the locative "ośmiu", the genitive after "do", "od", "w ciągu"). Left as "8 m-cach" a voice says the letters. Where the
// number is a fraction or the ending is the instrumental or the dative, only the noun is written out. "mies." and "tyg." have no ending: the preposition before the number
// says it (w, po, przy: the locative; do, od, w ciągu…: the genitive; else the nominative).
type SpanNoun = Record<'nom' | 'gen' | 'loc' | 'inst' | 'dat', string>
const SPAN_NOUNS: Record<'miesiąc' | 'tydzień', Record<'sg' | 'pl', SpanNoun>> = {
  miesiąc: { sg: { nom: 'miesiąc', gen: 'miesiąca', loc: 'miesiącu', inst: 'miesiącem', dat: 'miesiącowi' }, pl: { nom: 'miesiące', gen: 'miesięcy', loc: 'miesiącach', inst: 'miesiącami', dat: 'miesiącom' } },
  tydzień: { sg: { nom: 'tydzień', gen: 'tygodnia', loc: 'tygodniu', inst: 'tygodniem', dat: 'tygodniowi' }, pl: { nom: 'tygodnie', gen: 'tygodni', loc: 'tygodniach', inst: 'tygodniami', dat: 'tygodniom' } },
}
const SPAN_WRITTEN: Record<string, readonly ['miesiąc', 'sg' | 'pl', keyof SpanNoun]> = {
  'm-c': ['miesiąc', 'sg', 'nom'], 'm-ca': ['miesiąc', 'sg', 'gen'], 'm-cu': ['miesiąc', 'sg', 'loc'], 'm-cem': ['miesiąc', 'sg', 'inst'],
  'm-ce': ['miesiąc', 'pl', 'nom'], 'm-cy': ['miesiąc', 'pl', 'gen'], 'm-cach': ['miesiąc', 'pl', 'loc'], 'm-cami': ['miesiąc', 'pl', 'inst'], 'm-com': ['miesiąc', 'pl', 'dat'],
}
const SPAN_RE = new RegExp(String.raw`(?:(?<![\p{L}\d.,/:-])(\d{1,3})\s+)?(?<![\p{L}\d-])(m-cach|m-cami|m-cem|m-com|m-ca|m-ce|m-cu|m-cy|m-c|mies\.|tyg\.)(?![\p{L}\d-])`, 'gu')
export const sayMonthSpans = (text: string) =>
  text.replace(SPAN_RE, (m: string, num: string | undefined, written: string, at: number, all: string) => {
    const dynamic = written === 'mies.' || written === 'tyg.'
    if (dynamic && num === undefined) return m
    const n = num === undefined ? undefined : +num
    if (n !== undefined && n < 1) return m
    const before = all.slice(Math.max(0, at - 80), at)
    const noun = dynamic ? (written === 'mies.' ? 'miesiąc' : 'tydzień') : SPAN_WRITTEN[written][0]
    const stop = written.endsWith('.') && endsSentence(all.slice(at + m.length)) ? '.' : ''
    if (!dynamic) {
      const [, number, kase] = SPAN_WRITTEN[written]
      const said = SPAN_NOUNS[noun][number][kase]
      if (n === undefined || kase === 'inst' || kase === 'dat') return `${num === undefined ? '' : `${num} `}${said}`
      const genitiveBefore = GENITIVE_BEFORE.test(before)
      const numeral: 'nom' | 'gen' | 'loc' = kase === 'loc' ? 'loc' : kase === 'nom' ? 'nom' : number === 'sg' || genitiveBefore || FEW(n) ? 'gen' : 'nom'
      return `${countWords(n, numeral, 'm')} ${said}`
    }
    const kase: 'nom' | 'gen' | 'loc' = /(?:^|\s)(?:w|we|po|przy)\s+$/iu.test(before) ? 'loc' : GENITIVE_BEFORE.test(before) ? 'gen' : 'nom'
    const number = n === 1 ? 'sg' : 'pl'
    // after 5 and more the nominative is followed by the genitive plural ("osiem miesięcy"), after 2-4 by the nominative plural ("trzy miesiące")
    const form: keyof SpanNoun = kase === 'nom' && number === 'pl' && !FEW(n!) ? 'gen' : kase
    return `${countWords(n!, kase, 'm')} ${SPAN_NOUNS[noun][number][form]}${stop}`
  })

// A range of days with the month after it: "w dniach 7 - 8 października" -> "w dniach od siódmego do ósmego października", "7-8 października" the same,
// "30 września - 2 października" -> "od trzydziestego września do drugiego października". The days are written out: left as digits with a dash a voice
// says "7 minus 8". The first day is the smaller one ("20-19 października" or a result "3-2" is no range of days).
const MONTHS_GEN = MONTH_NAMES.gen.join('|')
const DAY_RANGE = new RegExp(String.raw`(?<![\p{L}\d.,/:-])(\d{1,2})(?:\s+(${MONTHS_GEN}))?\s?[-–]\s?(\d{1,2})\s+(${MONTHS_GEN})(?![\p{L}\d])`, 'gu')
export const sayDayRanges = (text: string) =>
  text.replace(DAY_RANGE, (m: string, first: string, firstMonth: string | undefined, last: string, month: string, at: number, all: string) => {
    if (+first < 1 || +first > 31 || +last < 1 || +last > 31 || (!firstMonth && +first >= +last)) return m
    // "od 9 października - 11 października" has its "od" already
    const from = /(?:^|\s)od\s+$/iu.test(all.slice(Math.max(0, at - 6), at)) ? '' : 'od '
    return `${from}${ordinal(+first, 'gen')}${firstMonth ? ` ${firstMonth}` : ''} do ${ordinal(+last, 'gen')} ${month}`
  })

// "po VIII wyniosły" -> "po sierpniu wyniosły", "do VII" -> "do lipca", "na koniec IX" -> "na koniec września", "od I do VIII" ->
// "od stycznia do sierpnia", "w okresie I-VIII" -> "w okresie od stycznia do sierpnia". A lone "I", "V" or "X" is a month only after
// "po" ("I" is also "and", "X" a website); two of them in a range are months after any of the words above.
export function sayMonths(text: string): string {
  // a numeral in small letters (the conjunction "i" after "do") is not a month
  const month = (n: string, k: Kase) => MONTH_NAMES[k][roman(n) - 1] ?? n
  return text
    .replace(MONTH_FROM_TO, (m, from: string, s1: string, a: string, mid: string, b: string, at: number, all: string) =>
      monthStays(all.slice(at + m.length)) ? m : `${from}${s1}${month(a, 'gen')}${mid}${month(b, 'gen')}`)
    .replace(MONTH_RANGE, (m, prep: string, space: string, a: string, b: string, at: number, all: string) => {
      if (roman(a) >= roman(b) || monthStays(all.slice(at + m.length))) return m
      const lead = /^(?:w|za)$/i.test(prep) ? `${prep}${space}${/^w$/i.test(prep) ? 'okresie' : 'okres'} ` : `${prep}${space}`
      return `${lead}od ${month(a, 'gen')} do ${month(b, 'gen')}`
    })
    .replace(MONTH_ONE, (m, prep: string, space: string, num: string, at: number, all: string) => {
      const lone = /^[IVX]$/.test(num)
      if ((lone && !MONTH_SURE.has(prep.toLocaleLowerCase('pl'))) || monthStays(all.slice(at + m.length))) return m
      return `${prep}${space}${month(num, MONTH_CASE[prep.toLocaleLowerCase('pl')])}`
    })
}

// ── Dates written with digits: "12.10.2026" and "2026-10-12" are "12 października 2026" ──

// The day and the month of a date as a voice would read two numbers with dots between them ("dwanaście kropka dziesięć"): the month is a word, in the genitive, and
// the year stays for its own rule ("2026 r." is "dwa tysiące dwudziestego szóstego roku"). Only a real day and month; a dotted number of a document is no date.
const NUMERIC_DATE = /(?<![\d.,/:-])(?:(\d{1,2})\.(\d{1,2})\.((?:19|20)\d{2})|((?:19|20)\d{2})-(\d{2})-(\d{2}))(?!\d|[.,/:-]\d)/g
export const sayDates = (text: string) =>
  text.replace(NUMERIC_DATE, (m: string, day1?: string, month1?: string, year1?: string, year2?: string, month2?: string, day2?: string) => {
    const day = +(day1 ?? day2!), month = +(month1 ?? month2!)
    return day >= 1 && day <= 31 && month >= 1 && month <= 12 ? `${day} ${MONTH_NAMES.gen[month - 1]} ${year1 ?? year2}` : m
  })

// ── Years: a range, "2021-27" ──

// A year as a number, not as the ordinal of "w 2026 r.": 2027 -> "dwa tysiące dwadzieścia siedem"
const yearCardinal = (y: number) => (y >= 2000 ? ['dwa tysiące', y > 2000 ? cardinal(y - 2000) : ''] : ['tysiąc', cardinal(y - 1000)]).filter(Boolean).join(' ')
// What a range of years follows when it is a plan or a perspective: "perspektywy UE 2021-27" -> "perspektywy Unii Europejskiej na lata …"
const PLAN_WORD = /^(?:perspektyw|budżet|program|strategi|plan|fundusz|środk|dofinansowan|KPO|FENIKS)/iu
const YEAR_RANGE = /(?<![\d.,/:-])((?:19|20)\d{2})[-–]((?:19|20)\d{2}|\d{2})(?![\d.,/:-]\d|[\d/:-])/gu
// "2021-2027" and "2021-27" -> the two years in words, "dwa tysiące dwadzieścia jeden, dwa tysiące dwadzieścia siedem" (a comma between them, or
// "2020-2022" would run together as one number); after a plan, perspective or budget with "na lata" in front of them. Not with spaces ("2020 - 2022"), a date ("2026-10-09") or a number of a document.
export function sayYearRanges(text: string): string {
  return text.replace(YEAR_RANGE, (m: string, from: string, to: string, at: number, all: string) => {
    const a = +from, b = to.length === 2 ? Math.floor(a / 100) * 100 + +to : +to
    if (b <= a || b > 2100) return m
    const before = all.slice(0, at)
    const words = before.match(/(?:\p{L}+\s+){0,4}$/u)?.[0].trim().split(/\s+/) ?? []
    const lead = words.length && /^(?:lat|lata|latach|latami|okresie|okres|roku|rok)$/iu.test(words.at(-1)!) ? '' : words.some((w) => PLAN_WORD.test(w)) && !/\b(?:w|we|za|do|od|z|po)\s*$/iu.test(before) ? 'na lata ' : ''
    return `${lead}${yearCardinal(a)}, ${yearCardinal(b)}`
  })
}

// ── Roman numerals: "przed niedzielną II turą" -> "przed niedzielną drugą turą" ──

// The ordinal takes the form of the word it goes with: from that word's ending, and the preposition
// before when the ending alone does not tell ("w II turze" -> "w drugiej turze", "XX wieku" ->
// "dwudziestego wieku", "w XX w." -> "w dwudziestym wieku", "Jana Pawła II" -> "Jana Pawła drugiego").
const LOC_PREP = new Set(['w', 'we', 'o', 'przy', 'po', 'na'])
const GEN_PREP = new Set(['do', 'od', 'z', 'ze', 'dla', 'bez', 'u', 'według', 'wg', 'podczas', 'spod', 'sprzed', 'około', 'wokół', 'obok', 'oprócz', 'zamiast', 'wśród', 'spośród', 'koło', 'blisko'])
const INST_PREP = new Set(['przed', 'nad', 'pod', 'między', 'za', 'z', 'ze'])
const DAT_PREP = new Set(['dzięki', 'ku', 'wbrew', 'przeciw', 'przeciwko'])
// Masculine and neuter words that look feminine: genitives in "-a", locatives in "-e"
const MASC_GEN_A = new Set(['stopnia', 'miejsca', 'piętra', 'dnia', 'tygodnia', 'miesiąca', 'szczebla', 'świata'])
const MASC_LOC_E = new Set(['etapie', 'filarze', 'sezonie', 'programie', 'okresie', 'rozdziale', 'tomie', 'akcie', 'pakiecie', 'planie',
  'wariancie', 'sektorze', 'rzędzie', 'rządzie', 'kongresie', 'zjeździe', 'terminie', 'poziomie', 'piętrze', 'składzie', 'świecie',
  'semestrze', 'rozbiorze', 'oddziale', 'secie', 'obwodzie', 'zespole', 'konkursie', 'finale', 'półfinale', 'ćwierćfinale', 'kanale', 'dziale'])
// Words numbered this way; a numeral before one of them goes with it
const NUMBERED = /^(?:lig|lidz|tur|wojn|miejsc|etap|faz|rund|instancj|stop[ni]|kadencj|sesj|edycj|transz|emisj|seri|częś|czytani|rat[aąęy]|klas|kategori|grup|filar|sektor|sezon|kongres|zjazd|zjeźdz|wiek|połow|generacj|wersj|poziom|rozdział|tom|dywizj|pułk|piętr|rzęd|rząd|rok|dzie[ńn]|dni|tydzie|tygod|lice|kwart|mecz|set|odsłon|akt|rozbi|pokoleni|świat|rzeczpospolit|rzeczypospolit)/u
// Words a numeral may follow: "etap II", "w części III"
const AFTER = /^(?:etap|faz|częś|seri|tom|rozdział|edycj|transz|emisj|klas|kategori|grup|wersj|kadencj|sesj|rund|sekcj|sektor|poziom|wariant|generacj|pakiet|filar|zjazd|kongres|dywizj)/iu
// Kings, queens and popes: "Leon XIV", "Karola III", "Elżbiety II"
const RULER = /^(?:Leon|Karol|Pawe?ł|Pawl|Jan|Benedykt|Benedykc|Pius|Henryk|Ludwik|Filip|Wilhelm|Fryderyk|Aleksander|Aleksandr|Mikołaj|Piotr|Zygmunt|Zygmunc|Kazimierz|Władysław|Bolesław|Grzegorz|Klemens|Gustaw|Harald)(?:a|u|e|ie|ze|em|owi)?$/u
const QUEEN = /^(?:Elżbiet|Elżbiec|Katarzyn|Małgorzat|Małgorzac|Wiktori|Izabel|Krystyn|Jadwig|Jadwidz)(?:a|y|i|ie|ą|ę)$/u

// The preposition just before, or the word before that when an adjective stands between ("przed niedzielną II turą")
const prepOf = (before: string) => {
  const [, a, b] = before.match(/(?:(\p{L}+)\s+)?(\p{L}+)\s+$/u) ?? []
  const isPrep = (w?: string) => !!w && [LOC_PREP, GEN_PREP, INST_PREP, DAT_PREP].some((set) => set.has(w.toLocaleLowerCase('pl')))
  const adjective = !!b && /^\p{Ll}+(?:ą|ej|[yi]m|i?ego|[yi]ch|[yi]mi|i?emu)$/u.test(b)
  return (isPrep(b) ? b : adjective && isPrep(a) ? a : '')!.toLocaleLowerCase('pl')
}
// The ending, written after a hard stem, the ordinal takes next to this word
function endingFor(word: string, prep: string): string {
  const w = word.toLocaleLowerCase('pl')
  if (/ego$/.test(w)) return 'ego'
  if (/emu$|owi$/.test(w)) return 'emu'
  if (/[yi]ch$|ach$|ów$/.test(w)) return 'ych'
  if (/[yi]mi$|ami$/.test(w)) return 'ymi'
  if (/ej$/.test(w)) return 'ej'
  if (/[ąę]$/.test(w)) return 'ą'
  if (/om$|[yi]m$/.test(w)) return 'ym'
  // "liceum", "Forum": neuter, the same in every case
  if (/um$/.test(w)) return LOC_PREP.has(prep) ? 'ym' : GEN_PREP.has(prep) ? 'ego' : INST_PREP.has(prep) ? 'ym' : 'e'
  if (/em$/.test(w)) return INST_PREP.has(prep) ? 'ym' : 'y'
  if (/u$/.test(w)) return LOC_PREP.has(prep) ? 'ym' : DAT_PREP.has(prep) ? 'emu' : 'ego'
  if (/[yi]$/.test(w)) return 'ej'
  if (/a$/.test(w)) return GEN_PREP.has(prep) || MASC_GEN_A.has(w) || /(?:[ae]nia|[eęy]cia)$/.test(w) ? 'ego' : 'a'
  // "na II miejsce", "I czytanie": neuter; else after "w", "na"… a locative, mostly feminine ("w II turze")
  if (w === 'miejsce' || /anie$/.test(w)) return 'e'
  if (/e$/.test(w)) return LOC_PREP.has(prep) ? (MASC_LOC_E.has(w) ? 'ym' : 'ej') : DAT_PREP.has(prep) ? 'ej' : 'e'
  if (/o$/.test(w)) return 'e'
  return 'y'
}
// After a ruler's name, in its case
function endingAfterName(name: string): string {
  if (QUEEN.test(name)) return /a$/.test(name) ? 'a' : /[ąę]$/.test(name) ? 'ą' : 'ej'
  return /a$/.test(name) ? 'ego' : /em$/.test(name) ? 'ym' : /owi$/.test(name) ? 'emu' : /[eu]$/.test(name) ? 'ym' : 'y'
}

const NUM = String.raw`(?=[IVX])X{0,3}(?:IX|IV|V?I{0,3})(?![\p{L}\d])`
const BETWEEN = String.raw`\s*[,–-]\s*|\s+(?:i|oraz|lub|albo)\s+`
const ROMAN_RUN = new RegExp(String.raw`(?<![\p{L}\d.,-])(${NUM}(?:(?:${BETWEEN})${NUM})*)(?:(\s+)(w\.(?!\p{L})|RP(?!\p{L})|\p{Lu}?\p{Ll}+(?!\p{L})))?`, 'gu')

export function sayRoman(text: string): string {
  return text.replace(ROMAN_RUN, (m: string, run: string, space: string | undefined, next: string | undefined, at: number, all: string) => {
    const nums = run.split(new RegExp(BETWEEN, 'u'))
    const between = run.match(new RegExp(BETWEEN, 'gu')) ?? []
    const before = all.slice(0, at)
    const prev = before.match(/(\p{L}+)\s+$/u)?.[1]
    const prep = prepOf(before)
    const numbered = !!next && NUMBERED.test(next.toLocaleLowerCase('pl'))
    let end = '', word = next ?? ''
    if (prev && (RULER.test(prev) || QUEEN.test(prev))) end = endingAfterName(prev)
    else if (prev && AFTER.test(prev) && !numbered) end = endingFor(prev, prepOf(before.replace(/\p{L}+\s+$/u, '')))
    else if (next === 'w.') {
      end = LOC_PREP.has(prep) ? 'ym' : 'ego'
      word = sentenceGoesOn(all.slice(at + m.length)) ? 'wieku' : 'wieku.'
    } else if (next === 'RP') end = ['przed', 'nad', 'pod', 'między'].includes(prep) ? 'ą' : prep || prev ? 'ej' : 'a'
    // "I" at the start of a sentence may be "and", "X" the website: on their own only before a numbered word
    else if (next && (numbered || run.length > 1)) end = endingFor(next, prep)
    if (!end) return m
    return nums.map((n, i) => (i ? between[i - 1] : '') + ordinalAs(roman(n), end)).join('') + (space ?? '') + word
  })
}

// "w 2026 r." -> "w dwa tysiące dwudziestym szóstym roku", "9 października 2026 r." -> "… dwa tysiące
// dwudziestego szóstego roku", "na '26" -> "na dwa tysiące dwudziesty szósty rok"
export function sayYears(text: string): string {
  return text.replace(/(?<![\p{L}\d'])(?:'(\d{2})|((?:19|20)\d{2})\s?(?:r\.|roku|rok)(?!\p{L}))(?![\d\p{L}])/gu,
    (m, short?: string, long?: string, at?: number, all?: string) => {
      const dot = m.endsWith('.') && !sentenceGoesOn(all!.slice(at! + m.length)) ? '.' : ''
      return yearWords(fullYear((short ?? long)!), caseAfter(all!.slice(0, at))) + dot
    })
}

// ── Abbreviations ──

const WORDS: [RegExp, string][] = [
  [/(?<!\p{L})ws\.(?=\s)/gu, 'w sprawie'],
  [/(?<!\p{L})m\.in\.(?=\s)/gu, 'między innymi'],
  [/(?<!\p{L})tj\.(?=\s)/gu, 'to jest'],
  // the law: "t.j. Dz.U. …", "z późn. zm.", "ze zm.", "w zw. z art. …", "zob. art. …", "por. art. …"
  [/(?<![\p{L}\d])t\.\s?j\.(?=\s)/gu, 'tekst jednolity'],
  [/(?<![\p{L}\d])z\s+późn\.\s?zm\.(?![\p{L}\d])/gu, 'z późniejszymi zmianami'],
  [/(?<![\p{L}\d])ze\s+zm\.(?![\p{L}\d])/gu, 'ze zmianami'],
  [/(?<![\p{L}\d])([Ww])\s+zw\.\s+z(?![\p{L}\d])/gu, '$1 związku z'],
  [/(?<![\p{L}\d])([Zz])ob\.(?=\s)/gu, '$1obacz'],
  [/(?<![\p{L}\d])([Pp])or\.(?=\s+(?:art|§|ust|pkt|artykuł|paragraf|ustęp|punkt|\d))/gu, '$1orównaj'],
  [/(?<!\p{L})r\/r(?!\p{L})/gu, 'rok do roku'],
  [/(?<!\p{L})m\/m(?!\p{L})/gu, 'miesiąc do miesiąca'],
  [/(?<!\p{L})k\/k(?!\p{L})/gu, 'kwartał do kwartału'],
  // the same written as one word ("wzrósł o 5 proc. rdr"); lower case only, a capitalised one is a name or a title
  [/(?<![\p{L}\d])rdr(?![\p{L}\d])/gu, 'rok do roku'],
  [/(?<![\p{L}\d])mdm(?![\p{L}\d])/gu, 'miesiąc do miesiąca'],
  [/(?<![\p{L}\d])kdk(?![\p{L}\d])/gu, 'kwartał do kwartału'],
  [/(?<!\p{L})NewConnect(?!\p{L})/gu, 'New Connect'],
  // "giełdzie GPW" says it twice: "Dziś na giełdzie GPW i New Connect" -> "Dziś na giełdzie papierów wartościowych w Warszawie i New Connect"
  [/(?<!\p{L})(giełd(?:a|y|zie|ę|ą))\s+GPW(?![\p{L}\d])/giu, '$1 papierów wartościowych w Warszawie'],
  [/(?<!\p{L})ust\.(?=\s*\d)/gu, 'ustęp'],
  [/(?<!\p{L})pkt\.?(?=\s*\d)/gu, 'punkt'],
]

// Abbreviations of a meeting and of institutions are said in full, in the case the words before ask for.
// "WZ" is the general meeting of shareholders (walne zgromadzenie), "NWZ" an extraordinary one, "ZWZ" an ordinary
// one, with an "A" for akcjonariuszy: "zwołanie WZ" -> "zwołanie Walnego zgromadzenia", "zmiany w porządku obrad WZ" ->
// "… obrad Walnego zgromadzenia", "na NWZ" -> "na Nadzwyczajnym walnym zgromadzeniu", "Zarząd zwołuje WZ" -> "… Walne
// zgromadzenie". "PIE", "MFW" and "UE" are the same: "według MFW" -> "według Międzynarodowego Funduszu Walutowego",
// "Jak podaje PIE" -> "Jak podaje Polski Instytut Ekonomiczny", "mieszkańcy UE" -> "mieszkańcy Unii Europejskiej",
// "w UE" -> "w Unii Europejskiej", "z UE" -> "z Unią Europejską", "przez UE" -> "przez Unię Europejską". "UE-27",
// "UE-owski" and "post-UE" stay as they are. The ministries and offices too: "Rzeczniczka MSWiA" -> "Rzeczniczka
// Ministerstwa Spraw Wewnętrznych i Administracji", "szefa MON" -> "szefa Ministerstwa Obrony Narodowej", "MF" is the
// Ministerstwo Finansów, "UKE" is the Urząd Komunikacji Elektronicznej and "UOKiK" the Urząd Ochrony Konkurencji i
// Konsumentów, "ON" the olej napędowy among fuels ("dla ON 8,02 zł/l" -> "dla oleju napędowego …"), "RN" the rada nadzorcza ("uchwała RN" -> "uchwała Rady nadzorczej"). More ministries: MFiPR (Funduszy i Polityki
// Regionalnej), MRPiPS (Rodziny i Polityki Społecznej), MSZ, MRiRW, MKiDN, MKiŚ, MSiT, MRiT, MNiSW.
type InstCase = 'nom' | 'gen' | 'dat' | 'acc' | 'inst' | 'loc'
const MEETING: Record<InstCase, string> = { nom: 'walne zgromadzenie', gen: 'walnego zgromadzenia', dat: 'walnemu zgromadzeniu', acc: 'walne zgromadzenie', inst: 'walnym zgromadzeniem', loc: 'walnym zgromadzeniu' }
const MEETING_ENDING: Record<InstCase, string> = { nom: 'e', gen: 'ego', dat: 'emu', acc: 'e', inst: 'ym', loc: 'ym' }
const INSTITUTIONS: Record<string, Record<InstCase, string>> = {
  PIE: { nom: 'Polski Instytut Ekonomiczny', gen: 'Polskiego Instytutu Ekonomicznego', dat: 'Polskiemu Instytutowi Ekonomicznemu', acc: 'Polski Instytut Ekonomiczny', inst: 'Polskim Instytutem Ekonomicznym', loc: 'Polskim Instytucie Ekonomicznym' },
  MFW: { nom: 'Międzynarodowy Fundusz Walutowy', gen: 'Międzynarodowego Funduszu Walutowego', dat: 'Międzynarodowemu Funduszowi Walutowemu', acc: 'Międzynarodowy Fundusz Walutowy', inst: 'Międzynarodowym Funduszem Walutowym', loc: 'Międzynarodowym Funduszu Walutowym' },
  UE: { nom: 'Unia Europejska', gen: 'Unii Europejskiej', dat: 'Unii Europejskiej', acc: 'Unię Europejską', inst: 'Unią Europejską', loc: 'Unii Europejskiej' },
}
// A ministry (neuter) or an office (masculine) with the name that follows it, which does not change
const MINISTRY: Record<InstCase, string> = { nom: 'Ministerstwo', gen: 'Ministerstwa', dat: 'Ministerstwu', acc: 'Ministerstwo', inst: 'Ministerstwem', loc: 'Ministerstwie' }
const OFFICE: Record<InstCase, string> = { nom: 'Urząd', gen: 'Urzędu', dat: 'Urzędowi', acc: 'Urząd', inst: 'Urzędem', loc: 'Urzędzie' }
const named = (head: Record<InstCase, string>, name: string) =>
  Object.fromEntries(Object.entries(head).map(([kase, word]) => [kase, `${word} ${name}`])) as Record<InstCase, string>
// "ON" is the diesel (olej napędowy), but only where it stands among fuels: next to petrol, fuel prices, litres, stations
INSTITUTIONS.ON = { nom: 'olej napędowy', gen: 'oleju napędowego', dat: 'olejowi napędowemu', acc: 'olej napędowy', inst: 'olejem napędowym', loc: 'oleju napędowym' }
const FUEL_CONTEXT = /Pb\s?9[58]|benzyn\p{L}*|paliw\p{L}*|LPG|zł\/l|za litr|diesel|olej\p{L}*\s+napędow|stacj\p{L}*\s+(?:paliw|benzyn)|ceny?\s+maksymaln/iu
// "NYSE" is the New York Stock Exchange; said as "nowojorska giełda" in the case the sentence needs ("Dziś na NYSE przed sesją" -> "Dziś na
// nowojorskiej giełdzie przed sesją"): the English words are no good for a Polish voice, and the abbreviation spelled out is a string of letters
INSTITUTIONS.NYSE = { nom: 'nowojorska giełda', gen: 'nowojorskiej giełdy', dat: 'nowojorskiej giełdzie', acc: 'nowojorską giełdę', inst: 'nowojorską giełdą', loc: 'nowojorskiej giełdzie' }
INSTITUTIONS.RN = { nom: 'Rada nadzorcza', gen: 'Rady nadzorczej', dat: 'Radzie nadzorczej', acc: 'Radę nadzorczą', inst: 'Radą nadzorczą', loc: 'Radzie nadzorczej' }
INSTITUTIONS.MFiPR = named(MINISTRY, 'Funduszy i Polityki Regionalnej')
INSTITUTIONS.MRPiPS = named(MINISTRY, 'Rodziny i Polityki Społecznej')
INSTITUTIONS.MSZ = named(MINISTRY, 'Spraw Zagranicznych')
INSTITUTIONS.MRiRW = named(MINISTRY, 'Rolnictwa i Rozwoju Wsi')
INSTITUTIONS.MKiDN = named(MINISTRY, 'Kultury i Dziedzictwa Narodowego')
INSTITUTIONS.MKiŚ = named(MINISTRY, 'Klimatu i Środowiska')
INSTITUTIONS.MSiT = named(MINISTRY, 'Sportu i Turystyki')
INSTITUTIONS.MRiT = named(MINISTRY, 'Rozwoju i Technologii')
INSTITUTIONS.MNiSW = named(MINISTRY, 'Nauki i Szkolnictwa Wyższego')
INSTITUTIONS.MSWiA = named(MINISTRY, 'Spraw Wewnętrznych i Administracji')
INSTITUTIONS.MON = named(MINISTRY, 'Obrony Narodowej')
INSTITUTIONS.MF = named(MINISTRY, 'Finansów')
INSTITUTIONS.UKE = named(OFFICE, 'Komunikacji Elektronicznej')
INSTITUTIONS.UOKiK = INSTITUTIONS.UOKIK = named(OFFICE, 'Ochrony Konkurencji i Konsumentów')
// The European institutions and organisations of institutions-eu.ts: each abbreviation to the forms of its name, the gender of the name and the guard for the letters
// that mean something else too
const INSTITUTION_GENDER: Record<string, EuGender> = {}
const INSTITUTION_GUARD: Record<string, string> = {}
// Written with a space in it ("TS UE", "NY Fed"): the space may be missing too
const INSTITUTION_SPACED: string[] = []
for (const [abbreviations, forms, gender, guard] of [...EU_INSTITUTIONS, ...CENTRAL_BANKS]) {
  for (const abbreviation of abbreviations) {
    if (/\s/.test(abbreviation)) INSTITUTION_SPACED.push(abbreviation.split(/\s+/).join('\\s?'))
    const key = abbreviation.replace(/\s+/g, '')
    INSTITUTIONS[key] = { nom: forms[0], gen: forms[1], dat: forms[2], acc: forms[3], inst: forms[4], loc: forms[5] }
    INSTITUTION_GENDER[key] = gender
    if (guard) INSTITUTION_GUARD[key] = guard
  }
}
const INSTITUTION_KEYS = [...Object.keys(INSTITUTIONS), ...INSTITUTION_SPACED].sort((a, b) => b.length - a.length)
const INSTITUTION_RE = new RegExp(String.raw`(?<![\p{L}\d]|\p{Ll}-)(?:([NZ]?)WZ(A?)|(${INSTITUTION_KEYS.join('|')}))(?![\p{L}\d]|-\d|-\p{Ll})`, 'gu')
const PREP_CASE: Record<string, InstCase> = {
  na: 'loc', w: 'loc', we: 'loc', o: 'loc', po: 'loc', przy: 'loc',
  przed: 'inst', nad: 'inst', pod: 'inst', między: 'inst', poza: 'inst',
  przez: 'acc',
  dla: 'gen', do: 'gen', od: 'gen', bez: 'gen', u: 'gen', podczas: 'gen', wokół: 'gen', obok: 'gen', według: 'gen', wg: 'gen',
  spod: 'gen', sprzed: 'gen', około: 'gen', oprócz: 'gen', zamiast: 'gen', wśród: 'gen', spośród: 'gen', koło: 'gen',
  dzięki: 'dat', ku: 'dat', wbrew: 'dat', przeciw: 'dat', przeciwko: 'dat',
}
// Verbs and adjectives that stand right before the abbreviation itself (it is the subject or the object): "odbędzie się
// WZ", "jak podaje MFW"
const NOM_BEFORE = /^(?:zwołuje|zwołują|zwołał[aoy]?|zwołać|zwołano|zwoła|zwołane|odwołuje|odwołują|odwołał[aoy]?|odwołać|odwołano|odwołane|odbędzie|odbyło|odbyły|odbywa|ogłasza|ogłosił[aoy]?|ogłoszono|się|jest|zostało|zostanie|będzie|było|planuje|zapowiada|przesuwa|przekłada|przenosi|zakończyło|rozpoczęło|zgłasza|kolejne|następne|najbliższe|coroczne|doroczne|przyszłe|ostatnie|pierwsze|drugie|trzecie|to|owe|takie|wspomniane|zaplanowane|planowane|przerwane|odroczone|a|ale|że|gdy|jeśli|ponieważ|bo|aby|żeby|gdyż|natomiast|jednak|lecz|więc|zatem|tymczasem|podaje|podają|szacuje|szacują|prognozuje|wskazuje|informuje|ostrzega|ocenia|twierdzi|mówi|uważa|zakłada|sądzi|wylicza|oblicza|przewiduje|podkreśla|wyjaśnia|alarmuje|apeluje|radzi|zaleca|proponuje|sugeruje|pokazuje|wynika|stwierdza|podał|szacował|oszacował|prognozował|ostrzegał|informował|poinformował|twierdził|wskazał|powiedział|zapowiedział|podniósł|przewidział|przewidywał|rekomendował|przekazał|zrewidował)$/u
// …and the endings of such verbs (not "ał": "udział", "kapitał" are nouns)
const VERB_ENDING = /(?:uje|ują|ił|ył|iła|yła|iło|yło|ili|yli|ała|ało|ały)$/u
// What is "from" an institution, not "with" it
const FROM_NOUN = /^(?:fundusz\p{L}*|środk\p{L}*|dotacj\p{L}*|dofinansowan\p{L}*|pieniąd\p{L}*|pieniędz\p{L}*|dane|danych|komunikat\p{L}*|informacj\p{L}*|pism\p{L}*|decyzj\p{L}*|wytyczn\p{L}*|rozporządzen\p{L}*|import\p{L}*|eksport\p{L}*|dostaw\p{L}*|kraj\p{L}*|państw\p{L}*|wsparci\p{L}*|pożyczk\p{L}*|grant\p{L}*|płatnośc\p{L}*|wpływ\p{L}*|wypłat\p{L}*|transfer\p{L}*|pochodz\p{L}*|wynik\p{L}*|wyjści\p{L}*|wyjść|wyjdzie|wyjdą|wychodzi|wystąpien\p{L}*|wystąpić|wycofa\p{L}*|kredyt\p{L}*|finansowan\p{L}*|gwarancj\p{L}*|lini[aeięą]|linii|transz\p{L}*|raport\p{L}*|opini\p{L}*|zaleceni\p{L}*|zalecenia|ostrzeżeni\p{L}*|zatwierdzeni\p{L}*|dopuszczeni\p{L}*|zezwoleni\p{L}*)$/u
// "z" is "from" before a meeting ("protokół z WZ") and "with" before an institution ("rozmowy z MFW")
function caseBefore(before: string, withCase: InstCase): InstCase {
  const tail = before.trimEnd()
  // "ws." is said "w sprawie", which asks for the genitive; it does not end a sentence
  if (/(?:^|\s)(?:ws|wg)\.$/iu.test(tail)) return 'gen'
  if (!tail || /[.!?:;]$/.test(tail)) return 'nom'
  // "Spółka LPP, WZ …": what follows the name of the company in the stock calendar (macronext.ts) is a sentence of its own
  if (/(?:^|[.!?:;]\s+)Spółka\s[^,.!?:;]{1,60},$/u.test(tail)) return 'nom'
  // "… 29,9 mld zł - MF": after a dash with spaces the source stands on its own, as after a colon
  if (/\s[-–—]$/u.test(tail)) return 'nom'
  // "między Fedem a BoE": the instrumental after both
  if (/(?:^|\s)między\s+(?:\p{L}+\s+){1,3}(?:a|i|oraz)$/iu.test(tail)) return 'inst'
  // "USA i UE": the same case as "USA", which the words before it show
  const joined = tail.match(/^([\s\S]*?)\S+\s+(?:i|oraz|lub|albo|czy)$/iu)
  if (joined) return caseBefore(joined[1], withCase)
  const last = tail.match(/(?:(\p{L}+)\s+)?(\p{L}+)$/u)
  const word = last?.[2]?.toLocaleLowerCase('pl') ?? ''
  const prev = last?.[1]?.toLocaleLowerCase('pl')
  // "fundusze z UE", "wyjście z UE": from, the genitive; "rozmowy z UE", "umowa z MON": with
  if (word === 'z' || word === 'ze') return prev && FROM_NOUN.test(prev) ? 'gen' : withCase
  if (/^(?:(?:materiał|kapitał|udział|sygnał|finał|ideał|kanał|dział)y|(?:uchwał|pochwał|skał)[aęyą])$/u.test(word)) return 'gen'
  if (word in PREP_CASE) return PREP_CASE[word]
  if (NOM_BEFORE.test(word) || VERB_ENDING.test(word)) return 'nom'
  if (/ego$/.test(word)) return 'gen'
  if (/emu$/.test(word)) return 'dat'
  if (/(?:ym|im)$/.test(word)) return prev && (PREP_CASE[prev] === 'inst' || prev === 'z' || prev === 'ze') ? 'inst' : 'loc'
  return 'gen'
}
// Verbs and nouns of going onto an exchange: "na" after them asks for the accusative
const ONTO_EXCHANGE = /(?:^|\s)(?:wchodz\p{L}*|wejd\p{L}*|wejś\p{L}*|weszł\p{L}*|wszedł|wprowadz\p{L}*|wprowadź\p{L}*|trafi\p{L}*|wróc\p{L}*|wrac\p{L}*|powrót|powrotu|przen\p{L}*(?:\s+się)?)\s+na\s*$/iu
// Several in a row ("zwołanie WZ i NWZ") are in the same case
const LIST_BETWEEN = /^\s*(?:,|\s(?:i|oraz|lub|albo))\s*$/u
// Where the letters of an abbreviation mean something else in business news too, the words round it say which: the name is said only where they fit
// (institutions-eu.ts names the guard of an entry)
const EU_CUE = /europarlament|europose[łl]|eurodeputowan|Strasbur|Bruksel|Parlament\p{L}*\s+Europejsk|Komisj\p{L}*\s+Europejsk|unijn|Rad\p{L}*\s+(?:UE|Unii)|rezolucj|eurosceptyk/iu
const EU_CAPS = /(?<![\p{L}\d])(?:KE|UE)(?![\p{L}\d])/u
// what stands next to the parliament's own abbreviation: "uchwała PE", "PE przyjął", "głosowanie w PE", "posłowie do PE"
const PE_CUE = /(?:uchwał|rezolucj|głosowani|posiedzeni|komisj|przewodnicząc|posł|poseł|delegacj|sprawozdawc)\p{L}*\s+(?:(?:do|w|na)\s+)?PE(?![\p{L}\d])|(?<![\p{L}\d])PE\s+(?:przyjął|zagłosował|poparł|odrzucił|zatwierdził|uchwalił|wezwał|domaga|poparł)/iu
const EU_GUARDS: Record<string, (around: string, before: string) => boolean> = {
  // Parlament Europejski, not polyethylene or private equity
  PE: (around) => (EU_CUE.test(around) || EU_CAPS.test(around) || PE_CUE.test(around)) && !/polietylen|PE-?(?:HD|LD|X|RT|100)|\bPE\s*\/\s*VC|private\s+equity|P\/E|\bVC\b|tworzyw|granulat|Peru|fundusz\p{L}*\s+PE|rynek\s+PE|sektor\s+PE/iu.test(around),
  // the central bank, not a unit of the colour of beer ("200 EBC") and not the monetary context of nothing
  EBC: (around, before) => !/\d\s*$/.test(before),
  // Europejski Bank Inwestycyjny; EBI is also the Elektroniczna Baza Informacji of the exchange ("raport EBI", ESPI/EBI, NewConnect): said only round a loan, a bank, the EU
  EBI: (around) => !/ESPI|NewConnect|Elektroniczn\p{L}*\s+Baz|raport\p{L}*\s+(?:bieżąc\p{L}*\s+)?EBI|EBI\s+nr/iu.test(around)
    && (/bank|kredyt|pożyczk|finansowan|gwarancj|inwestycj|EIB|Luksemburg|unijn|Komisj\p{L}*\s+Europejsk/iu.test(around) || EU_CAPS.test(around)),
  // Europejska Agencja Leków, not the moving average of a chart ("EMA 200")
  EMA: (around) => /leków|\blek\b|szczepionk|rejestracj|CHMP|farmac|biotech|terapi|Pfizer|Moderna|Novo\s+Nordisk|Roche/iu.test(around)
    && !/\bEMA\s*\d|\bEMA\d|średni|kroczą|wskaźnik|RSI|MACD|\bSMA\b|analiz\p{L}*\s+techniczn/iu.test(around),
  // Europejska Agencja Kosmiczna, not the European System of Accounts ("ESA 2010")
  ESA: (around) => /kosmi|rakiet|satelit|astronaut|Ariane|sond[aęy]|Księż/iu.test(around),
  // Grupa Wyszehradzka, not the engine
  V4: (around) => /państw|krajów|Grup\p{L}*\s+Wyszehradz|Wyszehrad|Węgr|Słowacj|Czech|szczyt|premier|Orb[aá]n|Tusk|Polsk/iu.test(around) && !/silnik|cylindr|Lamborghini|Ferrari|\bKM\b/iu.test(around),
}
// The guards of the central banks (central-banks.ts): the words that must be round the abbreviation, and those that must not
for (const [id, { need, no, number, before }] of Object.entries(CENTRAL_BANK_GUARDS)) {
  const wanted = need ? new RegExp(need, 'iu') : undefined, unwanted = no ? new RegExp(no, 'iu') : undefined, notAfter = before ? new RegExp(before, 'iu') : undefined
  EU_GUARDS[id] = (around, text) => (!wanted || wanted.test(around)) && !(unwanted?.test(around)) && !(number && /(?:\d|mln|mld|tys\.)\s*$/.test(text)) && !(notAfter?.test(text))
}
// "Rezerwa Federalna (Fed)": the Fed itself is said as it is (it declines as a word), its name in front is not said twice
const FED_IN_BRACKETS = /(?<=Rezerw\p{L}*\s+Federaln\p{L}*)\s*\(\s*(?:Fed|FED)\s*\)/gu
// "Komisja Europejska (KE)": the abbreviation in brackets after the name is not said again
const NAME_IN_BRACKETS = new RegExp(String.raw`\s*\(\s*(${INSTITUTION_KEYS.join('|')})\s*\)`, 'gu')
const nameStands = (before: string, key: string) => {
  const forms = INSTITUTIONS[key.replace(/\s+/g, '')]
  const tail = before.trimEnd().toLocaleLowerCase('pl')
  return !!forms && Object.values(forms).some((form) => tail.endsWith(form.toLocaleLowerCase('pl')))
}
// The gender of a past tense verb ("opublikowała"), for the name that is its subject: a name that does not agree with it is left as the abbreviation (the writer had another noun in mind)
const verbGender = (word: string): EuGender | undefined =>
  /^(?:kapitał|materiał|sygnał|finał|ideał|kanał|dział|udział|zakład|skład|wkład|wydział|oddział|zapał|artykuł|protokół)$/u.test(word) ? undefined
    : /ła$/u.test(word) ? 'f' : /ło$/u.test(word) ? 'n' : /(?:ły|li)$/u.test(word) ? 'pl' : /ł$/u.test(word) ? 'm' : undefined
// A report to the institution: "Polska poinformowała KE", "zawiadomiła KE" are the accusative ("Komisję Europejską"), not the subject
const OBJECT_VERB = /^(?:(?:poinformowa|powiadomi|zawiadomi|wezwa|pozwa|zaskarży|oskarży|przekona|zapyta|poprosi|uprzedzi|ostrzeg)(?:ł|ła|ło|li|ły)|informuj(?:e|ą)|(?:powiadamia|zawiadamia|wzywa|pozywa|ostrzega|oskarża|zaskarża)(?:ją)?)$/iu
const CLAUSE_START = /^(?:jak|co|gdy|gdyż|że|bo|ponieważ|który|która|które|aby|żeby|czy|ale|i|a|oraz|lub|albo|natomiast|także|też)$/iu
// A verb in the past tense after the abbreviation, past a list of names ("EBC i BoJ obniżyły", "BoK zaskoczył")
// What stands in the place of an abbreviation that is left out, until the space before it goes too
const DROPPED = String.fromCharCode(0)
const SUBJECT_AHEAD = /^(?:(?:\s*,\s*|\s+(?:i|oraz|lub|albo)\s+)\p{Lu}[\p{L}\d-]*){0,3}\s+(?:nie\s+)?\p{L}{3,}(?:ł|ła|ło|li|ły)(?![\p{L}])/u
// "Według analityków RBA obniży": the people who say it, then the subject
const SAYING_PEOPLE = /(?:^|\s)(?:zdaniem|według|wg)\s+(?:(?:\p{L}+)\s+){0,2}(?:analityk|ekonomist|ekspert|inwestor|strateg|specjalist|bankier|uczestnik|rynk|handlowc|dealer|zarządzając)\p{L}*\s+$/iu
export function sayInstitutions(text: string): string {
  let last: { end: number; kase: InstCase } | null = null
  return text.replace(FED_IN_BRACKETS, '').replace(NAME_IN_BRACKETS, (m: string, written: string, at: number, all: string) => (nameStands(all.slice(Math.max(0, at - 160), at), written) ? '' : m))
    .replace(INSTITUTION_RE, (m, kind: string | undefined, shareholders: string | undefined, matched: string | undefined, at: number, all: string) => {
    const institution = matched?.replace(/\s+/g, '')
    if (institution === 'ON' && !FUEL_CONTEXT.test(all.slice(Math.max(0, at - 120), at + 120))) return m
    // "Kimball Electronics (KE)": in brackets after a name with a capital letter that is not its own it is the abbreviation or the ticker of that company (its own name in front is dropped above)
    if (institution && INSTITUTION_GENDER[institution] && /\(\s*$/.test(all.slice(Math.max(0, at - 6), at)) && /^\s*\)/.test(all.slice(at + m.length, at + m.length + 6))
      && /\p{Lu}[\p{L}.&-]*\s*\(\s*$/u.test(all.slice(Math.max(0, at - 60), at))) return m
    const guard = institution && INSTITUTION_GUARD[institution]
    if (guard && !EU_GUARDS[guard](all.slice(Math.max(0, at - 140), at + m.length + 140), all.slice(Math.max(0, at - 30), at))) return m
    // "Pb95 podrożała o 45 groszy, ON o 1,50 zł": the diesel with a verb or "o 1,50" after it is the subject, whatever stands before it
    const subject = institution === 'ON' && !/(?:^|\s)(?:i|oraz|lub|albo)\s+$/iu.test(all.slice(0, at)) && /^\s+(?:o\s+\d|\p{L}+(?:ł|ła|ło|li|ły)(?![\p{L}])|wynosi|wynoszą|kosztuje|kosztują|jest|są)/u.test(all.slice(at + m.length))
    // "NYSE American", "NYSE Arca" are other markets of it, not the exchange itself
    if (institution === 'NYSE' && /^\s+(?:American|Arca|Texas|Chicago|National)(?![\p{L}\d])/u.test(all.slice(at + m.length))) return m
    const before = all.slice(0, at)
    // "Bank Rosji CBR": the name stands right before it, the abbreviation is not said after it
    if (institution && INSTITUTION_GENDER[institution] && nameStands(before.slice(-160), institution)) return DROPPED
    let kase: InstCase = subject ? 'nom' : last && LIST_BETWEEN.test(all.slice(last.end, at)) ? last.kase : caseBefore(before, institution && institution !== 'NYSE' ? 'inst' : 'gen')
    // The abbreviation begins a clause and is its subject: after a comma with a verb in the past tense after it ("Won słabnie, BoK zaskoczył rynek"), after "czy", "kiedy", "jak",
    // after what the analysts say ("Według analityków RBA obniży stopy"); "według danych BoJ" and "zdaniem BoJ" are the genitive
    if (institution && kase !== 'nom' && institution !== 'ON' && institution !== 'NYSE' && !subject) {
      const verbAhead = SUBJECT_AHEAD.test(all.slice(at + m.length, at + m.length + 120))
      if ((verbAhead && /,\s*$/.test(before)) || /(?:^|\s)(?:czy|kiedy|jak|gdy)\s+$/iu.test(before) || SAYING_PEOPLE.test(before)) kase = 'nom'
    }
    // "wchodzi na NYSE" is onto the exchange (the accusative), "notowana na NYSE" is on it (the locative)
    if (institution === 'NYSE' && kase === 'loc' && ONTO_EXCHANGE.test(all.slice(0, at))) kase = 'acc'
    // "naciska na KE", "liczy na UE", "wpływ na MFW": "na" before an institution asks for the accusative, not the locative of a place ("na giełdzie", "na WZ")
    if (institution && kase === 'loc' && !['NYSE', 'ON', 'RN'].includes(institution) && /(?:^|\s)na\s*$/iu.test(before)) kase = 'acc'
    // "Polska poinformowała KE": a verb of reporting before it, with a subject before the verb, makes it the object
    if (institution && kase === 'nom') {
      const reported = before.match(/(?:^|[\s(„"])(\p{L}[\p{L}-]*)\s+(\p{L}+)\s*$/u)
      if (reported && OBJECT_VERB.test(reported[2]) && !CLAUSE_START.test(reported[1])) kase = 'acc'
    }
    // the name is the subject and the verb after it has another gender: "EBA opublikowała" stays the abbreviation (a plural verb is for a list: "EBC i BoJ obniżyły")
    if (institution && kase === 'nom' && INSTITUTION_GENDER[institution]) {
      const next = all.slice(at + m.length).match(/^\s+(\p{L}+)/u)?.[1]
      const gender = next && verbGender(next)
      if (gender && gender !== 'pl' && gender !== INSTITUTION_GENDER[institution]) return m
    }
    // "węgierski MNB", "czeski ČNB": the adjective before it is the first word of the name, which is not said twice; it shows the case itself
    let swallowed = false
    if (institution && INSTITUTION_GENDER[institution]) {
      const adjective = before.match(/(\p{L}+)\s+$/u)?.[1]?.toLocaleLowerCase('pl')
      const forms = INSTITUTIONS[institution]
      const cases = adjective ? (Object.keys(forms) as InstCase[]).filter((k) => forms[k].includes(' ') && forms[k].split(' ')[0].toLocaleLowerCase('pl') === adjective) : []
      if (cases.length) { swallowed = true; if (!cases.includes(kase)) kase = cases[0] }
    }
    last = { end: at + m.length, kase }
    // "z NYSE" is "from" the exchange (the data, the news), the case of "with" is rare; at the start of a sentence the name has a capital letter
    if (institution === 'NYSE') {
      const said = INSTITUTIONS.NYSE[kase]
      return /(?:^|[.!?:]\s+)$/.test(all.slice(0, at)) ? said[0].toLocaleUpperCase('pl') + said.slice(1) : said
    }
    if (institution) {
      const said = INSTITUTIONS[institution][kase]
      return swallowed ? said.slice(said.indexOf(' ') + 1) : said
    }
    const stem = kind === 'N' ? 'nadzwyczajn' : kind === 'Z' ? 'zwyczajn' : ''
    const said = `${stem ? `${stem}${MEETING_ENDING[kase]} ` : ''}${MEETING[kase]}${shareholders ? ' akcjonariuszy' : ''}`
    return said[0].toLocaleUpperCase('pl') + said.slice(1)
  }).replace(/\s*\u0000/g, '')
}

// ── References to provisions of law, the journals they are cited from, and the codes (codes-pl.ts) ──
// "zgodnie z art. 506 § 1 kc" -> "zgodnie z artykułem pięćset sześć paragraf pierwszy kodeksu cywilnego". Only the first element of a reference (the article, or
// the paragraph or point a reference begins with) is declined, in the case the words before it ask for; the rest stands in the nominative, as lawyers say it
// ("na podstawie artykułu piątego ustęp drugi punkt trzeci"). A number up to 99 is an ordinal, from 100 it is a cardinal that is not declined ("artykułem pięćset
// sześć"); a number with a letter ("56a") is a cardinal and the name of the letter ("pięćdziesiąt sześć a"). docs/zapisy-prawne.md has the reasons and the sources.
type Six = readonly [string, string, string, string, string, string]
const CASE_INDEX: Record<InstCase, number> = { nom: 0, gen: 1, dat: 2, acc: 3, inst: 4, loc: 5 }
type UnitKey = 'art' | 'par' | 'ust' | 'pkt' | 'lit' | 'zd' | 'tir' | 'rozdz' | 'dz' | 'oddz' | 'tyt' | 'cz' | 'ks' | 'zal' | 'poz'
interface ProvisionUnit { one: Six; many: Six; gender: 'm' | 'f' | 'n'; values: 'number' | 'letter' | 'roman'; rank: number }
// rank: what may follow what in a reference (the book, the part, the title, the division, the chapter, the section, then the article, the paragraph, the paragraph of an article, the point, the letter, the sentence, the dash); 0 stands on its own
const PROVISION_UNITS: Record<UnitKey, ProvisionUnit> = {
  art: { gender: 'm', values: 'number', rank: 1, one: ['artykuł', 'artykułu', 'artykułowi', 'artykuł', 'artykułem', 'artykule'], many: ['artykuły', 'artykułów', 'artykułom', 'artykuły', 'artykułami', 'artykułach'] },
  par: { gender: 'm', values: 'number', rank: 2, one: ['paragraf', 'paragrafu', 'paragrafowi', 'paragraf', 'paragrafem', 'paragrafie'], many: ['paragrafy', 'paragrafów', 'paragrafom', 'paragrafy', 'paragrafami', 'paragrafach'] },
  ust: { gender: 'm', values: 'number', rank: 3, one: ['ustęp', 'ustępu', 'ustępowi', 'ustęp', 'ustępem', 'ustępie'], many: ['ustępy', 'ustępów', 'ustępom', 'ustępy', 'ustępami', 'ustępach'] },
  pkt: { gender: 'm', values: 'number', rank: 4, one: ['punkt', 'punktu', 'punktowi', 'punkt', 'punktem', 'punkcie'], many: ['punkty', 'punktów', 'punktom', 'punkty', 'punktami', 'punktach'] },
  lit: { gender: 'f', values: 'letter', rank: 5, one: ['litera', 'litery', 'literze', 'literę', 'literą', 'literze'], many: ['litery', 'liter', 'literom', 'litery', 'literami', 'literach'] },
  zd: { gender: 'n', values: 'number', rank: 6, one: ['zdanie', 'zdania', 'zdaniu', 'zdanie', 'zdaniem', 'zdaniu'], many: ['zdania', 'zdań', 'zdaniom', 'zdania', 'zdaniami', 'zdaniach'] },
  tir: { gender: 'n', values: 'number', rank: 7, one: ['tiret', 'tiret', 'tiret', 'tiret', 'tiret', 'tiret'], many: ['tiret', 'tiret', 'tiret', 'tiret', 'tiret', 'tiret'] },
  rozdz: { gender: 'm', values: 'roman', rank: 0.5, one: ['rozdział', 'rozdziału', 'rozdziałowi', 'rozdział', 'rozdziałem', 'rozdziale'], many: ['rozdziały', 'rozdziałów', 'rozdziałom', 'rozdziały', 'rozdziałami', 'rozdziałach'] },
  dz: { gender: 'm', values: 'roman', rank: 0.4, one: ['dział', 'działu', 'działowi', 'dział', 'działem', 'dziale'], many: ['działy', 'działów', 'działom', 'działy', 'działami', 'działach'] },
  oddz: { gender: 'm', values: 'roman', rank: 0.6, one: ['oddział', 'oddziału', 'oddziałowi', 'oddział', 'oddziałem', 'oddziale'], many: ['oddziały', 'oddziałów', 'oddziałom', 'oddziały', 'oddziałami', 'oddziałach'] },
  tyt: { gender: 'm', values: 'roman', rank: 0.3, one: ['tytuł', 'tytułu', 'tytułowi', 'tytuł', 'tytułem', 'tytule'], many: ['tytuły', 'tytułów', 'tytułom', 'tytuły', 'tytułami', 'tytułach'] },
  cz: { gender: 'f', values: 'roman', rank: 0.2, one: ['część', 'części', 'części', 'część', 'częścią', 'części'], many: ['części', 'części', 'częściom', 'części', 'częściami', 'częściach'] },
  ks: { gender: 'f', values: 'roman', rank: 0.1, one: ['księga', 'księgi', 'księdze', 'księgę', 'księgą', 'księdze'], many: ['księgi', 'ksiąg', 'księgom', 'księgi', 'księgami', 'księgach'] },
  zal: { gender: 'm', values: 'number', rank: 0, one: ['załącznik', 'załącznika', 'załącznikowi', 'załącznik', 'załącznikiem', 'załączniku'], many: ['załączniki', 'załączników', 'załącznikom', 'załączniki', 'załącznikami', 'załącznikach'] },
  poz: { gender: 'f', values: 'number', rank: 0, one: ['pozycja', 'pozycji', 'pozycji', 'pozycję', 'pozycją', 'pozycji'], many: ['pozycje', 'pozycji', 'pozycjom', 'pozycje', 'pozycjami', 'pozycjach'] },
}
// The endings of an ordinal that goes with the noun of a gender in a case ("pierwszy", "pierwszej", "pierwsze")
const ORDINAL_ENDS: Record<'m' | 'f' | 'n', Record<InstCase, string>> = {
  m: { nom: 'y', gen: 'ego', dat: 'emu', acc: 'y', inst: 'ym', loc: 'ym' },
  f: { nom: 'a', gen: 'ej', dat: 'ej', acc: 'ą', inst: 'ą', loc: 'ej' },
  n: { nom: 'e', gen: 'ego', dat: 'emu', acc: 'e', inst: 'ym', loc: 'ym' },
}
const ABBREVIATION_UNIT: Record<string, UnitKey> = {
  art: 'art', '§': 'par', '§§': 'par', ust: 'ust', pkt: 'pkt', zd: 'zd', tir: 'tir', tiret: 'tir', zał: 'zal', poz: 'poz', lit: 'lit', rozdz: 'rozdz', dz: 'dz', oddz: 'oddz', tyt: 'tyt',
}
// The nouns written out, in the case they are in
const FULL_UNIT = new Map<string, { key: UnitKey; kase: InstCase; plural: boolean }>()
for (const key of ['art', 'par', 'ust', 'pkt', 'zal', 'rozdz', 'dz', 'oddz', 'tyt', 'cz', 'ks'] as const) {
  for (const [forms, plural] of [[PROVISION_UNITS[key].one, false], [PROVISION_UNITS[key].many, true]] as const) {
    forms.forEach((form, i) => { if (!FULL_UNIT.has(form)) FULL_UNIT.set(form, { key, kase: (Object.keys(CASE_INDEX) as InstCase[])[i], plural }) })
  }
}
FULL_UNIT.set('tiret', { key: 'tir', kase: 'nom', plural: false })
const fullWords = (values: 'number' | 'roman') =>
  [...FULL_UNIT.entries()].filter(([, { key }]) => (PROVISION_UNITS[key].values === 'roman') === (values === 'roman')).map(([form]) => capitalised(form)).join('|')
const capitalised = (word: string) => `[${word[0].toLocaleUpperCase('pl')}${word[0]}]${word.slice(1)}`
const NUMBER_ITEM = String.raw`\d{1,4}(?:[a-z]{1,3}\d{0,2}|[¹²³⁴⁵⁶⁷⁸⁹⁰]+|\(\d{1,2}\))?(?:\.\d{1,3}){0,3}(?![\p{L}\d]|,\d|\.\d)`
const LETTER_ITEM = String.raw`[a-zA-Z]\)?(?![\p{L}\d])`
const ROMAN_ITEM = String.raw`(?:[IVXLC]{1,6}|\d{1,3})(?![\p{L}\d]|,\d)`
const itemList = (item: string) => String.raw`${item}(?:(?:\s*[-–—]\s*|,\s*|\s+(?:i|oraz|lub|albo)\s+)${item})*`
const WRITING_CLASS = (writing: string): 'dot' | 'word' | 'plain' | 'caps' =>
  /^\p{L}\.\s?\p{L}/u.test(writing) ? 'dot' : /[.\s]/.test(writing) ? 'word' : writing.slice(1) === writing.slice(1).toLocaleLowerCase('pl') ? 'plain' : 'caps'
const writingKey = (writing: string) => writing.toLocaleLowerCase('pl').replace(/[.\s]/g, '')
// A writing in capitals and the same in small letters are two (Kc and KC differ in the mode), a dotted one is the same with or without its spaces and dots
const classKey = (writing: string) => { const cls = WRITING_CLASS(writing); return `${cls}:${cls === 'dot' || cls === 'word' ? writingKey(writing) : writing}` }
// The ways a code is written, as regular expressions: the letters of "k.s.h." with the dots and spaces that may be left out, in either case
const writingSource = (writing: string) => {
  const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  if (WRITING_CLASS(writing) === 'dot') return writing.split('.').filter(Boolean).map((part) => `[${part[0].toLocaleUpperCase('pl')}${part[0]}]${escape(part.slice(1))}`).join(String.raw`\.\s?`) + String.raw`\.?`
  if (WRITING_CLASS(writing) === 'word') return writing.split(/\.\s?/).map(escape).join(String.raw`\.\s?`).replace(/\\s\?$/, '')
  return escape(writing)
}
interface CodeWriting { entry: CodeEntry; mode: CodeMode; class: 'dot' | 'word' | 'plain' | 'caps' }
const CODE_BY_KEY = new Map<string, CodeWriting>()
const CODE_BY_CLASS = new Map<string, CodeWriting>()
const CODE_SOURCES: string[] = []
for (const entry of CODES) {
  for (const [writing, mode] of entry[3]) {
    const cls = WRITING_CLASS(writing)
    if (!CODE_BY_KEY.has(writingKey(writing))) CODE_BY_KEY.set(writingKey(writing), { entry, mode, class: cls })
    CODE_BY_CLASS.set(classKey(writing), { entry, mode, class: cls })
    CODE_SOURCES.push(writingSource(writing))
  }
}
const CODE_ALTERNATIVES = [...new Set(CODE_SOURCES)].sort((a, b) => b.length - a.length).join('|')
const REFERENCE_RE = new RegExp(
  String.raw`(?<![\p{L}\d§.])(?<element>` +
  String.raw`(?:(?<nAbbr>[Aa]rt\.|ART\.|§§?|[Uu]st\.|UST\.|[Pp]kt\.?|PKT\.?|[Zz]d\.|[Tt]ir\.|[Zz]ał\.|[Pp]oz\.)\s*|(?<nWord>${fullWords('number')})\s+)(?:(?<nNr>[Nn]r)\.?\s*)?(?<nList>${itemList(NUMBER_ITEM)})` +
  String.raw`|(?<lAbbr>[Ll]it\.|LIT\.)\s*(?<lList>${itemList(LETTER_ITEM)})` +
  String.raw`|(?:(?<rAbbr>[Rr]ozdz\.|dz\.|[Oo]ddz\.|[Tt]yt\.|[Pp]kt\.?)\s*|(?<rWord>${fullWords('roman')})\s+)(?<rList>${itemList(ROMAN_ITEM)})` +
  String.raw`)(?:[\s,]*(?<code>MAR|${CODE_ALTERNATIVES})(?![\p{L}\d]|-\p{L}))?`, 'gu')

interface Label { n: number; letters: string; index: string; parts: number[]; letter?: boolean }
const SUPERSCRIPT: Record<string, string> = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9' }
function parseLabel(raw: string, unit: ProvisionUnit, article: boolean): Label | null {
  const value = unit.values === 'letter' ? raw.replace(/\)$/, '') : raw
  if (unit.values === 'letter') return /^[a-zA-Z]$/.test(value) ? { n: 0, letters: value, index: '', parts: [], letter: true } : null
  if (/^[IVXLC]+$/.test(value)) { const n = roman(value); return n > 0 ? { n, letters: '', index: '', parts: [] } : null }
  const m = value.match(/^(\d{1,4})([a-z]{1,3})?(\d{1,2}|[¹²³⁴⁵⁶⁷⁸⁹⁰]+|\(\d{1,2}\))?((?:\.\d{1,3}){0,3})$/)
  if (!m) return null
  let n = +m[1], index = (m[3] ?? '').replace(/[()]/g, '').replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]/g, (c) => SUPERSCRIPT[c])
  if (!n) return null
  // an index that lost its raised position ("art. 4021" for 402¹): no article of a Polish code is numbered over 1300
  if (article && !m[2] && !index && m[1].length === 4 && n > 1300) { index = m[1].slice(3); n = +m[1].slice(0, 3) }
  return { n, letters: m[2] ?? '', index, parts: m[4] ? m[4].split('.').slice(1).map(Number) : [] }
}
const hasLabel = (l: Label) => !!(l.letters || l.index || l.parts.length)
function labelWords(l: Label, ordinalStyle: boolean, gender: 'm' | 'f' | 'n', kase: InstCase): string {
  if (l.letter) return PL_LETTERS[l.letters.toLocaleUpperCase('pl')] ?? l.letters
  let words = l.parts.length ? [l.n, ...l.parts].map((n) => numberWords(n, false)).join(' kropka ')
    : ordinalStyle && !hasLabel(l) && l.n < 100 ? ordinalAs(l.n, ORDINAL_ENDS[gender][kase]) : numberWords(l.n, false)
  if (l.letters) words += ` ${[...l.letters].map((c) => PL_LETTERS[c.toLocaleUpperCase('pl')] ?? c).join(' ')}`
  if (l.index) words += ` indeks górny ${+l.index ? numberWords(+l.index, false) : 'zero'}`
  return words
}

// The case the words before a reference ask for; the nominative where a sentence or a list begins, the genitive where nothing says otherwise ("na podstawie art. 5")
const REFERENCE_PREP: Record<string, InstCase> = {
  w: 'loc', we: 'loc', po: 'loc', przy: 'loc', o: 'acc', na: 'acc', za: 'acc', przez: 'acc',
  przed: 'inst', nad: 'inst', pod: 'inst', między: 'inst', poza: 'inst',
  wbrew: 'dat', dzięki: 'dat', ku: 'dat', przeciw: 'dat', przeciwko: 'dat',
}
const REFERENCE_WITH = /(?:^|[\s(])(?:zgodnie|w\s+związku|w\s+zw\.|łącznie|wraz|razem|zgodny|zgodna|zgodne|zgodni|niezgodny|niezgodna|niezgodne|niezgodnie|sprzeczny|sprzeczna|sprzeczne|sprzecznie|zgodność|niezgodność|zgodności|niezgodności)\s+(?:z|ze)$/iu
const REFERENCE_VERB = /(?:ono|ano|ęto|uje|ują|ił|ył|iła|yła|iło|yło|ili|yli|ała|ało|ały|ęła|ęło|ęli|ęły|ął)$/u
const REFERENCE_SUBJECT = /^(?:jest|są|było|będzie|był|była|stanowi)$/u
const REFERENCE_OBJECT = /^(?:dodaj\p{L}*|dodan\p{L}*|dodał\p{L}*|dodano|dodać|uchyla|uchylić|zmienia|zmienić|narusza|naruszyć|wprowadza|wprowadzić|skreśla|skreślić|stosować|zastosować|się|zob|zobacz|por|porównaj)$/u
const sentenceStart = (before: string) => { const tail = before.trimEnd(); return !tail || /(?:\p{L}{4,}|\d|[)\]"”])[.!?]$/u.test(tail) }
function referenceCase(before: string): InstCase {
  const tail = before.trimEnd()
  // after a full stop, a colon, a comma, a closing bracket or a dash nothing governs it: it is a clause or a list item of its own
  if (!tail || /[.!?:;,)\]”"]$|\s[-–—]$/.test(tail)) return 'nom'
  if (REFERENCE_WITH.test(tail)) return 'inst'
  const word = tail.match(/(\p{L}+)$/u)?.[1]?.toLocaleLowerCase('pl') ?? ''
  if (word === 'na' && /(?:opier|opart|oparci|bazuj|polega)\p{L}*\s+(?:się\s+)?na$/iu.test(tail)) return 'loc'
  return REFERENCE_PREP[word] ?? (REFERENCE_SUBJECT.test(word) || NOM_BEFORE.test(word) ? 'nom' : REFERENCE_OBJECT.test(word) || REFERENCE_VERB.test(word) ? 'acc' : 'gen')
}

// The journals: "Dz.U. z 2024 r. poz. 1234" -> "Dziennik Ustaw z dwa tysiące dwudziestego czwartego roku, pozycja tysiąc dwieście trzydzieści cztery". A position is a
// number of the register, so a cardinal at any size. "M.P." stands only with a year, a number or a position after it (it is the initials of a person too).
const JOURNAL_NAMES: Record<string, Six> = {
  'Dz.U.': ['Dziennik Ustaw', 'Dziennika Ustaw', 'Dziennikowi Ustaw', 'Dziennik Ustaw', 'Dziennikiem Ustaw', 'Dzienniku Ustaw'],
  'M.P.': ['Monitor Polski', 'Monitora Polskiego', 'Monitorowi Polskiemu', 'Monitor Polski', 'Monitorem Polskim', 'Monitorze Polskim'],
  'Dz.Urz.': ['Dziennik Urzędowy', 'Dziennika Urzędowego', 'Dziennikowi Urzędowemu', 'Dziennik Urzędowy', 'Dziennikiem Urzędowym', 'Dzienniku Urzędowym'],
  'Dz.Urz.UE': ['Dziennik Urzędowy Unii Europejskiej', 'Dziennika Urzędowego Unii Europejskiej', 'Dziennikowi Urzędowemu Unii Europejskiej', 'Dziennik Urzędowy Unii Europejskiej',
    'Dziennikiem Urzędowym Unii Europejskiej', 'Dzienniku Urzędowym Unii Europejskiej'],
}
const JOURNAL_RE = new RegExp(
  String.raw`(?<![\p{L}\d])(Dz\.\s?U\.|M\.\s?P\.|Dz\.\s?Urz\.\s?UE|Dz\.\s?Urz\.(?=\s+\p{Lu}))(?<org>(?<=Urz\.)\s+\p{Lu}\p{L}{1,6})?` +
  String.raw`(?:\s*(?:,\s*)?(?:z\s+)?(?<year>(?:19|20)\d{2})(?:\s*r\.?)?)?(?:\s*,?\s*(?:Nr|nr)\s*(?<nr>\d{1,4}))?(?:(?:\s*,?\s*poz\.\s*|(?<=\d)\.)(?<poz>\d{1,5}))?`, 'gu')
function sayJournals(text: string): string {
  return text.replace(JOURNAL_RE, (m: string, ...args: unknown[]) => {
    const g = args[args.length - 1] as { org?: string; year?: string; nr?: string; poz?: string }
    const at = args[args.length - 3] as number, all = args[args.length - 2] as string
    const name = JOURNAL_NAMES[(args[0] as string).replace(/\s/g, '')]
    if (name === JOURNAL_NAMES['M.P.'] && !g.year && !g.nr && !g.poz) return m
    const before = all.slice(Math.max(0, at - 40), at).trimEnd()
    const word = before.match(/(\p{L}+)$/u)?.[1]?.toLocaleLowerCase('pl') ?? ''
    const kase: InstCase = REFERENCE_WITH.test(before) ? 'inst' : word === 'w' || word === 'we' || word === 'po' ? 'loc' : ['z', 'ze', 'do', 'od', 'według', 'wg', 'dla', 'bez'].includes(word) ? 'gen' : 'nom'
    const details = [g.year && `z ${yearWords(+g.year, 'gen')}`, g.nr && `numer ${numberWords(+g.nr, false)}`, g.poz && `pozycja ${numberWords(+g.poz, false)}`].filter(Boolean)
    const said = `${name[CASE_INDEX[kase]]}${g.org ?? ''}${details.map((d, i) => (i && !(i === 1 && g.year && g.nr && !g.poz) ? ', ' : ' ') + d).join('')}`
    // "z 2024 r." that ends the sentence keeps its full stop
    return /r\.$/.test(m) && !g.poz && !g.nr && !/^\s*[\p{Ll}\d,;)]/u.test(all.slice(at + m.length)) ? `${said}.` : said
  })
}

interface Chain { end: number; rank: number; kase: InstCase; head: InstCase }
const LIST_PART = /(\s*[-–—]\s*|,\s*|\s+(?:i|oraz|lub|albo)\s+)/u
const ENGLISH_AFTER = /^\s+(?:of|the|and|to|in|under)(?![\p{L}])/iu
export function sayProvisions(text: string): string {
  let chain: Chain | null = null
  return sayJournals(text).replace(REFERENCE_RE, (m: string, ...args: unknown[]) => {
    const g = args[args.length - 1] as Record<string, string | undefined>
    const at = args[args.length - 3] as number, all = args[args.length - 2] as string
    const previous = chain
    chain = null
    const token = g.nAbbr ?? g.nWord ?? g.lAbbr ?? g.rAbbr ?? g.rWord!
    const list = (g.nList ?? g.lList ?? g.rList)!
    const bare = token.toLocaleLowerCase('pl').replace(/\.$/, '')
    const full = FULL_UNIT.get(bare)
    const key = full?.key ?? ABBREVIATION_UNIT[bare]
    if (!key) return m
    const unit = PROVISION_UNITS[key]
    const before = all.slice(Math.max(0, at - 160), at)
    const elementEnd = at + g.element!.length
    // English: "Art. 5 of the Directive" is left to the English reader
    if (ENGLISH_AFTER.test(all.slice(elementEnd))) return m
    const continues = !!previous && !full?.plural && unit.rank > previous.rank && unit.rank > 0 && /^[\s,;(]*$/.test(all.slice(previous.end, at))
    // "o 25 pkt 3": the point of a provision follows no quantity ("ust. 2 pkt 3" is the chain, which is taken above)
    if (!continues && key === 'pkt' && !full && /\d\s*$/.test(before)) return m
    // "w art. 5 ust. 2 i art. 7": the second article is in the case of the first
    const listed = !continues && !!previous && /^\s*(?:,|i|oraz|lub|albo)\s*$/.test(all.slice(previous.end, at))
    const kase: InstCase = full ? full.kase : continues ? 'nom' : listed ? previous!.head : referenceCase(before)
    // the items: single labels and ranges
    const parts = list.split(LIST_PART)
    const items: (Label | [Label, Label])[] = []
    for (let i = 0; i < parts.length; i += 2) {
      const label = parseLabel(parts[i], unit, key === 'art')
      if (!label) return m
      const separator = parts[i - 1]
      if (i && /^\s*[-–—]\s*$/.test(separator)) { const first = items.pop()!; if (Array.isArray(first)) return m; items.push([first, label]) } else items.push(label)
    }
    const labels = items.flat()
    const ordinalStyle = !g.nNr && (unit.values !== 'number' || !labels.some((l) => hasLabel(l) || l.n >= 100))
    const ranged = items.some(Array.isArray)
    const plural = full ? full.plural : token === '§§' || ranged || (!continues && items.length > 1)
    const noun = (plural ? unit.many : unit.one)[CASE_INDEX[kase]]
    const said = items.map((item) =>
      Array.isArray(item) ? `od ${labelWords(item[0], ordinalStyle, unit.gender, 'gen')} do ${labelWords(item[1], ordinalStyle, unit.gender, 'gen')}` : labelWords(item, ordinalStyle, unit.gender, kase))
    const listWords = said.length > 1 ? `${said.slice(0, -1).join(', ')} i ${said[said.length - 1]}` : said[0]
    let out = `${noun} ${g.nNr ? 'numer ' : ''}${listWords}`
    if (!continues && (sentenceStart(before) || (/^\p{Lu}/u.test(token) && kase === 'nom'))) out = out[0].toLocaleUpperCase('pl') + out.slice(1)
    if (unit.rank > 0 && !g.code) chain = { end: at + m.length, rank: unit.rank, kase: continues ? 'nom' : kase, head: continues ? previous!.head : kase }
    // a code after the reference is the code in the genitive; its full stop (of "k.c.") ends the sentence where one begins after it
    if (g.code) {
      const code = g.code === 'MAR' ? undefined : CODE_BY_KEY.get(writingKey(g.code))
      if (g.code !== 'MAR' && !code) return m
      const dot = g.code.endsWith('.') && !/^\s*[\p{Ll}\d,;)]/u.test(all.slice(at + m.length)) ? '.' : ''
      out += ` ${code ? code.entry[2][1] : 'rozporządzenia Mar'}${dot}`
    }
    return out
  })
}

// A code on its own, where nothing but the words round it says it is the code: "zmiany w Kc" -> "zmiany w kodeksie cywilnym", "przepisy KSH" -> "przepisy
// kodeksu spółek handlowych". A writing that is used for something else too is said only where the words of the law stand round it (the mode C), and those
// of two letters (KC, KK, KP, KW, KM) only after a reference, where they are said above.
const LEGAL_CUE = /przepis|ustaw|nowelizac|noweliz|kodeks|artyku|paragraf|\bart\b|zgodnie z|na podstawie|\bsąd|prawn|prawo |uchwał|wykrocz|przestępst|pracodawc|pracownik|umow|karn|cywiln|spółk|akcjonar|zarząd/iu
const CODE_ITEM = String.raw`(?:${CODE_ALTERNATIVES})(?![\p{L}\d]|-\p{L})`
// One code or several in a row ("kc i ksh", "Kc/KSH"): they stand in the same case, and one that may be said on its own makes the others said too
const CODE_LIST_RE = new RegExp(String.raw`(?<![\p{L}\d]|\p{Ll}-)${CODE_ITEM}(?:(?:\s*(?:,|/)\s*|\s+(?:i|oraz|lub|albo)\s+)${CODE_ITEM})*`, 'gu')
const CODE_LIST_PART = /(\s*(?:,|\/)\s*|\s+(?:i|oraz|lub|albo)\s+)/u
const CODE_NAME_IN_BRACKETS = new RegExp(String.raw`\s*\(\s*(?:(?:zwan\p{L}+\s+)?dalej(?:\s+jako)?\s*:?\s*|zwan\p{L}+\s*:?\s*)?[„"“]?(${CODE_ALTERNATIVES})[”"”]?\s*\)`, 'gu')
const CODE_ADJECTIVE = /(?:^(?:ten|ów|polski|obecny|nowy|stary|dawny|aktualny|poprzedni)|(?:ny|ty|wy|ski|ący)|(?:ąca|ąc|ące))$/u
// What follows a code that is the subject of a sentence: "Kc przewiduje", "KSH nie dopuszcza", "Kpc wszedł"
const CODE_SUBJECT_AHEAD = /^\s+(?:nie\s+)?(?:stanowi|przewiduje|przewidują|reguluje|regulują|wymaga|wymagają|dopuszcza|dopuszczają|zakazuje|nakazuje|określa|określają|pozwala|przyznaje|uznaje|głosi|nakłada|ustanawia|zawiera|wskazuje|obowiązuje|obowiązują|wchodzi|zmienia|mówi|\p{L}{3,}(?:ł|ła|ło|li|ły))(?![\p{L}])/u
const CODE_NOT = new Map<string, RegExp>()
const codeNot = (source: string) => { let re = CODE_NOT.get(source); if (!re) CODE_NOT.set(source, (re = new RegExp(source, 'iu'))); return re }
export function sayCodes(text: string): string {
  return text
    // "kodeks spółek handlowych (dalej: KSH)": the abbreviation after the name is not said again
    .replace(CODE_NAME_IN_BRACKETS, (m: string, writing: string, at: number, all: string) => {
      const code = CODE_BY_KEY.get(writingKey(writing))
      const tail = all.slice(Math.max(0, at - 90), at).toLocaleLowerCase('pl')
      return code && code.entry[2].some((form) => tail.endsWith(form)) ? '' : m
    })
    .replace(CODE_LIST_RE, (m: string, at: number, all: string) => {
      const before = all.slice(Math.max(0, at - 200), at)
      if (/\d\s*$/.test(before)) return m
      const around = all.slice(Math.max(0, at - 120), at + m.length + 120)
      const parts = m.split(CODE_LIST_PART)
      const codes = parts.filter((_, i) => i % 2 === 0).map((writing) => CODE_BY_CLASS.get(classKey(writing)))
      if (codes.some((code) => !code)) return m
      const said = (code: CodeWriting | undefined) => !!code && !(code.entry[4] && codeNot(code.entry[4]).test(around)) && (code.mode === 'F' || (code.mode === 'C' && LEGAL_CUE.test(around)))
      if (!codes.some(said)) return m
      const word = before.match(/(\p{L}+)\s+$/u)?.[1]?.toLocaleLowerCase('pl') ?? ''
      // the subject of a clause by what the analysts or the court say ("zdaniem sądu Kc nie dopuszcza"); after a noun ("przepisy KSH nie przewidują") it is its attribute
      const subject = CODE_SUBJECT_AHEAD.test(all.slice(at + m.length)) && /(?:zdaniem|według|wg)\s+\p{L}+\s+$/iu.test(before)
      // in brackets after a word it stands beside it: "ustawa o ofercie (u.o.p.)"
      const kase: InstCase = subject || /\(\s*$/.test(before) ? 'nom' : CODE_ADJECTIVE.test(word) && !(word in PREP_CASE) ? (/ąc$/.test(word) ? 'acc' : 'nom') : caseBefore(before, 'inst')
      const names = parts.map((part, i) => {
        if (i % 2) return /\//.test(part) ? ' i ' : part
        const name = codes[i / 2]!.entry[2][CASE_INDEX[kase]]
        return i === 0 && sentenceStart(before) ? name[0].toLocaleUpperCase('pl') + name.slice(1) : name
      })
      const last = parts[parts.length - 1]
      const dot = last.endsWith('.') && !/^\s*[\p{Ll}\d,;)]/u.test(all.slice(at + m.length)) ? '.' : ''
      return names.join('') + dot
    })
}

// "Płd." and "Płn." are "południowy" and "północny" in the gender and case of the name they belong to: "Korea Płd." ->
// "Korea Południowa", "w Korei Płd." -> "w Korei Południowej", "z Koreą Płd." -> "z Koreą Południową", "Sudan Płd." ->
// "Sudan Południowy", "Ameryka Płn." -> "Ameryka Północna"; before a name: "w płd. Polsce" -> "w południowej Polsce";
// "na płd. od Warszawy" -> "na południe od Warszawy". Joined ones ("płd.-wsch.") are left alone.
const COMPASS: Record<string, { adjective: string; noun: string }> = {
  płd: { adjective: 'południow', noun: 'południe' },
  płn: { adjective: 'północn', noun: 'północ' },
}
// Masculine names whose locative looks like a feminine one ("w Sudanie", "na Cyprze")
const MASCULINE_LOCATIVE = /^(?:Sudanie|Wietnamie|Jemenie|Libanie|Kaukazie|Cyprze|Kordofanie|Darfurze)$/u
// The ending of the adjective that goes with a name, from the name's own ending; "u" is both the genitive and the
// locative of a masculine name, which the preposition before it tells apart
function adjectiveEnding(name: string, before: string): string {
  if (/[ąę]$/u.test(name)) return 'ą'
  if (MASCULINE_LOCATIVE.test(name)) return 'ym'
  if (/(?:[iy]|ie|ce|dze)$/u.test(name)) return 'ej'
  if (/ch$/u.test(name)) return 'ych'
  if (/a$/u.test(name)) return 'a'
  if (/owi$/u.test(name)) return 'emu'
  if (/em$/u.test(name)) return 'ym'
  if (/e$/u.test(name)) return 'e'
  if (/u$/u.test(name)) return PREP_CASE[before.trimEnd().match(/(\p{L}+)$/u)?.[1]?.toLocaleLowerCase('pl') ?? ''] === 'loc' ? 'ym' : 'ego'
  return 'y'
}
export function sayDirections(text: string): string {
  return text
    .replace(/(?<![\p{L}\d])(na)\s+(płd|płn)\.(?=\s+od(?!\p{L}))/giu, (m, na: string, kind: string) => `${na} ${COMPASS[kind.toLocaleLowerCase('pl')].noun}`)
    .replace(/(?<![\p{L}\d])([Pp])(ł[dn])\.(?![-–]\p{L})/gu, (m, first: string, kind: string, at: number, all: string) => {
      const { adjective } = COMPASS[`p${kind}`]
      const said = (ending: string, dot = '') => `${first === 'P' ? adjective[0].toLocaleUpperCase('pl') : adjective[0]}${adjective.slice(1)}${ending}${dot}`
      const before = all.slice(0, at)
      const after = all.slice(at + m.length)
      // "Korea Płd.": the name before it (a capitalised word, or a hemisphere: "na półkuli płn.")
      const name = before.match(/(?<![\p{L}\d])(\p{Lu}\p{L}*|półkul\p{L}*)\s+$/u)
      if (name) return said(adjectiveEnding(name[1], before.slice(0, name.index)), sentenceGoesOn(after) ? '' : '.')
      // "płd. Polska": the name after it
      const next = after.match(/^\s+(\p{Lu}\p{L}*)/u)
      if (next) return said(adjectiveEnding(next[1], before))
      return m
    })
}

// "o godz. 11" is "o godzinie jedenastej", "do godz. 9:30" is "do godziny dziewiątej trzydzieści", "na godz. 11" is "na godzinę
// jedenastą": the hour is an ordinal in the case of the word before it, where a voice alone says "godzina jedenasta".
// A range ("godz. 9-17") is left alone.
const HOUR_PREP: Record<string, InstCase> = {
  o: 'loc', po: 'loc', przy: 'loc', do: 'gen', od: 'gen', około: 'gen', ok: 'gen', koło: 'gen', wokół: 'gen', przed: 'inst', na: 'acc', przez: 'acc',
}
const HOUR_WORD: Record<InstCase, string> = { nom: 'godzina', gen: 'godziny', dat: 'godzinie', acc: 'godzinę', inst: 'godziną', loc: 'godzinie' }
const HOUR_END: Record<InstCase, string> = { nom: 'a', gen: 'ej', dat: 'ej', acc: 'ą', inst: 'ą', loc: 'ej' }
export const sayHours = (text: string) =>
  text.replace(/(?<![\p{L}\d])([Gg])odz\.\s*(\d{1,2})(?:[:.](\d{2}))?(?!\d|[:.]\d|\s*[-–]\s*\d)/gu, (m, g: string, h: string, min: string | undefined, at: number, all: string) => {
    const hour = +h
    if (hour < 1 || hour > 24 || (min && +min > 59)) return m
    const kase = HOUR_PREP[all.slice(0, at).match(/(\p{L}+)\.?\s*$/u)?.[1]?.toLocaleLowerCase('pl') ?? ''] ?? 'nom'
    const minutes = min && +min ? ` ${+min < 10 ? 'zero ' : ''}${cardinal(+min)}` : ''
    const said = `${HOUR_WORD[kase]} ${ordinalAs(hour, HOUR_END[kase])}${minutes}`
    return g === 'G' ? said[0].toLocaleUpperCase('pl') + said.slice(1) : said
  })

// "pow." is "powiat", "woj." is "województwo" and "gm." is "gmina", in the case the words around them ask for: "w pow.
// grodziskim" -> "w powiecie grodziskim", "z woj. śląskiego" -> "z województwa śląskiego", "w gm. Wieliszew" -> "w gminie
// Wieliszew". The adjective after them tells the case when it can ("grodziskiego" is the genitive, "grodziskim" the
// locative or the instrumental), else the word before. Only in front of the adjective of a place name (-ski, -cki, -zki)
// or, for a commune, a capitalised name: "pow. 50 m kw." and "pow. średniej" (above) stay.
const TERRITORY: Record<string, Record<InstCase, string>> = {
  pow: { nom: 'powiat', gen: 'powiatu', dat: 'powiatowi', acc: 'powiat', inst: 'powiatem', loc: 'powiecie' },
  woj: { nom: 'województwo', gen: 'województwa', dat: 'województwu', acc: 'województwo', inst: 'województwem', loc: 'województwie' },
  gm: { nom: 'gmina', gen: 'gminy', dat: 'gminie', acc: 'gminę', inst: 'gminą', loc: 'gminie' },
}
const PLACE_ADJECTIVE = /(?:sk|ck|zk)(?:i|a|ie|iego|iemu|im|iej|ą)$/u
function territoryCase(adjective: string, before: string): InstCase {
  const asked = caseBefore(before, 'inst')
  if (/ego$/u.test(adjective)) return 'gen'
  if (/emu$/u.test(adjective)) return 'dat'
  if (/(?:ym|im)$/u.test(adjective)) return asked === 'inst' ? 'inst' : 'loc'
  if (/ej$/u.test(adjective)) return asked === 'dat' || asked === 'loc' ? asked : 'gen'
  if (/ą$/u.test(adjective)) return asked === 'inst' ? 'inst' : 'acc'
  return asked === 'acc' ? 'acc' : 'nom'
}
export const sayTerritories = (text: string) =>
  text.replace(/(?<![\p{L}\d])([Pp]ow|[Ww]oj|[Gg]m)\.\s+(\p{L}[\p{L}-]*)/gu, (m, abbreviation: string, word: string, at: number, all: string) => {
    const kind = abbreviation.toLocaleLowerCase('pl')
    const before = all.slice(0, at)
    // a commune is followed by its name, which does not change: its case is the one the words before ask for
    const kase = PLACE_ADJECTIVE.test(word.toLocaleLowerCase('pl')) ? territoryCase(word.toLocaleLowerCase('pl'), before)
      : kind === 'gm' && /^\p{Lu}/u.test(word) ? caseBefore(before, 'inst') : null
    if (!kase) return m
    const said = TERRITORY[kind][kase]
    return `${abbreviation[0] === abbreviation[0].toLocaleUpperCase('pl') ? said[0].toLocaleUpperCase('pl') + said.slice(1) : said} ${word}`
  })

// Abbreviations said letter by letter with the Polish names of the letters, so a voice does not read them as a word:
// "OECD" is "o e ce de"
const SPELLED_PL = ['OECD', 'CBAM', 'ESRS', 'HKMA']
const SPELLED_PL_RE = new RegExp(String.raw`(?<![\p{L}\d])(${SPELLED_PL.join('|')})(?![\p{L}\d])`, 'gu')
export const saySpelled = (text: string) => text.replace(SPELLED_PL_RE, (m) => spell(m))

// "DM" is a brokerage: "Trigon DM przedstawia" -> "Trigon dom maklerski przedstawia", "według DM BOŚ" ->
// "według domu maklerskiego BOŚ", "w DM" -> "w domu maklerskim"
const AFTER_GENITIVE = /(?:^|[\s(])(?:według|wg|od|z|ze|dla|do|u|zdaniem|analitycy|analityk|analityczka|ekonomiści|ekonomista|eksperci|ekspert|raport|raporcie|rekomendacja|rekomendacji|prognoza|prognozy)\s*$/iu
export const sayBrokers = (text: string) =>
  text.replace(/(?<![\p{L}\d])DM(?![\p{L}\d])/gu, (m, at: number, all: string) => {
    const before = all.slice(0, at)
    return AFTER_GENITIVE.test(before) ? 'domu maklerskiego' : /(?:^|\s)(?:w|we|o|przy)\s*$/iu.test(before) ? 'domu maklerskim' : 'dom maklerski'
  })

// Abbreviations said as words, not spelled ("rozporządzenia MAR" -> "mar", "dla PAP" -> "pap").
// ASI (alternatywna spółka inwestycyjna) is "as" and "i" run together: written "Asi" a voice makes it a name
// with a soft "ś" (like the vocative of Asia)
const AS_WORDS: Record<string, string> = { MAR: 'Mar', PAP: 'Pap', ZUS: 'Zus', GUS: 'Gus', NIK: 'Nik', PIT: 'Pit', CIT: 'Cit', VAT: 'Wat', ASI: 'as i', BOŚ: 'Boś', FIZ: 'Fiz',
  // Names with a "c" that a Polish voice reads "ts" ("Opec" as "Opets", "Ecofin" as "Etsofin") or letters it cannot say, written as they sound
  OPEC: 'Opek', BRICS: 'Briks', MiCA: 'Mika', MICA: 'Mika', EUROCONTROL: 'Eurokontrol', Eurocontrol: 'Eurokontrol', HELCOM: 'Helkom', CENELEC: 'Cenelek',
  Ecofin: 'Ekofin', ECOFIN: 'Ekofin', Coreper: 'Koreper', COREPER: 'Koreper', AGRIFISH: 'Agrifisz', SAFE: 'Sejf', MREL: 'Emrel' }
const AS_WORDS_RE = new RegExp(String.raw`(?<![\p{L}\d])(${Object.keys(AS_WORDS).join('|')})(?![\p{L}\d])`, 'gu')
// Whether the text ends with an article, paragraph or point and what follows it up to here: numbers, ordinals ("siedemnastego"), letters,
// "i" ("artykułu siedemnastego ustęp 1 i 4"). Token by token from the end, so a long text costs nothing.
const REFERENCE_WORD = /^(?:artykuł\p{L}*|ustęp\p{L}*|punkt\p{L}*|lit\.)$/iu
const REFERENCE_PART = /^(?:\d+\p{L}?|\p{L}{1,2}|oraz|lub)[,;]?$/iu
let ordinalWords: Set<string> | undefined
const isOrdinalWord = (word: string) => {
  ordinalWords ??= new Set((['nom', 'gen', 'loc', 'inst'] as Kase[]).flatMap((k) => Array.from({ length: 199 }, (_, i) => ordinalUpTo199(i + 1, k).split(' ')).flat()))
  return ordinalWords.has(word.toLocaleLowerCase('pl'))
}
function endsWithReference(before: string): boolean {
  const tokens = before.trimEnd().split(/\s+/).slice(-12)
  for (let i = tokens.length - 1; i >= 0; i--) {
    if (REFERENCE_WORD.test(tokens[i].replace(/,$/, ''))) return true
    if (!REFERENCE_PART.test(tokens[i]) && !isOrdinalWord(tokens[i].replace(/[,;]$/, ''))) return false
  }
  return false
}
// "MAR" after an article, paragraph or point of a regulation is that regulation: "art. 19 ust. 1 MAR" -> "artykułu dziewiętnastego ustęp 1
// rozporządzenia Mar". Said as "1 Mar" a voice takes it for a date, the first of March.
export const sayAsWords = (text: string) =>
  text.replace(AS_WORDS_RE, (m: string, word: string, at: number, all: string) => {
    const reference = endsWithReference(all.slice(Math.max(0, at - 120), at))
    return m === 'MAR' && reference && !/rozporządzeni\p{L}*\s+$/iu.test(all.slice(0, at)) ? `rozporządzenia ${AS_WORDS[m]}` : AS_WORDS[m]
  })

// ── English: said the English way ──

// Letters as an English speaker names them, written for a Polish voice
const EN_LETTERS: Record<string, string> = {
  A: 'ej', B: 'bi', C: 'si', D: 'di', E: 'i', F: 'ef', G: 'dżi', H: 'ejcz', I: 'aj', J: 'dżej', K: 'kej', L: 'el', M: 'em',
  N: 'en', O: 'ou', P: 'pi', Q: 'kju', R: 'ar', S: 'es', T: 'ti', U: 'ju', V: 'wi', W: 'dablju', X: 'eks', Y: 'łaj', Z: 'zi',
}
// Abbreviations that are said in English in Polish too ("AI" is "ej aj", not "a i"); the rest is spelled the Polish way (PKB, NBP, USA)
const SPELLED_EN = ['AI', 'AGI', 'IT', 'CEO', 'CFO', 'COO', 'CTO', 'CIO', 'GPT', 'API', 'UX', 'VR', 'NFT', 'BBC', 'CNN', 'CNBC', 'IBM', 'AMD',
  'IPO', 'NFP', 'FDA', 'MCI']
// Names said in English, written for a Polish voice
const NAMES_EN: [RegExp, string][] = [
  [/(?<![\p{L}\d])USGS(?![\p{L}\d])/gu, 'Junajted Stejts Dżiolodżikal Serwej'],
  [/(?<![\p{L}\d])OpenAI(?![\p{L}\d])/gu, 'Open ej aj'],
  [/(?<![\p{L}\d])ChatGPT(?![\p{L}\d])/gu, 'Czat dżi pi ti'],
  [/(?<![\p{L}\d])PayU(?![\p{L}\d])/gu, 'Pej ju'],
  [/(?<![\p{L}\d])ISB[Nn]ews(?![\p{L}\d])/gu, 'i es be niuz'],
  [/(?<![\p{L}\d])Play2Chill(?![\p{L}\d])/gu, 'Plej tu czil'],
  // A "2" between a word and a capitalised one is the English "to" ("Kool2Play" -> "Kul tu Plej", "Go2Market"), "Kool" and "Cool" are "kul";
  // the name in capitals as ESPI writes a company ("KOOL2PLAY S.A.") is said the same before the capitals are turned into words
  [/(?<![\p{L}\d])Kool2Play(?![\p{L}\d])/giu, 'Kul tu Plej'],
  [/(?<=\p{Ll})2(?=\p{Lu}\p{Ll})/gu, ' tu '],
  [/(?<![\p{L}\d])(?:Kool|Cool)(?![\p{L}\d])/gu, 'Kul'],
  [/(?<![\p{L}\d])PlayWay(?![\p{L}\d])/gu, 'Plej łej'],
  // English words in company names: "CREEPY JAR S.A." -> "Kripi Dżar spółka akcyjna"
  [/(?<![\p{L}\d])(?:CREEPY|Creepy)(?![\p{L}\d])/gu, 'Kripi'],
  [/(?<![\p{L}\d])(?:JAR|Jar)(?![\p{L}\d])/gu, 'Dżar'],
  // "HUUUGE, INC." is "huge" (the stretched "uuu" is no matter), "Games" is "gejms": "Huuuge Games" -> "Hiudż Gejms". Written "Hjudż" a voice drops the
  // "h" and says "judż"; "Hiudż" keeps it (the "hi" is the soft h of "historia", as "biu" in "biuro")
  [/(?<![\p{L}\d])Hu{2,}ge(?![\p{L}\d])/giu, 'Hiudż'],
  // "CI GAMES S.A." keeps its "Ci" a word (said alone in capitals it would be spelled)
  [/(?<![\p{L}\d])CI(\s+)Games(?![\p{L}\d])/giu, 'Ci$1Gejms'],
  [/(?<![\p{L}\d])Games(?![\p{L}\d])/giu, 'Gejms'],
  // "MCI CAPITAL ASI S.A." -> "em si aj Kapitał ..."; the funds of MCI, "MCI.PrivateVentures" -> "em si aj Prajwet Wenczers" (no dot, the words apart)
  [/(?<![\p{L}\d])Capital(?![\p{L}\d])/giu, 'Kapitał'],
  [/(?<![\p{L}\d])MCI\.(?=\p{Lu})/gu, 'MCI '],
  [/(?<![\p{L}\d])Private(?=\p{Lu}|\s|$)/gu, 'Prajwet'],
  [/(?<=\p{L})Ventures(?![\p{L}\d])/gu, ' Wenczers'],
  [/(?<![\p{L}\d])Ventures(?![\p{L}\d])/gu, 'Wenczers'],
  // "Play" and "One" in names: "Play" -> "plej", "FaktorOne" -> "Faktor łan"
  [/(?<=\p{L})Play(?!\p{Ll})/gu, ' plej'],
  [/(?<!\p{L})Play(?!\p{Ll})/gu, 'Plej'],
  [/(?<=\p{Ll})One(?!\p{Ll})/gu, ' łan'],
  // "Pay" in names: "OPay" -> "O pej", "Google Pay" -> "Google pej", "PayPal" -> "PejPal"
  [/(?<=\p{L})Pay(?!\p{Ll})/gu, ' pej'],
  [/(?<!\p{L})Pay(?!\p{Ll})/gu, 'Pej'],
  // the same in capitals, as ESPI writes a company: "OPAY" -> "O pej", "PAYU" -> "Pej ju"
  [/(?<=\p{Lu})PAY(?![\p{L}\d])/gu, ' pej'],
  [/(?<![\p{L}\d])PAYU(?![\p{L}\d])/gu, 'Pej ju'],
  // English and German legal forms: the letters the English way ("LLC" is "el el si"), "GmbH" by its letters
  [/(?<![\p{L}\d])L\.?L\.?C\.?(?![\p{L}\d])/gu, 'el el si'],
  [/(?<![\p{L}\d])L\.?L\.?P\.?(?![\p{L}\d])/gu, 'el el pi'],
  [/(?<=\p{Lu}[\p{L}\d]*\s+)(?:PLC|plc)(?![\p{L}\d])/gu, 'pi el si'],
  [/(?<![\p{L}\d])GmbH(?![\p{L}\d])/gu, 'ge em be ha'],
]
const SPELLED_EN_RE = new RegExp(String.raw`(?<![\p{L}\d])(${SPELLED_EN.join('|')})(?![\p{L}\d])`, 'gu')
// A word of an English name that a Polish voice says as a Polish word: "Asia" is a name for it. Inside an English name,
// next to another capitalised word ("New Asia Forum", "Asia Pacific", "Nikkei Asia", "South-East Asia"), it is said the English way;
// alone, or after a full stop or a lower-case word ("Rozmawiała z Asią", "Asia poszła"), it stays
const EN_IN_NAMES: Record<string, string> = { Asia: 'Ejża' }
const EN_IN_NAMES_RE = new RegExp(String.raw`(?<![\p{L}\d])(${Object.keys(EN_IN_NAMES).join('|')})(?![\p{L}\d])`, 'gu')
const sayEnglishInNames = (text: string) =>
  text
    .replace(/(?<![\p{L}\d])New(\s+)(?=Asia(?![\p{L}\d]))/gu, 'Niu$1')
    .replace(EN_IN_NAMES_RE, (m: string, word: string, at: number, all: string) => {
      const left = all.slice(0, at).match(/(\p{L}+)[ \-/]$/u)?.[1]
      const right = all.slice(at + m.length).match(/^[ \-/](\p{Lu}\p{L}*)/u)?.[1]
      return /^\p{Lu}/u.test(left ?? '') || right ? EN_IN_NAMES[word] : m
    })
// ── Names of companies and institutions of the United States (names-us.ts) and of audit, consulting and law firms (names-firms.ts): said the English way, written for a Polish voice ──
// A name as Polish headlines decline it ("kurs Nvidii", "od Microsoftu", "akcje Tesli"): the ending is kept, the name respelled. A name in -a loses
// its "a" before an ending (Nvidia -> Nvidii, Tesla -> Teslę); the others take the endings of a masculine noun. Only names marked as declined do:
// "Applebee" is not "Apple" with an ending.
const US_ENDINGS_MASCULINE = new Set(['a', 'owi', 'em', 'iem', 'u', 'ie', 'owie', 'ów', 'om', 'ami', 'ach'])
const US_ENDINGS_FEMININE = new Set(['i', 'y', 'ę', 'ą', 'o', 'e', 'ie'])
const usKey = (form: string) => form.replace(/\s+/g, ' ')
const US_BY_FORM = new Map<string, { said: string; stem: boolean; inflects: boolean }>()
for (const [written, said, inflects] of [...US_NAMES, ...FIRM_NAMES]) {
  const feminine = inflects && written.endsWith('a') && said.endsWith('a')
  US_BY_FORM.set(usKey(written), { said, stem: false, inflects })
  // The name in capitals too ("NVIDIA", "JPMORGAN CHASE"), with no endings
  if (written.length > 3 && /\p{Ll}/u.test(written)) US_BY_FORM.set(usKey(written.toLocaleUpperCase('en')), { said, stem: false, inflects: false })
  if (feminine) US_BY_FORM.set(usKey(written.slice(0, -1)), { said: said.slice(0, -1), stem: true, inflects })
}
const US_RE = new RegExp(
  String.raw`(?<![\p{L}\d])(${[...US_BY_FORM.keys()].sort((a, b) => b.length - a.length)
    .map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, String.raw`\s+`)).join('|')})(['’]?)(\p{Ll}{0,5})(?![\p{L}\d])`, 'gu')
// The English words in company names, only after another capitalised word ("Foo Technologies"): a sentence in Polish does not have them there
// ESPI writes a company in capitals ("CELON PHARMA S.A."): the word in capitals is said the same
const US_WORD_BY_FORM = new Map<string, string>(US_WORDS.flatMap(([written, said]) => [[written, said], [written.toLocaleUpperCase('en'), said]]))
const US_WORD_RE = new RegExp(
  String.raw`(?<=\p{Lu}[\p{L}\d&.'’-]*\s+)(${[...US_WORD_BY_FORM.keys()].sort((a, b) => b.length - a.length).map((k) => k.replace(/\./g, '\\.')).join('|')})(?![\p{L}\d])`, 'gu')
const sayUsWords = (text: string) => text.replace(US_WORD_RE, (m: string, word: string) => US_WORD_BY_FORM.get(word) ?? m)
export const sayUsNames = (text: string) =>
  sayUsWords(text.replace(US_RE, (m: string, form: string, apostrophe: string, ending: string) => {
    const name = US_BY_FORM.get(usKey(form))
    if (!name) return m
    if (!ending) return apostrophe || name.stem ? m : name.said
    if (!name.inflects || !(name.stem ? US_ENDINGS_FEMININE : US_ENDINGS_MASCULINE).has(ending)) return m
    return `${name.said}${ending}`
  }))
// "Co.", "Cos.", "Company" and "Companies" at the end of a company's name are not said: "Boeing Co." is "Boeing", "JPMorgan Chase & Co." "JPMorgan Chase". Only
// after another capitalised word (the "Co" of a Polish sentence is never capitalised there), and "Company" only where the name does not go on ("Company Store").
// The full stop of the abbreviation stays where it ends a sentence ("Boeing Co. Prezes" -> "Boeing. Prezes").
const COMPANY_SUFFIX = /(?<=\p{Lu}[\p{L}\d.'’-]*)(?:\s+&)?\s+(?:(Cos?)(\.?)(?![\p{L}\d])|(?:Company|Companies)(?![\p{L}\d]|\s+\p{Lu}))/gu
const dropCompany = (text: string) =>
  text.replace(COMPANY_SUFFIX, (m: string, abbreviation: string | undefined, dot: string | undefined, at: number, all: string) =>
    abbreviation && dot && /^\s+\p{Lu}/u.test(all.slice(at + m.length)) ? '.' : '')
export function sayEnglish(text: string): string {
  let t = dropCompany(sayUsNames(sayEnglishInNames(text)))
  for (const [re, said] of NAMES_EN) t = t.replace(re, said)
  return t.replace(SPELLED_EN_RE, (m) => [...m].map((c) => EN_LETTERS[c]).join(' '))
}

// ── Markets ──

// Currency codes in a pair: "EUR/PLN" is "euro pe el en", "USD/PLN" "u es de pe el en"
const CURRENCIES = new Set(['PLN', 'EUR', 'USD', 'CHF', 'GBP', 'JPY', 'CZK', 'HUF', 'NOK', 'SEK', 'DKK', 'CAD', 'AUD', 'NZD', 'CNY', 'TRY', 'RON', 'RUB', 'UAH'])
const sayCurrency = (code: string) => (code === 'EUR' ? 'euro' : [...code].map((c) => PL_LETTERS[c]).join(' '))
// "WIG20" -> "wig dwadzieścia", "mWIG40" -> "emwig czterdzieści", "sWIG80" -> "eswig osiemdziesiąt" (a word, not spelled; the "m" and the
// "s" of the index are said as letters, the number in words); "S&P 500" -> "es and pi 500"; "na FX/FI" -> "na rynku walutowym i obligacji"
const INDEX_PREFIX: Record<string, string> = { m: 'em', s: 'es' }
export function sayMarkets(text: string): string {
  return text
    // "SWIG" without a number is not an index
    .replace(/(?<![\p{L}\d])([msMS]?)WIG(\d*)(TR)?(?![\p{L}\d])/gu, (m, pre: string, num: string, total?: string) =>
      /[MS]/.test(pre) && !num ? m
        : `${INDEX_PREFIX[pre.toLowerCase()] ?? ''}wig${num ? ` ${+num > 0 && +num < 1000 ? cardinal(+num) : num}` : ''}${total ? ' te er' : ''}`)
    .replace(/(?<![\p{L}\d])S&P(?:\s?(\d+))?(?![\p{L}\d])/gu, (m, num?: string) => `es and pi${num ? ` ${num}` : ''}`)
    .replace(/(?<!\p{L})([Nn][Aa]|[Ww])\s+FX\/FI(?!\p{L})/gu, '$1 rynku walutowym i obligacji')
    .replace(/(?<!\p{L})FX\/FI(?!\p{L})/gu, 'rynek walutowy i obligacji')
    .replace(/(?<![\p{L}\d])([A-Z]{3})\/([A-Z]{3})(?![\p{L}\d])/gu, (m, a: string, b: string) =>
      CURRENCIES.has(a) && CURRENCIES.has(b) ? `${sayCurrency(a)} ${sayCurrency(b)}` : m)
}

// ── Names of banks, brands and people ──

// "mBank" and "MBANK" -> "Embank", "mObywatel" -> "Emobywatel": a small "m" before a capital letter is the letter "em", the rest a word.
// "PKO BP" and "PKO bp" are said letter by letter, "pe ka o be pe" (written "bp" a voice reads one word)
// Surnames that a voice reads by their spelling, not as they are said in Polish: "Merz" (the German chancellor) is "Merc", the endings
// the name takes in Polish are kept ("Merza" is "Merca", "Merzowi" "Mercowi", "Merzem" "Mercem")
const SURNAMES: Record<string, string> = { merz: 'Merc', scholz: 'Szolc' }
const SURNAME_RE = new RegExp(String.raw`(?<![\p{L}\d])(${Object.keys(SURNAMES).join('|')})(a|owi|em|u|owie|ów|om|ami|ach)?(?![\p{L}\d])`, 'giu')
// "mPay" and "MPAY" (the name in capitals, as ESPI writes a company) are the same: "Empej", the letter "em" and the English "pay" ("pej"), one word like "Embank";
// the other brands with the "m" are in capitals the same way (MBANK, MLEASING, MOBYWATEL)
const M_BRANDS = /(?<![\p{L}\d])M(BANK|PAY|LEASING|OBYWATEL)(?![\p{L}\d])/gu
export const sayProperNames = (text: string) =>
  text
    .replace(/(?<![\p{L}\d])[mM]Pay(?![\p{L}\d])/gu, 'Empej')
    .replace(/(?<![\p{L}\d])m(\p{Lu})(\p{Ll}+)/gu, (m, first: string, rest: string) => `Em${first.toLocaleLowerCase('pl')}${rest}`)
    .replace(M_BRANDS, (m, brand: string) => `Em${brand === 'PAY' ? 'pej' : brand.toLowerCase()}`)
    .replace(/(?<![\p{L}\d])PKO\s?(?:BP|Bp|bp)(?![\p{L}\d])/gu, 'Pe ka o be pe')
    .replace(SURNAME_RE, (m, name: string, ending?: string) => `${SURNAMES[name.toLowerCase()]}${(ending ?? '').toLowerCase()}`)

// ── Titles before a name: "prof.", "dr hab.", "gen. dyw.", "st. sierż. szt.", "ks." (titles-pl.ts) ──
// Said in full, in the case the sentence needs: "od prof. Kowalskiego" -> "od profesora Kowalskiego", "z mgr. inż. Nowakiem" -> "z magistrem inżynierem
// Nowakiem", "dla gen. dyw. Kukuły" -> "dla generała dywizji Kukuły". The case is the one the name after the title shows (Kowalskiego is the genitive,
// Kowalskiemu the dative, Nowakiem the instrumental); the word before the title settles what an ending leaves open ("od ... Nowaka"). A woman's name leaves the
// title as it is, in the nominative ("od prof. Anny Kowalskiej" is "od profesor Anny Kowalskiej"), as Polish does. Only before a capitalised word (a name), never
// before a digit or a lower-case word, and the words that stand after a title (hab., szt., pil.) only after one has begun.
interface TitleToken { kind: string; forms: readonly string[]; flags: string }
const TITLE_BY_KEY = new Map<string, TitleToken>()
// "n. med." -> "n med": the key has no dots, so a variant with and without a dot is the same title
const titleKey = (text: string) => text.toLocaleLowerCase('pl').replace(/\./g, ' ').replace(/\s+/g, ' ').trim()
const escapeRe = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
// A variant as a pattern: the first letter in either case ("Prof." at the start of a sentence) unless the title is only in lower case, a space is any white space
const titleVariant = (variant: string, lowerOnly: boolean) => variant.split(/\s+/).map((part, i) => {
  const first = part[0]
  const head = i === 0 && lowerOnly ? escapeRe(first) : first.toLocaleLowerCase('pl') === first.toLocaleUpperCase('pl') ? escapeRe(first) : `[${first.toLocaleLowerCase('pl')}${first.toLocaleUpperCase('pl')}]`
  return head + escapeRe(part.slice(1))
}).join('\\s*')
const TITLE_VARIANTS: Record<string, string[]> = { p: [], n: [], a: [], i: [] }
for (const [variants, kind, forms, flags] of TITLES) {
  for (const v of variants) {
    TITLE_BY_KEY.set(titleKey(v), { kind, forms, flags })
    TITLE_VARIANTS[kind].push(titleVariant(v, flags.includes('L')))
  }
}
const titleAlternatives = (kinds: string) => `(?:${kinds.split('').flatMap((k) => TITLE_VARIANTS[k]).sort((a, b) => b.length - a.length).join('|')})(?![\\p{L}\\d])`
const TITLE_PREFIX = titleAlternatives('p'), TITLE_HEAD = titleAlternatives('n'), TITLE_NEXT = titleAlternatives('nai')
const TITLE_CHAIN = new RegExp(String.raw`(?<![\p{L}\d])((?:${TITLE_PREFIX}\s+)*${TITLE_HEAD}(?:\s+${TITLE_NEXT})*)\s+(?=\p{Lu}\p{L}|\p{Lu}\.\s*\p{Lu})`, 'gu')
const TITLE_ANY = new RegExp(titleAlternatives('pnai'), 'y')
const FEMININE = new Set(FEMININE_NAMES.map((n) => n.toLocaleLowerCase('pl')))
const BIBLICAL = new Set(BIBLICAL_BOOKS.map((n) => n.toLocaleLowerCase('pl')))
const TITLE_CASES = { nom: 0, gen: 1, dat: 2, inst: 3, loc: 4 } as const
// A woman's name: a name from the list in any case ("Anna", "Anny", "Annie", "Annę", "Anną"; "Marii"), or a surname in -ska, -ckiej, -dzką
function feminineName(w: string): boolean {
  const l = w.replace(/\.$/, '').toLocaleLowerCase('pl')
  if (/(?:sk|ck|dzk)(?:a|iej|ą)$/u.test(l)) return true
  return [l, l.replace(/y$/u, 'a'), l.replace(/ii$/u, 'ia'), l.replace(/ię$/u, 'ia'), l.replace(/ią$/u, 'ia'), l.replace(/ie$/u, 'a'),
    l.replace(/[ęą]$/u, 'a')].some((c) => FEMININE.has(c))
}
const NOT_ENDINGS = /^(?:joachim|maksym|ibrahim|salim|kim|wim|tim|jim|hiacynt)$/u
const TITLE_GENITIVE_BEFORE = /(?:^|[\s(„"])(?:do|od|z|ze|bez|dla|u|wokół|obok|według|wg|zdaniem|spośród|wobec|oprócz|zamiast|wśród|sprzed|spod|podczas|ws|wypowiedź|wypowiedzi|komentarz|komentarza|opinia|opinii|słowa|słów|analiza|analizy|raport|raportu|rekomendacja|książka|książki|badania|badań|apel|apelu|list|listu|wizyta|wizyty|śmierć|śmierci|pogrzeb|pogrzebu|odejście|nominacja|nominacji|rezygnacja|rezygnacji|wykład|wykładu|wystąpienie|wystąpienia|oświadczenie|oświadczenia|stanowisko|stanowiska|zdanie|zdania|ocena|oceny|teza|tezy|pogląd|poglądu|wniosek|wniosku|decyzja|decyzji|wywiad|wywiadu|rozkaz|rozkazu|dowództwo|dowództwa|zastępca|zastępcy|następca|następcy|poprzednik|poprzednika)\s*$/iu
const TITLE_GENITIVE_ONLY = /(?:^|[\s(„"])(?:do|od|dla|u|bez|według|wg|zdaniem|obok|wobec|oprócz|zamiast|wśród|spośród|sprzed|spod|wokół)\s*$/iu
const TITLE_INSTRUMENTAL_BEFORE = /(?:^|[\s(„"])(?:z|ze|za|przed|nad|pod|między|poza)\s*$/iu
const TITLE_LOCATIVE_BEFORE = /(?:^|[\s(„"])(?:o|w|we|na|po|przy)\s*$/iu
// The case of the title: from the last word of the name, then from the word before the title
function titleCase(before: string, name: string[]): keyof typeof TITLE_CASES {
  const last = name[name.length - 1].replace(/\.$/, '').split('-').pop()!.toLocaleLowerCase('pl')
  if (name.some(feminineName)) return 'nom'
  if (/ego$/u.test(last)) return 'gen'
  if (/(?:emu|owi)$/u.test(last)) return 'dat'
  if (/[yi]m$/u.test(last) && !NOT_ENDINGS.test(last)) return TITLE_INSTRUMENTAL_BEFORE.test(before) ? 'inst' : TITLE_LOCATIVE_BEFORE.test(before) ? 'loc' : 'inst'
  if (/iem$/u.test(last) || /[^aeiouyąęó]em$/u.test(last)) return 'inst'
  if (/[^aeiouyąęó]u$/u.test(last) && TITLE_LOCATIVE_BEFORE.test(before)) return 'loc'
  if (/a$/u.test(last) && TITLE_GENITIVE_BEFORE.test(before)) return 'gen'
  // "dla gen. dyw. Kukuły": nothing in the ending, but after "dla", "od", "do" ... a name that is not a nominative adjective ("Kowalski") is in the genitive
  if (TITLE_GENITIVE_ONLY.test(before) && !/(?:sk|ck|dzk|[nń]sk)i$/u.test(last) && /[yi]$/u.test(last)) return 'gen'
  return 'nom'
}
const FIRE_SERVICE = /\bPSP\b|Straż\p{L}*\s+Pożarn|strażak|strażac|pożar/iu
export function sayTitles(text: string): string {
  return text.replace(TITLE_CHAIN, (m: string, chain: string, at: number, all: string) => {
    const tokens: { text: string; token: TitleToken; key: string }[] = []
    TITLE_ANY.lastIndex = 0
    for (let pos = 0; pos < chain.length;) {
      while (/\s/.test(chain[pos] ?? '')) pos++
      TITLE_ANY.lastIndex = pos
      const hit = TITLE_ANY.exec(chain)
      if (!hit) return m
      const key = titleKey(hit[0])
      const token = TITLE_BY_KEY.get(key)
      if (!token) return m
      tokens.push({ text: hit[0], token, key })
      pos += hit[0].length
    }
    const before = all.slice(0, at)
    // Never after a digit ("10 bryg. Kawalerii", "25 bp Rada"), and "z o. o." is a company
    if (/\d\s*$/.test(before)) return m
    const head = tokens.find((t) => t.token.kind === 'n')!
    const flags = head.token.flags
    const after = all.slice(at + m.length)
    // The name: up to three capitalised words, an initial with its dot ("J. Nowak"); a full stop after a word ends the sentence
    const name = after.match(/^(?:\p{Lu}\.|\p{Lu}[\p{L}'’-]+)(?:\s+(?:\p{Lu}\.|\p{Lu}[\p{L}'’-]+)){0,2}/u)?.[0].split(/\s+/) ?? []
    if (name.length === 0) return m
    if (flags.includes('O') && (/(?:^|[\s.])o\.\s*$/iu.test(before) || tokens.some((t, i) => i > 0 && t.key === 'o'))) return m
    if (flags.includes('B') && (BIBLICAL.has(name[0].toLocaleLowerCase('pl')) || /(?:sk|ck|dzk)ie$/u.test(name[0]))) return m
    if (flags.includes('Y') && /^\s*[(,]?\s*(?:\(?(?:19|20)\d{2}|s\.|ss\.|art\.)/u.test(after.slice(name.join(' ').length))) return m
    if (flags.includes('M') && name.some(feminineName)) return m
    const kase = TITLE_CASES[titleCase(before, name)]
    // "gen. bryg." is "generał brygady" (an army general), but in the fire service (the same sentence says so) "generał brygadier" (a rank that declines)
    const fire = FIRE_SERVICE.test(`${before.match(/[^.;!?]*$/)![0]}${chain} ${after.match(/^[^.;!?]*/)![0]}`)
    const said = tokens.map((t, i) => {
      if (t.key === 'bryg' && tokens[i - 1]?.key === 'gen' && !fire) return 'brygady'
      return t.token.kind === 'i' ? t.token.forms[0] : t.token.forms[kase]
    }).join(' ')
    const upper = tokens[0].text[0] !== tokens[0].text[0].toLocaleLowerCase('pl')
    return `${upper ? said[0].toLocaleUpperCase('pl') + said.slice(1) : said} `
  })
}

// ── Pauses ──

// A colon after a word is said as the end of a sentence, a short pause: "Błaszczak: PiS składa" ->
// "Błaszczak. PiS składa", "Nowe ESPI: BUMECH SA: Umowa" -> "Nowe ESPI. Bumech spółka akcyjna. Umowa".
// A semicolon is a pause too (the text keeps it). A dash with spaces on both sides does the same: "Arabia Saudyjska - 12 osób zginęło" -> "Arabia Saudyjska. 12 osób
// zginęło". Not a range ("10 - 15 proc.", "2020 - 2022", "9 października - 11 października", "9:00 - 17:00"),
// not a hyphen in a word ("biało-czerwony") and not one with no space ("5-10").
const DASH = /(?<=(\S))\s+[-–—]\s+(\S)/gu
const RANGE_BEFORE = /\d\S*(?:\s+\p{L}+\.?){0,2}$/u
// Each pause also leaves a mark after its full stop. The text as one string ignores it (sayAloud), but sayAloudParts
// cuts there: the parts are said as separate utterances, so the voice stops and starts again, which is a longer
// pause than a full stop inside one utterance.
const PAUSE_MARK = '\u2063'
const markPauses = (text: string) =>
  text
    .replace(/(\S):(\s+|$)(\p{Ll})?/gu, (m, before: string, space: string, next?: string) => `${before}${before === '.' ? '' : '.'}${PAUSE_MARK}${space}${next ? next.toLocaleUpperCase('pl') : ''}`)
    .replace(DASH, (m: string, before: string, next: string, at: number, all: string) => {
      if (/\d/.test(next) && RANGE_BEFORE.test(all.slice(0, at))) return m
      return `${/[.!?…:;,]/.test(before) ? '' : '.'}${PAUSE_MARK} ${next.toLocaleUpperCase('pl')}`
    })
    // a semicolon keeps its place in the text and gets the same pause
    .replace(/;(\s+|$)/g, (m, space: string) => `;${PAUSE_MARK}${space}`)
export const sayPauses = (text: string) => markPauses(text).split(PAUSE_MARK).join('')
// Only the pauses, none of the rules above: for a text in English, which the rules of Polish would turn into Polish
export const sayPausedParts = (text: string): string[] => markPauses(text).split(PAUSE_MARK).map((s) => s.trim()).filter(Boolean)

// ── All of it ──

function sayMarked(text: string): string {
  let t = sayRoman(sayMonths(sayDayRanges(sayCountRanges(sayMonthSpans(sayMonthDays(sayYearRanges(sayYears(sayQuarters(sayCompounds(sayIssueNumbers(sayAddresses(sayDates(sayParticiples(sayProvisions(text)))))))))))))))
  t = sayTerritories(sayHours(sayDirections(sayInstitutions(sayCodes(t)))))
  for (const [re, said] of WORDS) t = t.replace(re, said)
  t = saySpelled(sayAsWords(sayTitles(sayEnglish(sayProperNames(sayMarkets(sayBrokers(t)))))))
  return markPauses(sayNumbers(sayNames(t)))
}

// The text as one string, pauses as full stops
export const sayAloud = (text: string): string => sayMarked(text).split(PAUSE_MARK).join('')

// The same text cut at its pauses: "Arabia Saudyjska - 12 osób" is ["Arabia Saudyjska.", "12 osób"]
export const sayAloudParts = (text: string): string[] => sayMarked(text).split(PAUSE_MARK).map((s) => s.trim()).filter(Boolean)
