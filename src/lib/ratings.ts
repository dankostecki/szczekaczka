// Analysts' ratings as Polish financial news writes them, in quotes: „kupuj”, „przeważaj” (Overweight), „neutralnie”, „lepiej niż rynek”
// (Outperform)… The translation model is told so (worker/translate.ts); where it still leaves the English word ("do Overweight") or
// translates it word for word ("do „ponad wagę”"), this puts it right, in the translation as the server receives it and in the ones
// already kept (the page, saved posts), as ordinals.ts does for "siódty".
//
// A rating is put right only where a rating stands: after "do", "z", "od" ("obniża rekomendację do „trzymaj” z „kupuj”"), after
// "podtrzymuje", "utrzymuje", "potwierdza", and after the nouns "rekomendacja", "ocena", "rating". The English words, the Polish ratings
// themselves and the word-for-word renderings of the weights there are always a rating; Polish words that also mean something else
// ("sprzedaż", "neutralny", "nadwaga", "wyższa waga") only in quotes or after those nouns ("doszło do sprzedaży", "stopy do neutralnej
// wysokości", "utrzymuje neutralny ton" stay as they are).

// The rating, then its other spellings: [always a rating there, a rating only in quotes or after "rekomendacja"]
const RATINGS: [rating: string, sure: string[], maybe: string[]][] = [
  ['zdecydowanie kupuj', ['strong buy', 'strong-buy'], ['silne kupuj', 'silny zakup', 'mocne kupuj', 'zdecydowanie kupuj', 'zdecydowane kupno']],
  ['zdecydowanie sprzedaj', ['strong sell', 'strong-sell'], ['silne sprzedaj', 'zdecydowanie sprzedaj', 'zdecydowana sprzedaż']],
  ['spekulacyjnie kupuj', ['speculative buy'], ['spekulacyjnie kupuj', 'spekulacyjne kupno']],
  ['przeważaj', ['overweight', 'over-weight', 'ponad wagę', 'ponad wagi', 'powyżej wagi', 'przeważoną', 'przeważonej', 'przeważaj'],
    ['nadwaga', 'nadwagę', 'nadwagi', 'przeważenie', 'przeważenia', 'przeważony', 'przeważona', 'przeważać', 'zwiększoną wagę', 'zwiększonej wagi', 'wyższą wagę', 'wyższej wagi']],
  ['niedoważaj', ['underweight', 'under-weight', 'poniżej wagi', 'niedoważoną', 'niedoważonej', 'niedoważaj'],
    ['niedowaga', 'niedowagę', 'niedowagi', 'niedoważenie', 'niedoważenia', 'niedoważony', 'niedoważona', 'niedoważać', 'zmniejszoną wagę', 'zmniejszonej wagi', 'niższą wagę', 'niższej wagi']],
  ['neutralnie', ['equal-weight', 'equal weight', 'equalweight', 'market weight', 'market-weight', 'sector weight', 'sector-weight', 'neutral', 'równą wagę', 'równej wagi', 'wagę rynkową', 'wagi rynkowej', 'neutralnie'],
    ['neutralny', 'neutralna', 'neutralną', 'neutralne', 'neutralnej', 'neutralnego', 'równa waga', 'waga rynkowa']],
  ['lepiej niż sektor', ['sector outperform'], ['lepiej niż sektor', 'lepiej od sektora']],
  ['gorzej niż sektor', ['sector underperform'], ['gorzej niż sektor', 'gorzej od sektora']],
  ['zgodnie z sektorem', ['sector perform', 'peer perform'], ['zgodnie z sektorem']],
  ['lepiej niż rynek', ['market outperform', 'outperform', 'lepiej od rynku', 'lepiej niż rynek'],
    ['lepszy od rynku', 'lepsze od rynku', 'lepszy niż rynek', 'przewyższaj', 'przewyższać', 'ponadprzeciętnie']],
  ['gorzej niż rynek', ['market underperform', 'underperform', 'gorzej od rynku', 'gorzej niż rynek'],
    ['gorszy od rynku', 'gorsze od rynku', 'słabiej od rynku', 'słabiej niż rynek', 'poniżej rynku']],
  ['zgodnie z rynkiem', ['market perform', 'in-line', 'in line', 'inline', 'zgodnie z rynkiem'], ['na równi z rynkiem', 'w linii z rynkiem']],
  ['akumuluj', ['accumulate', 'akumuluj'], ['akumulacja', 'akumulować', 'gromadź']],
  ['redukuj', ['reduce', 'redukuj'], ['redukcja', 'redukować', 'zmniejsz']],
  ['kupuj', ['buy', 'kupuj'], ['kupno', 'kup', 'kupić', 'kupować']],
  ['trzymaj', ['hold', 'trzymaj'], ['trzymanie', 'trzymać', 'utrzymuj', 'utrzymać']],
  ['sprzedaj', ['sell', 'sprzedaj'], ['sprzedaż', 'sprzedać', 'sprzedawaj']],
]

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/[\s-]+/g, '[\\s-]+')
const SPELLINGS = RATINGS.flatMap(([rating, sure, maybe]) => [...sure.map((s) => ({ s, rating, sure: true })), ...maybe.map((s) => ({ s, rating, sure: false }))])
  .sort((a, b) => b.s.length - a.s.length) // the longest first: "strong buy" before "buy", "market outperform" before "outperform"
const BY_SPELLING = new Map(SPELLINGS.map((x) => [x.s.replace(/[\s-]+/g, ' ').toLowerCase(), x]))

// Where a rating stands: "do"/"z"/"od" or a verb that keeps it, or a noun that names it (the second group); then the rating, in quotes or not
const PLACE = String.raw`(?<![\p{L}\p{N}])(?:(do|z|od|(?:podtrzym|utrzym|potwierdz)\p{L}*)|(rekomendacj(?:a|ę|ą|i|e)|ocen(?:a|ę|ą|y|ie)|rating(?:u|iem)?))\s+`
const RE = new RegExp(`${PLACE}([„"“”'‚]?)(${SPELLINGS.map((x) => esc(x.s)).join('|')})([”"“'’]?)(?![\\p{L}\\p{N}])`, 'giu')

export const fixRatings = (text: string): string =>
  text.replace(RE, (all, _place: string | undefined, named: string | undefined, open: string, word: string, close: string) => {
    const found = BY_SPELLING.get(word.replace(/[\s-]+/g, ' ').toLowerCase())
    if (!found) return all
    if (!found.sure && !named && !(open && close)) return all // a Polish word that can mean something else, not quoted, after "do"/"z"/"od"
    return `${all.slice(0, all.length - open.length - word.length - close.length)}„${found.rating}”`
  })
