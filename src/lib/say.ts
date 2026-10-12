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

const UNITS: Record<string, [string, string, string, string]> = { // one, 2–4, 5+, a fraction
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
  'zł': ['złoty', 'złote', 'złotych', 'złotego'],
  'USD': ['dolar', 'dolary', 'dolarów', 'dolara'],
  'EUR': ['euro', 'euro', 'euro', 'euro'],
  'CHF': ['frank', 'franki', 'franków', 'franka'],
  'GBP': ['funt', 'funty', 'funtów', 'funta'],
}
// After "mln", "tys."…: "5 mln zł" is "5 milionów złotych"
const OF_CURRENCY: Record<string, string> = { 'zł': 'złotych', 'USD': 'dolarów', 'EUR': 'euro', 'CHF': 'franków', 'GBP': 'funtów' }
// "pkt proc.", "pkt. proc." (a dot after "pkt" too, and none at the end) and "p.p." are the percentage points; "pkt. procentowych"
// has the dot of "pkt." to drop
const UNIT = /(?<!\d)(\d{1,3}(?:[ \u00a0]\d{3})+(?:,\d+)?|\d+(?:,\d+)?)\s*(tys\.|godz\.|pkt\.?\s?proc(?:\.|(?!\p{L}))|p\.\s?p\.|proc\.|pkt\.(?=\s+procentow)|(?:m\s?kw|mkw)\.?(?!\p{L})|m²|m2(?![\p{L}\d])|(?:mln|mld|bln|pkt|pb|zł|USD|EUR|CHF|GBP)(?!\p{L}))(\s+brk(?!\p{L}))?(?:\s+(zł|USD|EUR|CHF|GBP)(?!\p{L}))?/gu
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
const GENITIVE_BEFORE = /(?:^|[\s(„"])(?:do|od|z|ze|bez|dla|u|wokół|obok|według|wg|spośród|wobec|powyżej|poniżej|zamiast|oprócz|wśród|sprzed|spod|brak|brakuje|brakowało|zabrakło|zabraknie|potrzeba|ciągu|czasie|okresie|przestrzeni|odstępie|wysokości|wartości|kwocie|poziomie|rzędu|okolicach|granicach)\s+(?:(?:około|ok\.|blisko|prawie|niemal|ponad|nawet|aż|zaledwie|ledwie|przynajmniej)\s+)*$/iu
// The word after a number: the nominative by the number ("2 miliony", "5 milionów"), the genitive for "do 2 milionów", "do 1 miliona"
const unitForm = (forms: readonly string[], n: number, genitive: boolean) =>
  genitive ? (n === 1 ? forms[3] : forms[2]) : plural(n, forms[0], forms[1], forms[2])
const GROSZE = ['grosz', 'grosze', 'groszy', 'grosza']

// What a price is "per": "zł/l" is "złotych za litr"
const PER_UNIT: Record<string, string> = { l: 'litr', kg: 'kilogram', t: 'tonę', szt: 'sztukę', bbl: 'baryłkę', MWh: 'megawatogodzinę', kWh: 'kilowatogodzinę',
  GJ: 'gigadżul', mkw: 'metr kwadratowy', m2: 'metr kwadratowy', 'm²': 'metr kwadratowy' }

// A number up to 999 in words, in the nominative or the genitive ("sześćset", "sześciuset"); a larger one stays in digits. A voice that
// reads "10 milionów 600 tysięcy" takes the genitive of "milionów" for the next number ("sześciuset"), so the parts are written out.
function numberWords(n: number, genitive: boolean): string {
  if (!(n > 0 && n < 1000)) return String(n)
  if (!genitive) return cardinal(n)
  const r = n % 100
  const tail = r < 10 ? [GEN_ONES[r]] : r < 20 ? [GEN_TEENS[r - 10]] : [GEN_TENS[Math.floor(r / 10)], GEN_ONES[r % 10]]
  const words = [GEN_HUNDREDS[Math.floor(n / 100)], ...tail].filter(Boolean).join(' ')
  // only a lone 1 is declined ("jednego miliona"); at the end of a longer number "jeden" stays ("do czterystu dziewięćdziesięciu jeden miliardów")
  return n > 1 ? words.replace(/ jednego$/, ' jeden') : words
}
// A number with no unit after it that says its gender ("jedna", "dwie" osoby): 1, 2 and the ones ending in them, except the teens
const hasGender = (n: number) => (n % 10 === 1 || n % 10 === 2) && (n % 100 < 11 || n % 100 > 19)
// Currencies that are masculine: "dwa złote", "jeden dolar" (not "euro")
const MASCULINE_CURRENCY = new Set(['zł', 'USD', 'CHF', 'GBP'])
// "10 mln 600 tys. zł", "5 tys. 200 zł": a number after another with its unit, and one that another follows
const CHAIN_BEFORE = /(?:(?<![\d,])\d+\s*(?:bln|mld|mln|tys\.)\s+)+$/u
const CHAIN_AFTER = /^\s+\d+\s*(?:bln|mld|mln|tys\.|zł|USD|EUR|CHF|GBP)(?![\p{L}\d])/u

// "-41,7 tys." -> "minus 41,7 tysiąca", "-2,1 mln brk" -> "minus 2,1 miliona baryłek", "5 mln zł" -> "5 milionów złotych",
// "5,483 mld zł" -> "5 miliardów 483 miliony złotych", "13 pkt. proc." -> "13 punktów procentowych" (but "13 proc." -> "13 procent")
export function sayNumbers(text: string): string {
  return text
    .replace(/(^|[\s(])-(?=\d)/g, '$1minus ')
    // "7,06 zł/l" -> "7,06 zł za litr", "70 USD/bbl" -> "70 USD za baryłkę"
    .replace(/(\d\s?(?:zł|USD|EUR|CHF|GBP))\/(l|kg|t|szt\.?|bbl|MWh|kWh|GJ|mkw|m2|m²)(?![\p{L}\d])/gu,
      (m: string, amount: string, per: string, at: number, all: string) =>
        `${amount} za ${PER_UNIT[per.replace(/\.$/, '')]}${per.endsWith('.') && endsSentence(all.slice(at + m.length)) ? '.' : ''}`)
    // "71,0 proc.", "4,00%", "5,0 mld zł": a decimal that is only zeros is the whole number
    .replace(/(?<![\d,.])(\d+),0+(?=\s?%(?![\p{L}\d])|\s*(?:tys\.|godz\.|pkt\s?proc\.|p\.\s?p\.|proc\.|(?:mln|mld|bln|pkt|pb|zł|USD|EUR|CHF|GBP)(?![\p{L}\d])))/gu, '$1')
    .replace(UNIT, (m: string, num: string, written: string, barrels: string | undefined, currency: string | undefined, at: number, all: string) => {
      const unit = /^p\.\s?p\.$|^pkt\.?\s?proc\.?$/.test(written) ? 'pkt proc.' : written === 'pkt.' ? 'pkt' : /^(?:m\s?kw\.?|m²|m2)$/.test(written) ? 'mkw' : written.replace(/\s+/g, ' ')
      const forms = UNITS[unit]
      const digits = num.replace(/[\s\u00a0]/g, '')
      // after "10 mln" the next number is in the case of the first one: the genitive context is the one before the whole chain
      const rest = all.slice(at + m.length)
      const chain = all.slice(Math.max(0, at - 120), at).match(CHAIN_BEFORE)
      const chainStart = at - (chain?.[0].length ?? 0)
      const genitive = GENITIVE_BEFORE.test(all.slice(Math.max(0, chainStart - 60), chainStart))
      // "2,5-3,5 mln zł": the first number of a range has no unit of its own, so the second keeps the fraction, as the first has it
      const inRange = /\d[-–]$/.test(all.slice(Math.max(0, at - 2), at))
      const end = !currency && !barrels && written.endsWith('.') && endsSentence(rest)
      // "7,06 zł" -> "7 złotych i 6 groszy", "0,45 zł" -> "45 groszy", "2,5 zł" -> "2 złote i 50 groszy": one or two decimals are groszy
      if (unit === 'zł' && !currency && !barrels && !inRange && /^\d+,\d{1,2}$/.test(digits)) {
        const [zloty, fraction] = digits.split(',')
        const grosze = +fraction.padEnd(2, '0')
        return [+zloty ? `${numberWords(+zloty, genitive)} ${unitForm(forms, +zloty, genitive)}` : '', `${numberWords(grosze, genitive)} ${unitForm(GROSZE, grosze, genitive)}`].filter(Boolean).join(' i ')
      }
      const parts = inRange ? undefined : splitUnits(digits, unit)
      if (parts) {
        // a number with a unit is in words; the last one with no unit only when it does not show a gender ("dwie osoby")
        const said = parts.map(([n, u]) => {
          const words = u || !hasGender(n) || (currency && MASCULINE_CURRENCY.has(currency)) ? numberWords(n, genitive) : String(n)
          return u ? `${words} ${unitForm(UNITS[u], n, genitive)}` : words
        }).join(' ')
        const [last, lastUnit] = parts[parts.length - 1]
        const money = currency ? ` ${lastUnit ? OF_CURRENCY[currency] : unitForm(UNITS[currency], last, genitive)}` : ''
        return `${said}${barrels ? ' baryłek' : ''}${money}${end ? '.' : ''}`
      }
      const word = digits.includes(',') ? forms[3] : unitForm(forms, +digits, genitive)
      // "10 mln 600 tys. zł": the numbers of such a chain are in words too, when the noun is masculine or the number shows no gender
      const spoken = (chain || CHAIN_AFTER.test(rest)) && /^\d+$/.test(digits) && (unit in NEXT_UNIT || MASCULINE_CURRENCY.has(unit) || !hasGender(+digits)) ? numberWords(+digits, genitive) : num
      return `${spoken} ${word}${barrels ? ' baryłek' : ''}${currency ? ` ${OF_CURRENCY[currency]}` : ''}${end ? '.' : ''}`
    })
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
const ARTYKUL: Record<Kase, string> = { nom: 'artykuł', gen: 'artykułu', loc: 'artykule', inst: 'artykułem' }
// "w trybie art. 19 MAR" -> "w trybie artykułu dziewiętnastego MAR", "zgodnie z art. 17" -> "zgodnie z
// artykułem siedemnastym", "w art. 69" -> "w artykule sześćdziesiątym dziewiątym"
export function sayArticles(text: string): string {
  return text.replace(/(?<!\p{L})[Aa]rt\.\s?(\d{1,3})(?!\d)/gu, (m, num: string, at: number, all: string) => {
    const before = all.slice(0, at)
    // "Art. 7 ust. 1 …" at the start of a sentence: nominative, with a capital
    const start = m[0] === 'A' && (!before.trim() || /[.!?:;]\s*$/.test(before))
    const k: Kase = start ? 'nom' : /(?:^|\s)(?:zgodnie|w związku|wraz|stosownie)\s+z\s*$/u.test(before) ? 'inst' : caseAfter(before)
    const n = +num
    const said = n >= 1 && n < 200 ? `${ARTYKUL[k]} ${ordinalUpTo199(n, k)}` : `${ARTYKUL[k]} ${num}`
    return start ? said[0].toLocaleUpperCase('pl') + said.slice(1) : said
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
  const month = (n: string, k: Kase) => MONTH_NAMES[k][roman(n) - 1]
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
const INSTITUTION_RE = new RegExp(String.raw`(?<![\p{L}\d]|\p{Ll}-)(?:([NZ]?)WZ(A?)|(${Object.keys(INSTITUTIONS).join('|')}))(?![\p{L}\d]|-\d|-\p{Ll})`, 'gu')
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
const NOM_BEFORE = /^(?:zwołuje|zwołują|zwołał[aoy]?|zwołać|zwołano|zwoła|zwołane|odwołuje|odwołują|odwołał[aoy]?|odwołać|odwołano|odwołane|odbędzie|odbyło|odbyły|odbywa|ogłasza|ogłosił[aoy]?|ogłoszono|się|jest|zostało|zostanie|będzie|było|planuje|zapowiada|przesuwa|przekłada|przenosi|zakończyło|rozpoczęło|zgłasza|kolejne|następne|najbliższe|coroczne|doroczne|przyszłe|ostatnie|pierwsze|drugie|trzecie|to|owe|takie|wspomniane|zaplanowane|planowane|przerwane|odroczone|a|ale|że|gdy|jeśli|ponieważ|bo|aby|żeby|gdyż|natomiast|podaje|podają|szacuje|szacują|prognozuje|wskazuje|informuje|ostrzega|ocenia|twierdzi|mówi|uważa|zakłada|sądzi|wylicza|oblicza|przewiduje|podkreśla|wyjaśnia|alarmuje|apeluje|radzi|zaleca|proponuje|sugeruje|pokazuje|wynika|stwierdza|podał|szacował|oszacował|prognozował|ostrzegał|informował|poinformował|twierdził|wskazał|powiedział|zapowiedział|podniósł|przewidział|przewidywał|rekomendował|przekazał|zrewidował)$/u
// …and the endings of such verbs (not "ał": "udział", "kapitał" are nouns)
const VERB_ENDING = /(?:uje|ują|ił|ył|iła|yła|iło|yło|ili|yli|ała|ało|ały)$/u
// What is "from" an institution, not "with" it
const FROM_NOUN = /^(?:fundusz\p{L}*|środk\p{L}*|dotacj\p{L}*|dofinansowan\p{L}*|pieniąd\p{L}*|pieniędz\p{L}*|dane|danych|komunikat\p{L}*|informacj\p{L}*|pism\p{L}*|decyzj\p{L}*|wytyczn\p{L}*|rozporządzen\p{L}*|import\p{L}*|eksport\p{L}*|dostaw\p{L}*|kraj\p{L}*|państw\p{L}*|wsparci\p{L}*|pożyczk\p{L}*|grant\p{L}*|płatnośc\p{L}*|wpływ\p{L}*|wypłat\p{L}*|transfer\p{L}*|pochodz\p{L}*|wynik\p{L}*|wyjści\p{L}*|wyjść|wyjdzie|wyjdą|wychodzi|wystąpien\p{L}*|wystąpić|wycofa\p{L}*)$/u
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
// Several in a row ("zwołanie WZ i NWZ") are in the same case
const LIST_BETWEEN = /^\s*(?:,|\s(?:i|oraz|lub|albo))\s*$/u
export function sayInstitutions(text: string): string {
  let last: { end: number; kase: InstCase } | null = null
  return text.replace(INSTITUTION_RE, (m, kind: string | undefined, shareholders: string | undefined, institution: string | undefined, at: number, all: string) => {
    if (institution === 'ON' && !FUEL_CONTEXT.test(all.slice(Math.max(0, at - 120), at + 120))) return m
    // "Pb95 podrożała o 45 groszy, ON o 1,50 zł": the diesel with a verb or "o 1,50" after it is the subject, whatever stands before it
    const subject = institution === 'ON' && !/(?:^|\s)(?:i|oraz|lub|albo)\s+$/iu.test(all.slice(0, at)) && /^\s+(?:o\s+\d|\p{L}+(?:ł|ła|ło|li|ły)(?![\p{L}])|wynosi|wynoszą|kosztuje|kosztują|jest|są)/u.test(all.slice(at + m.length))
    const kase: InstCase = subject ? 'nom' : last && LIST_BETWEEN.test(all.slice(last.end, at)) ? last.kase : caseBefore(all.slice(0, at), institution ? 'inst' : 'gen')
    last = { end: at + m.length, kase }
    if (institution) return INSTITUTIONS[institution][kase]
    const stem = kind === 'N' ? 'nadzwyczajn' : kind === 'Z' ? 'zwyczajn' : ''
    const said = `${stem ? `${stem}${MEETING_ENDING[kase]} ` : ''}${MEETING[kase]}${shareholders ? ' akcjonariuszy' : ''}`
    return said[0].toLocaleUpperCase('pl') + said.slice(1)
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
const SPELLED_PL = ['OECD']
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
const AS_WORDS: Record<string, string> = { MAR: 'Mar', PAP: 'Pap', ZUS: 'Zus', GUS: 'Gus', NIK: 'Nik', PIT: 'Pit', CIT: 'Cit', VAT: 'Wat', ASI: 'as i', BOŚ: 'Boś', FIZ: 'Fiz' }
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
  // "HUUUGE, INC." is "huge" (the stretched "uuu" is no matter), "Games" is "gejms": "Huuuge Games" -> "Hjudż Gejms"
  [/(?<![\p{L}\d])Hu{2,}ge(?![\p{L}\d])/giu, 'Hjudż'],
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
export function sayEnglish(text: string): string {
  let t = sayEnglishInNames(text)
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
export const sayProperNames = (text: string) =>
  text
    .replace(/(?<![\p{L}\d])m(\p{Lu})(\p{Ll}+)/gu, (m, first: string, rest: string) => `Em${first.toLocaleLowerCase('pl')}${rest}`)
    .replace(/(?<![\p{L}\d])MBANK(?![\p{L}\d])/gu, 'Embank') // the name in capitals, as a company is written in ESPI
    .replace(/(?<![\p{L}\d])PKO\s?(?:BP|Bp|bp)(?![\p{L}\d])/gu, 'Pe ka o be pe')
    .replace(SURNAME_RE, (m, name: string, ending?: string) => `${SURNAMES[name.toLowerCase()]}${(ending ?? '').toLowerCase()}`)

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
  let t = sayArticles(sayRoman(sayMonths(sayDayRanges(sayCountRanges(sayMonthDays(sayYearRanges(sayYears(sayQuarters(sayCompounds(sayIssueNumbers(sayAddresses(text))))))))))))
  t = sayTerritories(sayHours(sayDirections(sayInstitutions(t))))
  for (const [re, said] of WORDS) t = t.replace(re, said)
  t = saySpelled(sayAsWords(sayEnglish(sayProperNames(sayMarkets(sayBrokers(t))))))
  return markPauses(sayNumbers(sayNames(t)))
}

// The text as one string, pauses as full stops
export const sayAloud = (text: string): string => sayMarked(text).split(PAUSE_MARK).join('')

// The same text cut at its pauses: "Arabia Saudyjska - 12 osób" is ["Arabia Saudyjska.", "12 osób"]
export const sayAloudParts = (text: string): string[] => sayMarked(text).split(PAUSE_MARK).map((s) => s.trim()).filter(Boolean)
