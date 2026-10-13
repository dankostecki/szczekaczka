// "dot." is "dotyczący", and a participle agrees with the noun before it in gender, number and case: "ustawę dot. reklamy aptek" is "ustawę dotyczącą reklamy aptek",
// "projekt ustawy dot." is "projekt ustawy dotyczącej", "rozporządzeniem dot." "rozporządzeniem dotyczącym". say.ts (sayParticiples) puts the form in.
//
// The noun is the word before the abbreviation, past a number of a document, a date, an acronym or a name with a capital letter ("Decyzja Prezesa UOKiK dot."
// is "Decyzja Prezesa UOKiK dotycząca"). Its gender comes from the table of the nouns that news and reports put it after (stems: the first one with the ending of the
// nominative is the word itself, the others are the stems that change in the other cases: "umowie", "umów"); a noun that is not there is judged by its ending.
// Where an ending leaves two readings (the "-y" of a genitive singular and of a plural, the "-u" of a genitive and of a locative) the word before the noun decides.
// With no noun before it (at the start of a sentence, after a colon or a dash, after a conjunction) it is the verb "dotyczy".

type Gender = 'f' | 'm' | 'n'

// Feminine nouns in -a ("ustaw" for "ustawa")
const FEMININE = ['ustaw', 'umow|umów', 'uchwał|uchwal', 'decyzj', 'spraw', 'informacj', 'procedur|procedurz', 'kwesti', 'regulacj', 'zmian', 'nowelizacj', 'dyrektyw', 'opini',
  'analiz', 'kontrol', 'inwestycj', 'transakcj', 'emisj', 'ofert|oferc', 'pożyczk|pożycz|pożyczek', 'gwarancj', 'skarg|skard|skarż', 'apelacj', 'rekomendacj', 'deklaracj',
  'interpelacj', 'inicjatyw', 'propozycj', 'polityk|polityc', 'strategi', 'reform', 'akcj', 'kampani', 'rezolucj', 'petycj', 'konwencj', 'koncesj', 'licencj', 'dotacj',
  'subwencj', 'taryf', 'opłat', 'grzywn', 'sankcj', 'wypłat', 'dywidend', 'fuzj', 'ugod', 'zasad', 'norm', 'metod', 'praktyk', 'prośb', 'kwot', 'dostaw', 'usług', 'cen',
  'stawk', 'firm', 'spółk|spółc|spółek', 'grup', 'sesj', 'nominacj', 'dymisj', 'rezygnacj', 'kart', 'list']
// Masculine nouns of things: the nominative, then the stems of the other cases
const MASCULINE = ['projekt|projekc', 'wniosek|wniosk', 'komunikat|komunikac', 'raport|raporc', 'wyrok', 'spór|spor', 'przepis', 'podatek|podatk', 'kontrakt|kontrakc', 'program', 'plan',
  'zakaz', 'nakaz', 'obowiązek|obowiązk', 'termin', 'pozew|pozw', 'dokument', 'aneks', 'apel', 'wynik', 'pakiet', 'kredyt', 'limit', 'rachunek|rachunk', 'mechanizm', 'proces',
  'system', 'akt', 'postulat', 'dekret', 'kodeks', 'regulamin', 'statut', 'harmonogram', 'budżet', 'audyt', 'przetarg', 'konkurs', 'test', 'mandat', 'spis', 'rejestr', 'tekst',
  'artykuł|artykul', 'paragraf', 'ustęp', 'punkt', 'etap', 'zapis', 'protokół|protokol', 'sąd', 'urząd', 'prospekt', 'problem', 'temat', 'zwrot', 'przekaz', 'transfer', 'zakup',
  'wzrost', 'spadek|spadk', 'odpis', 'zysk', 'koszt', 'wydatek|wydatk', 'przychód|przychod', 'dług', 'zakład', 'przypadek|przypadk', 'warunek|warunk', 'wymóg|wymog',
  'sposób|sposob', 'skład', 'zarząd', 'kurs', 'handel|handl', 'obrót|obrot', 'import', 'eksport', 'rynek|rynk', 'sektor', 'przegląd']
// Neuter nouns in -ie, -e, -o: the stem without the ending
const NEUTER = ['rozporządzeni', 'zawiadomieni', 'postępowani', 'porozumieni', 'zarządzeni', 'ogłoszeni', 'oświadczeni', 'stanowisk', 'zobowiązani', 'zabezpieczeni', 'zdarzeni',
  'pytani', 'sprawozdani', 'zgłoszeni', 'wezwani', 'orzeczeni', 'zaleceni', 'uzgodnieni', 'wydarzeni', 'dochodzeni', 'śledztw', 'praw', 'zezwoleni', 'pism', 'rozwiązani',
  'zadani', 'świadczeni', 'uprawnieni', 'powiadomieni', 'obwieszczeni', 'postanowieni', 'zgromadzeni', 'spotkani', 'zleceni', 'wynagrodzeni', 'ubezpieczeni', 'wsparci',
  'finansowani', 'dofinansowani', 'przedsięwzięci', 'przejęci', 'połączeni', 'podwyższeni', 'umorzeni', 'zbyci', 'nabyci', 'przyjęci', 'zawarci', 'wypowiedzeni', 'zmniejszeni',
  'zwiększeni', 'obniżeni', 'wydani', 'wyjaśnieni', 'stwierdzeni', 'zdani', 'miejsc', 'zagadnieni', 'opracowani']

// stem -> gender, and whether it is the first stem of its entry
const NOUNS = new Map<string, [Gender, boolean]>()
for (const [gender, entries] of [['f', FEMININE], ['m', MASCULINE], ['n', NEUTER]] as const) {
  for (const entry of entries) entry.split('|').forEach((stem, i) => { if (!NOUNS.has(stem)) NOUNS.set(stem, [gender, i === 0]) })
}
// the longest stems first, so that a short stem is not taken for the start of a longer noun
const STEMS = [...NOUNS.keys()].sort((a, b) => b.length - a.length)
// What can stand after a stem: anything else is another word ("ustawowy", "planowanie")
const ENDINGS: Record<Gender, RegExp> = {
  f: /^(?:|a|y|i|ie|e|ę|ą|ze|ce|dze|rze|le|ji|ii|ją|ię|ią|ach|ami|om|ów|ek)$/,
  m: /^(?:|u|a|owi|em|iem|y|i|e|ie|ów|om|ami|ach|ku|kiem)$/,
  n: /^(?:ie|e|o|ia|a|iu|u|iem|em|ń|iom|om|iami|ami|iach|ach|ień)$/,
}

// The gender of a noun of the table and whether the word is its nominative singular
function findNoun(word: string): { gender: Gender; nominative: boolean } | undefined {
  for (const stem of STEMS) {
    if (!word.startsWith(stem) || word.length > stem.length + 4) continue
    const [gender, first] = NOUNS.get(stem)!
    const ending = word.slice(stem.length)
    if (ENDINGS[gender].test(ending)) return { gender, nominative: first && (gender === 'm' ? ending === '' : gender === 'f' ? ending === 'a' : /^(?:ie|e|o)$/.test(ending)) }
  }
  return undefined
}

const LOCATIVE = new Set(['w', 'we', 'na', 'o', 'po', 'przy'])
// words that are no nouns: a conjunction, a verb that a report puts before "dot."
const NOT_NOUNS = new Set(['i', 'oraz', 'lub', 'albo', 'a', 'ale', 'że', 'który', 'która', 'które', 'gdy', 'bo', 'czy', 'to', 'jest', 'są', 'się', 'nie', 'też', 'także', 'również', 'tylko', 'już',
  'informuje', 'informują', 'przekazuje', 'zawiadamia', 'wyjaśnia', 'podaje', 'dodaje', 'zaznacza', 'podkreśla', 'uważa', 'twierdzi'])
// words that stand before a plural noun (the nominative or the accusative of things): numerals, "te", "wszystkie", adjectives in -e
const PLURAL_BEFORE = /^(?:dwa|dwie|trzy|cztery|kilka|kilkanaście|kilkadziesiąt|wiele|oba|obie|te|tamte|wszystkie|inne|takie|jakieś|żadne|\p{L}*(?:ne|kie|ste|owe|ane|one))$/u
// a verb in the past tense before the noun: the noun is its object ("Senat poparł ustawy")
const VERB_BEFORE = /^\p{L}{3,}(?:ł|ła|ło|li|ły|ono|ano|eno|uje|ują)$/u
const NOUNS_IN_L = /^(?:kapitał|materiał|sygnał|finał|ideał|kanał|dział|udział|zakład|skład|wkład|wydział|oddział|zapał|artykuł|protokół)$/u
const MASCULINE_IN_N = /^(?:dzień|tydzień|wrzesień|styczeń|kwiecień|koń|pień|ekran|plan)$/u
const MONTHS = /^(?:stycznia|lutego|marca|kwietnia|maja|czerwca|lipca|sierpnia|września|października|listopada|grudnia)$/u

// The form of "dotyczący" that goes with the noun, undefined where the word is no noun. `before` is the word before the noun, `skipped` tells that a number or a date
// stands between the noun and the abbreviation (what stands there is then often an adjective: "Raport bieżący nr 5/2026").
function participle(noun: string, before: string | undefined, skipped: boolean): string | undefined {
  const w = noun.toLocaleLowerCase('pl')
  if (NOT_NOUNS.has(w)) return undefined
  const prev = before?.toLocaleLowerCase('pl') ?? ''
  // the word is the subject at the start of a sentence ("Umowy dot. dostaw"): the nominative, so the plural for an ending that is a genitive singular too
  const subject = before === undefined || /[.!?:;]$/.test(before)
  const plural = subject || PLURAL_BEFORE.test(prev) || (VERB_BEFORE.test(prev) && !NOUNS_IN_L.test(prev))
  const locative = LOCATIVE.has(prev)
  const found = findNoun(w)
  // the cases that the ending shows whatever the gender
  if (/ami$/.test(w)) return 'dotyczącymi'
  if (/(?:ach|ów)$/.test(w) || (/ń$/.test(w) && !MASCULINE_IN_N.test(w))) return 'dotyczących'
  if (/om$/.test(w) && w.length > 4) return 'dotyczącym'
  if (/owi$/.test(w)) return 'dotyczącemu'
  if (/[ęą]$/.test(w)) return 'dotyczącą'
  if (/(?:em|iem)$/.test(w) && !found?.nominative) return 'dotyczącym'
  // an adjective before the noun and a number ("Raport bieżący nr 5/2026 dot."): the ending of the adjective
  if (!found) {
    if (/(?:ego|iego)$/.test(w)) return 'dotyczącego'
    if (/(?:emu|iemu)$/.test(w)) return 'dotyczącemu'
    if (/(?:ej|iej)$/.test(w)) return 'dotyczącej'
    if (/(?:ych|ich)$/.test(w)) return 'dotyczących'
    if (/(?:ymi|imi)$/.test(w)) return 'dotyczącymi'
    if (/(?:ym|im)$/.test(w) && w.length > 4) return 'dotyczącym'
    if (/(?:ący|ski|cki|dzki|zki|szy)$/.test(w) || (skipped && /(?:owy|ewy|ny|ły)$/.test(w))) return 'dotyczący'
  }
  // a noun in -ść: the nominative and the accusative, then the other cases of the singular
  if (/ść$/.test(w)) return 'dotycząca'
  if (/ści$/.test(w)) return plural ? 'dotyczące' : 'dotyczącej'
  switch (found?.gender) {
    case 'f':
      if (/a$/.test(w)) return 'dotycząca'
      if (/[yi]$/.test(w) && !/(?:ie|ce|ze|rze)$/.test(w)) return plural ? 'dotyczące' : 'dotyczącej'
      if (/e$/.test(w)) return 'dotyczącej'
      return 'dotyczących'
    case 'm':
      if (found.nominative || !/[aeiouyąęó]$/.test(w)) return 'dotyczący'
      if (/u$/.test(w)) return locative ? 'dotyczącym' : 'dotyczącego'
      if (/[yi]$/.test(w)) return 'dotyczące'
      if (/a$/.test(w)) return 'dotyczącego'
      return /e$/.test(w) ? 'dotyczącym' : 'dotyczący'
    case 'n':
      if (found.nominative) return 'dotyczące'
      if (/a$/.test(w)) return plural ? 'dotyczące' : 'dotyczącego'
      if (/u$/.test(w)) return locative ? 'dotyczącym' : 'dotyczącemu'
      return /[eo]$/.test(w) ? 'dotyczące' : 'dotyczących'
  }
  // a noun that is not in the table: by its ending
  if (/[nc]ie$/.test(w)) return 'dotyczące'
  if (/ie$/.test(w)) return 'dotyczącej'
  if (/[nc]ia$/.test(w) && !/^(?:opinia|kolonia)$/.test(w)) return plural ? 'dotyczące' : 'dotyczącego'
  if (/a$/.test(w)) return 'dotycząca'
  if (/[yi]$/.test(w)) return plural ? 'dotyczące' : 'dotyczącej'
  if (/u$/.test(w)) return locative ? 'dotyczącym' : 'dotyczącego'
  if (/[eo]$/.test(w)) return 'dotyczące'
  return /[bcćdfghjklłmnńprsśtwzźż]$/.test(w) && w.length > 2 ? 'dotyczący' : undefined
}

// The noun that the abbreviation goes with: the last word before it that is not a number of a document, a date, an acronym or a name. Undefined where a sentence or a
// clause ended before it (a full stop, a colon, a dash).
function nounBefore(before: string): { noun: string; before: string | undefined; skipped: boolean } | undefined {
  const tokens = before.trimEnd().split(/\s+/).slice(-9)
  if (!tokens[0]) return undefined
  let skipped = false
  for (let i = tokens.length - 1; i >= 0; i--) {
    const raw = tokens[i].replace(/,$/, '')
    if (/^[-–—]$|[.!?:;]$/.test(raw) && !/^(?:nr|r|zm|poz|art|ust|pkt|lit|tj|tzw|np|ww)\.$/iu.test(raw)) return undefined
    // "nr 5/2026", "z dnia 12 października 2026 r.": the words of a date or of a number of a document
    if (!raw || /^(?:nr|numer|r\.|roku|rok|dnia|z|ze|poz\.)$/iu.test(raw) || /^[\d/.\-–]+$/u.test(raw) || MONTHS.test(raw.toLocaleLowerCase('pl'))) { skipped = true; continue }
    const clean = raw.replace(/^[„"(]+|[”")]+$/gu, '')
    if (!/^\p{L}[\p{L}-]*$/u.test(clean)) return undefined
    // an acronym ("UOKiK") and a name with a capital letter inside a sentence are skipped; a capital at the start of a sentence is the noun itself
    const startsSentence = i === 0 || /[.!?:;]$/.test(tokens[i - 1])
    if (/\p{Lu}.*\p{Lu}/u.test(clean) || (/^\p{Lu}/u.test(clean) && !startsSentence)) continue
    return { noun: clean, before: i > 0 ? tokens[i - 1].replace(/,$/, '') : undefined, skipped }
  }
  return undefined
}

// "dot." and a space, then a word, a number, a quotation mark or a bracket ("dot.com" and a "dot." at the very end stay)
const ABBREVIATION = /(?<![\p{L}\d])([Dd])ot\.(?=\s+[\p{L}\d„"(])/gu
export const sayParticiples = (text: string) =>
  text.replace(ABBREVIATION, (m: string, first: string, at: number, all: string) => {
    const found = nounBefore(all.slice(Math.max(0, at - 160), at))
    const form = (found && participle(found.noun, found.before, found.skipped)) ?? 'dotyczy'
    return first === 'D' ? form[0].toLocaleUpperCase('pl') + form.slice(1) : form
  })
