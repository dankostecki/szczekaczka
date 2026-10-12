// The language of one news item. The channels are Polish, but a press release in them may be in English ("Innomotics
// Receives Prestigious EcoVadis Silver Medal"): that one is read with the English voice and none of the Polish rules
// of say.ts (numbers, abbreviations, cases), which would turn it into Polish.
import { langOf, type Lang } from './sources'

// The words English has and Polish does not: function words and the verbs and nouns of a press release. A word that is
// Polish too is not here (on, by, we, to, do, a, data, bank, rating, start, system…).
const ENGLISH = new Set(`the of and in for with at from is are was were be been being has have had will would can could should may might its their
  our your his her this that these those as an it they you she not but or if than then into over under after before about against between through
  during per via among across more most also which who whom whose what when where how all any both each other such only own same so too very just
  announces announced announce receives received receive reports reported results quarter quarterly year years company companies group global
  globally worldwide first top award awards awarded medal silver gold bronze assessment assessments places named wins win signs signed agreement
  partnership partners acquires acquired acquisition launches launched launch expands expansion completes completed secures secured appoints
  appointed rated ranked ranking sustainability sustainable customers customer solutions services products market markets growth revenue sales
  profit earnings shares board million billion percent record strong positive leading leader including continues plans expects expected offers
  provides delivers invests investment investments increase increased decline rises falls reaches hits gains loses deal deals orders contract
  contracts project projects energy technology technologies industry industrial manufacturing development health healthcare financial finance
  fund funds raises raise cuts lifts forecast outlook guidance chief executive officer president director names joins opens closes sets
  prestigious recognized recognised achieves achieved commitment responsible supply chain climate performance employees people world`.split(/\s+/))
// Polish function words and frequent words; one of them and the text is Polish
const POLISH = new Set(`w z ze na od po za i że się nie jest są był była było były oraz lub czy jak dla przez przy bez ale który która które których
  tego tym tej ich jego jej ma mają będzie zostało spółka spółki spółce zarząd akcji akcje proc mln mld zł roku rok kw wyniki wyniosły umowa umowę
  podpisała podpisał dane dzień nowy nowa nowe firma firmy według również także jako jeszcze tylko już gdy lecz więc ponieważ podczas wobec`.split(/\s+/))
// Endings only English has ("prestigious", "globally", "partnership", "sustainability")
const ENGLISH_ENDING = /^(?:\p{L}{3,}(?:tions?|ous|ful|ness|ships?|ities|ized|ised)|\p{L}{4,}ly)$/u

// A text is English when it has no Polish letter and no Polish function word, and enough English ones: three, or two in a short text
export function isEnglish(text: string): boolean {
  if (/[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/.test(text)) return false
  const words = text.match(/\p{L}+/gu) ?? []
  let english = 0
  words.forEach((word, i) => {
    // a Polish word in lower case, or at the start of the text ("W środę…"); the "I" of "U.S. Treasury" or "I" alone is not one
    if (POLISH.has(word.toLocaleLowerCase('pl')) && word !== 'I' && (word === word.toLocaleLowerCase('pl') || i === 0)) english = -Infinity
    const w = word.toLocaleLowerCase('en')
    if (ENGLISH.has(w) || ENGLISH_ENDING.test(w)) english++
  })
  return english >= 3 || (english >= 2 && words.length <= 12)
}

const cache = new WeakMap<object, Lang>()
// The title decides, and the lead when the title is too short or too plain to tell. A channel in English (feed.lang) is English whatever the text
export function itemLang(it: { source: string; label: string; title: string; description?: string }): Lang {
  if (langOf(it.source, it.label) === 'en') return 'en'
  if (it.source === 'MACRONEXT') return 'pl'
  const known = cache.get(it)
  if (known) return known
  const lang: Lang = isEnglish(it.title) || isEnglish(`${it.title}. ${(it.description ?? '').slice(0, 300)}`) ? 'en' : 'pl'
  cache.set(it, lang)
  return lang
}
