// How text is said aloud, as a newsreader would: sayAloud. Speech voices read what is written,
// so the text is first put the way it is said: names in capitals as words, abbreviations, numbers
// with their units, quarters, years and Roman numerals in words, a pause after a colon.
//
// Names: voices spell out words in capitals that they do not know ("ARCHICOM" as A-R-C-H-…,
// "DI VOLIO" as "di V olio"), so company names in capitals are given to the voice as ordinary
// words ("Archicom", "Di Volio"). Short abbreviations stay in capitals and are spelled, as they
// should be (PKO, GPW, KGHM, CD); legal forms and a few titles are said in full.

const FORMS: [RegExp, string][] = [
  [/(?<!\p{L})S\.\s?K\.\s?A\.?(?!\p{L})/gu, 'spółka komandytowo-akcyjna'],
  [/(?<![\p{L}.])(?:S\.\s?A\.?|SA)(?!\p{L})/gu, 'spółka akcyjna'],
  [/(?<!\p{L})sp\.?\s?z\.?\s?o\.\s?o\.?(?!\p{L})/giu, 'spółka z ograniczoną odpowiedzialnością'],
  [/(?<!\p{L})sp\.\s?k\.(?!\p{L})/giu, 'spółka komandytowa'],
  [/(?<!\p{L})sp\.\s?j\.(?!\p{L})/giu, 'spółka jawna'],
  // "EQUNICO SE": after a name in capitals only, SE is a European company
  [/(?<=\p{Lu}{2}\s)SE(?!\p{L})/gu, 'spółka europejska'],
  // "Bp Ważny" (PAP): a bishop
  [/(?<!\p{L})Abp(?=\s\p{Lu})/gu, 'arcybiskup'],
  [/(?<!\p{L})Bp(?=\s\p{Lu})/gu, 'biskup'],
]

// Abbreviations of four letters and more that are spelled, not said as a word
const SPELLED = new Set(['FOMC', 'HICP', 'CPIF', 'MSCI', 'NYSE', 'OECD', 'IFRS', 'UOKIK'])
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

const UNITS: Record<string, [string, string, string, string]> = { // one, 2–4, 5+, a fraction
  'tys.': ['tysiąc', 'tysiące', 'tysięcy', 'tysiąca'],
  'mln': ['milion', 'miliony', 'milionów', 'miliona'],
  'mld': ['miliard', 'miliardy', 'miliardów', 'miliarda'],
  'bln': ['bilion', 'biliony', 'bilionów', 'biliona'],
  'pkt': ['punkt', 'punkty', 'punktów', 'punktu'],
  'pkt proc.': ['punkt procentowy', 'punkty procentowe', 'punktów procentowych', 'punktu procentowego'],
  'pb': ['punkt bazowy', 'punkty bazowe', 'punktów bazowych', 'punktu bazowego'],
  'proc.': ['procent', 'procent', 'procent', 'procent'],
  'godz.': ['godzina', 'godziny', 'godzin', 'godziny'],
  'zł': ['złoty', 'złote', 'złotych', 'złotego'],
  'USD': ['dolar', 'dolary', 'dolarów', 'dolara'],
  'EUR': ['euro', 'euro', 'euro', 'euro'],
  'CHF': ['frank', 'franki', 'franków', 'franka'],
  'GBP': ['funt', 'funty', 'funtów', 'funta'],
}
// After "mln", "tys."…: "5 mln zł" is "5 milionów złotych"
const OF_CURRENCY: Record<string, string> = { 'zł': 'złotych', 'USD': 'dolarów', 'EUR': 'euro', 'CHF': 'franków', 'GBP': 'funtów' }
const UNIT = /(\d+(?:,\d+)?)\s*(tys\.|godz\.|pkt\s?proc\.|p\.\s?p\.|proc\.|(?:mln|mld|bln|pkt|pb|zł|USD|EUR|CHF|GBP)(?!\p{L}))(\s+brk(?!\p{L}))?(?:\s+(zł|USD|EUR|CHF|GBP)(?!\p{L}))?/gu

// "-41,7 tys." -> "minus 41,7 tysiąca", "-2,1 mln brk" -> "minus 2,1 miliona baryłek", "5 mln zł" -> "5 milionów złotych"
export function sayNumbers(text: string): string {
  return text
    .replace(/(^|[\s(])-(?=\d)/g, '$1minus ')
    .replace(UNIT, (m: string, num: string, written: string, barrels: string | undefined, currency: string | undefined, at: number, all: string) => {
      const unit = /^p\.\s?p\.$/.test(written) ? 'pkt proc.' : written.replace(/\s+/g, ' ')
      const forms = UNITS[unit]
      const word = num.includes(',') ? forms[3] : plural(+num, forms[0], forms[1], forms[2])
      // "8 tys. Stopa…", or at the very end: the abbreviation's dot also ended the sentence
      const end = !currency && !barrels && unit.endsWith('.') && /^\s*($|\p{Lu})/u.test(all.slice(at + m.length))
      return `${num} ${word}${barrels ? ' baryłek' : ''}${currency ? ` ${OF_CURRENCY[currency]}` : ''}${end ? '.' : ''}`
    })
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
const ARTYKUL: Record<Kase, string> = { nom: 'artykuł', gen: 'artykułu', loc: 'artykule', inst: 'artykułem' }
// "w trybie art. 19 MAR" -> "w trybie artykułu dziewiętnastego MAR", "zgodnie z art. 17" -> "zgodnie z
// artykułem siedemnastym", "w art. 69" -> "w artykule sześćdziesiątym dziewiątym"
export function sayArticles(text: string): string {
  return text.replace(/(?<!\p{L})art\.\s?(\d{1,3})(?!\d)/gu, (m, num: string, at: number, all: string) => {
    const before = all.slice(0, at)
    const k: Kase = /(?:^|\s)(?:zgodnie|w związku|wraz|stosownie)\s+z\s*$/u.test(before) ? 'inst' : caseAfter(before)
    const n = +num
    return n >= 1 && n < 200 ? `${ARTYKUL[k]} ${ordinalUpTo199(n, k)}` : `${ARTYKUL[k]} ${num}`
  })
}

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
const NUMBERED = /^(?:lig|tur|wojn|miejsc|etap|faz|rund|instancj|stop[ni]|kadencj|sesj|edycj|transz|emisj|seri|częś|czytani|rat[aąęy]|klas|kategori|grup|filar|sektor|sezon|kongres|zjazd|zjeźdz|wiek|połow|generacj|wersj|poziom|rozdział|tom|dywizj|pułk|piętr|rzęd|rząd|rok|dzie[ńn]|dni|tydzie|tygod|lice|kwart|mecz|set|odsłon|akt|rozbi|pokoleni|świat|rzeczpospolit|rzeczypospolit)/u
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
  [/(?<!\p{L})NWZA(?!\p{L})/gu, 'Nadzwyczajne walne zgromadzenie akcjonariuszy'],
  [/(?<!\p{L})ZWZA(?!\p{L})/gu, 'Zwyczajne walne zgromadzenie akcjonariuszy'],
  [/(?<!\p{L})WZA(?!\p{L})/gu, 'Walne zgromadzenie akcjonariuszy'],
  [/(?<!\p{L})NWZ(?!\p{L})/gu, 'Nadzwyczajne walne zgromadzenie'],
  [/(?<!\p{L})ZWZ(?!\p{L})/gu, 'Zwyczajne walne zgromadzenie'],
  [/(?<!\p{L})ws\.(?=\s)/gu, 'w sprawie'],
  [/(?<!\p{L})m\.in\.(?=\s)/gu, 'między innymi'],
  [/(?<!\p{L})tj\.(?=\s)/gu, 'to jest'],
  [/(?<!\p{L})r\/r(?!\p{L})/gu, 'rok do roku'],
  [/(?<!\p{L})m\/m(?!\p{L})/gu, 'miesiąc do miesiąca'],
  [/(?<!\p{L})k\/k(?!\p{L})/gu, 'kwartał do kwartału'],
  [/(?<!\p{L})NewConnect(?!\p{L})/gu, 'New Connect'],
  [/(?<!\p{L})ust\.(?=\s*\d)/gu, 'ustęp'],
  [/(?<!\p{L})pkt\.?(?=\s*\d)/gu, 'punkt'],
]

// "DM" is a brokerage: "Trigon DM przedstawia" -> "Trigon dom maklerski przedstawia", "według DM BOŚ" ->
// "według domu maklerskiego BOŚ", "w DM" -> "w domu maklerskim"
const AFTER_GENITIVE = /(?:^|[\s(])(?:według|wg|od|z|ze|dla|do|u|zdaniem|analitycy|analityk|analityczka|ekonomiści|ekonomista|eksperci|ekspert|raport|raporcie|rekomendacja|rekomendacji|prognoza|prognozy)\s*$/iu
export const sayBrokers = (text: string) =>
  text.replace(/(?<![\p{L}\d])DM(?![\p{L}\d])/gu, (m, at: number, all: string) => {
    const before = all.slice(0, at)
    return AFTER_GENITIVE.test(before) ? 'domu maklerskiego' : /(?:^|\s)(?:w|we|o|przy)\s*$/iu.test(before) ? 'domu maklerskim' : 'dom maklerski'
  })

// Abbreviations said as words, not spelled ("rozporządzenia MAR" -> "mar", "dla PAP" -> "pap")
const AS_WORDS: Record<string, string> = { MAR: 'Mar', PAP: 'Pap', ZUS: 'Zus', GUS: 'Gus', NIK: 'Nik', MON: 'Mon', PIT: 'Pit', CIT: 'Cit', VAT: 'Wat' }
const AS_WORDS_RE = new RegExp(String.raw`(?<![\p{L}\d])(${Object.keys(AS_WORDS).join('|')})(?![\p{L}\d])`, 'gu')
export const sayAsWords = (text: string) => text.replace(AS_WORDS_RE, (m) => AS_WORDS[m])

// ── English: said the English way ──

// Letters as an English speaker names them, written for a Polish voice
const EN_LETTERS: Record<string, string> = {
  A: 'ej', B: 'bi', C: 'si', D: 'di', E: 'i', F: 'ef', G: 'dżi', H: 'ejcz', I: 'aj', J: 'dżej', K: 'kej', L: 'el', M: 'em',
  N: 'en', O: 'ou', P: 'pi', Q: 'kju', R: 'ar', S: 'es', T: 'ti', U: 'ju', V: 'wi', W: 'dablju', X: 'eks', Y: 'łaj', Z: 'zi',
}
// Abbreviations that are said in English in Polish too ("AI" is "ej aj", not "a i"); the rest is spelled the Polish way (PKB, NBP, USA)
const SPELLED_EN = ['AI', 'AGI', 'IT', 'CEO', 'CFO', 'COO', 'CTO', 'CIO', 'GPT', 'API', 'UX', 'VR', 'NFT', 'BBC', 'CNN', 'CNBC', 'IBM', 'AMD',
  'IPO', 'NFP', 'FDA']
// Names said in English, written for a Polish voice
const NAMES_EN: [RegExp, string][] = [
  [/(?<![\p{L}\d])USGS(?![\p{L}\d])/gu, 'Junajted Stejts Dżiolodżikal Serwej'],
  [/(?<![\p{L}\d])OpenAI(?![\p{L}\d])/gu, 'Open ej aj'],
  [/(?<![\p{L}\d])ChatGPT(?![\p{L}\d])/gu, 'Czat dżi pi ti'],
  [/(?<![\p{L}\d])PayU(?![\p{L}\d])/gu, 'Pej ju'],
  [/(?<![\p{L}\d])ISB[Nn]ews(?![\p{L}\d])/gu, 'i es be niuz'],
  [/(?<![\p{L}\d])Play2Chill(?![\p{L}\d])/gu, 'Plej tu czil'],
  [/(?<![\p{L}\d])PlayWay(?![\p{L}\d])/gu, 'Plej łej'],
  // English words in company names: "CREEPY JAR S.A." -> "Kripi Dżar spółka akcyjna"
  [/(?<![\p{L}\d])(?:CREEPY|Creepy)(?![\p{L}\d])/gu, 'Kripi'],
  [/(?<![\p{L}\d])(?:JAR|Jar)(?![\p{L}\d])/gu, 'Dżar'],
  // "Play" and "One" in names: "Play" -> "plej", "FaktorOne" -> "Faktor łan"
  [/(?<=\p{L})Play(?!\p{Ll})/gu, ' plej'],
  [/(?<!\p{L})Play(?!\p{Ll})/gu, 'Plej'],
  [/(?<=\p{Ll})One(?!\p{Ll})/gu, ' łan'],
  // "Pay" in names: "OPay" -> "O pej", "Google Pay" -> "Google pej", "PayPal" -> "PejPal"
  [/(?<=\p{L})Pay(?!\p{Ll})/gu, ' pej'],
  [/(?<!\p{L})Pay(?!\p{Ll})/gu, 'Pej'],
]
const SPELLED_EN_RE = new RegExp(String.raw`(?<![\p{L}\d])(${SPELLED_EN.join('|')})(?![\p{L}\d])`, 'gu')
export function sayEnglish(text: string): string {
  let t = text
  for (const [re, said] of NAMES_EN) t = t.replace(re, said)
  return t.replace(SPELLED_EN_RE, (m) => [...m].map((c) => EN_LETTERS[c]).join(' '))
}

// ── Markets ──

// Currency codes in a pair: "EUR/PLN" is "euro pe el en", "USD/PLN" "u es de pe el en"
const CURRENCIES = new Set(['PLN', 'EUR', 'USD', 'CHF', 'GBP', 'JPY', 'CZK', 'HUF', 'NOK', 'SEK', 'DKK', 'CAD', 'AUD', 'NZD', 'CNY', 'TRY', 'RON', 'RUB', 'UAH'])
const sayCurrency = (code: string) => (code === 'EUR' ? 'euro' : [...code].map((c) => PL_LETTERS[c]).join(' '))
// "WIG20" -> "wig 20", "mWIG40" -> "mwig 40" (a word, not spelled); "S&P 500" -> "es and pi 500";
// "na FX/FI" -> "na rynku walutowym i obligacji"
export function sayMarkets(text: string): string {
  return text
    .replace(/(?<![\p{L}\d])([ms]?)WIG(\d*)(?!\p{L})/gu, (m, pre: string, num: string) => `${pre}wig${num ? ` ${num}` : ''}`)
    .replace(/(?<![\p{L}\d])S&P(?:\s?(\d+))?(?![\p{L}\d])/gu, (m, num?: string) => `es and pi${num ? ` ${num}` : ''}`)
    .replace(/(?<!\p{L})([Nn][Aa]|[Ww])\s+FX\/FI(?!\p{L})/gu, '$1 rynku walutowym i obligacji')
    .replace(/(?<!\p{L})FX\/FI(?!\p{L})/gu, 'rynek walutowy i obligacji')
    .replace(/(?<![\p{L}\d])([A-Z]{3})\/([A-Z]{3})(?![\p{L}\d])/gu, (m, a: string, b: string) =>
      CURRENCIES.has(a) && CURRENCIES.has(b) ? `${sayCurrency(a)} ${sayCurrency(b)}` : m)
}

// ── Pauses ──

// A colon after a word is said as the end of a sentence, a short pause: "Błaszczak: PiS składa" ->
// "Błaszczak. PiS składa", "Nowe ESPI: BUMECH SA: Umowa" -> "Nowe ESPI. Bumech spółka akcyjna. Umowa"
export const sayPauses = (text: string) =>
  text.replace(/(\S):(\s+|$)(\p{Ll})?/gu, (m, before: string, space: string, next?: string) => `${before}.${space}${next ? next.toLocaleUpperCase('pl') : ''}`)

// ── All of it ──

export function sayAloud(text: string): string {
  let t = sayArticles(sayRoman(sayYears(sayQuarters(sayCompounds(text)))))
  for (const [re, said] of WORDS) t = t.replace(re, said)
  t = sayAsWords(sayEnglish(sayMarkets(sayBrokers(t))))
  return sayPauses(sayNumbers(sayNames(t)))
}
