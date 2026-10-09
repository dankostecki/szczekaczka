// How names are said aloud. Speech voices spell out words in capitals that they do not know
// ("ARCHICOM" as A-R-C-H-…, "DI VOLIO" as "di V olio"), so company names in capitals are given
// to the voice as ordinary words ("Archicom", "Di Volio"). Short abbreviations stay in capitals
// and are spelled, as they should be (PKO, GPW, KGHM, CD); legal forms and a few titles are said in full.

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
