// One story out of many headlines (lib/stories.ts), for the "Top" tab and the morning briefing: which links are one page, what the subject
// of a headline is, and which headlines are put together
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { groupStories, pageOf, subjectOf } from '../src/lib/stories'

const T = Date.parse('2026-11-12T15:00:00Z')
const MIN = 60_000
const titlesOf = (items: { title: string; link: string; time: number }[]) => groupStories(items).map((g) => g.map((k) => k.it.title).sort()).sort((a, b) => a[0].localeCompare(b[0]))

test('a link is its page: the same without "https://", "www.", the fragment and what says where the reader came from; a parameter that names the page stays', () => {
  // Stooq tells its news apart only by "?f=…"
  assert.notEqual(pageOf('https://stooq.pl/n/?f=1700001'), pageOf('https://stooq.pl/n/?f=1700002'))
  assert.equal(pageOf('https://stooq.pl/n/?f=1700001'), pageOf('http://www.stooq.pl/n?f=1700001#komentarze'))
  // Bankier's RSS adds where the reader came from
  assert.equal(pageOf('https://www.bankier.pl/wiadomosc/ORLEN-SA-41-2026-8901234.html?utm_source=RSS&utm_medium=RSS&utm_campaign=Komunikaty'),
    pageOf('https://www.bankier.pl/wiadomosc/ORLEN-SA-41-2026-8901234.html'))
  assert.equal(pageOf('https://seekingalpha.com/news/4512345-apple-beats?source=feed_news_all'), 'seekingalpha.com/news/4512345-apple-beats')
  assert.equal(pageOf('https://Example.NET/Article/?b=2&a=1&fbclid=xyz'), pageOf('https://example.net/Article?a=1&b=2'), 'the order of the parameters and the host\'s letters do not matter')
  assert.notEqual(pageOf('https://example.net/Article'), pageOf('https://example.net/article'), 'the path\'s letters do')
  assert.equal(pageOf('https://www.gpw.pl/komunikat?geru_id=123&title=X'), 'gpw.pl/komunikat?geru_id=123&title=X')
  assert.equal(pageOf(''), '')
})

test('news of one site whose links differ only after "?" are separate stories; the same page linked twice is one', () => {
  const stooq = [
    { title: 'Rosja: Putin zaproponował misję humanitarną w Konstantynówce na wschodzie Ukrainy', link: 'https://stooq.pl/n/?f=1700001', time: T },
    { title: 'Nikkei zyskuje 1,2 proc., jen najsłabszy od lipca', link: 'https://stooq.pl/n/?f=1700002', time: T - 180 * MIN },
    { title: 'Złoty umacnia się po decyzji Rady Polityki Pieniężnej', link: 'https://stooq.pl/n/?f=1700003', time: T - 300 * MIN },
  ]
  assert.equal(groupStories(stooq).length, 3)
  const twice = [
    { title: 'Orlen ogłasza przejęcie rafinerii', link: 'https://stooq.pl/n/?f=1', time: T },
    { title: 'Przejęcie rafinerii: komentarz analityków po komunikacie koncernu', link: 'https://www.stooq.pl/n/?f=1&utm_source=rss', time: T + 400 * MIN },
  ]
  assert.equal(groupStories(twice).length, 1)
})

test('the subject of a headline is not a country or what is a country\'s: an agency starts every dispatch with it', () => {
  for (const t of ['Rosja: Putin zaproponował misję humanitarną', 'Ukraina: nocny atak dronów na Kijów', 'Iran: rozmowy w Genewie przerwane', 'Francja: rząd przetrwał wotum nieufności',
    'RUSSIAN OIL EXPORTS FALL TO 3-MONTH LOW', 'IRAN SAYS TALKS WITH US ARE OVER', 'ISRAELI STRIKE HITS BEIRUT SUBURB', 'UKRAINE: DRONE ATTACK ON KYIV', 'South Korea exports rise 4%',
    'Wielka Brytania: inflacja w październiku 3,1 proc.', 'Stany Zjednoczone: sprzedaż detaliczna powyżej prognoz', 'Unia Europejska: nowe cła na stal']) assert.equal(subjectOf(t), null, t)
  // what was a subject still is
  assert.equal(subjectOf('Orlen: zysk netto w III kwartale wzrósł'), 'orlen')
  assert.equal(subjectOf('PUTIN: FOR RUSSIA THERE IS ONLY ONE DEMARCATION LINE'), 'putin')
  assert.equal(subjectOf("FED'S HAMMACK: WE NEED TO GET TO RESTRICTIVE POLICY"), 'fed')
  // two dispatches from one country within an hour are two stories
  assert.equal(titlesOf([
    { title: 'Rosja: Putin zaproponował misję humanitarną w Konstantynówce na wschodzie Ukrainy', link: 'https://stooq.pl/n/?f=1', time: T },
    { title: 'Rosja: bank centralny obniżył stopę procentową do 15 proc.', link: 'https://stooq.pl/n/?f=2', time: T + 20 * MIN },
  ]).length, 2)
})

test('a first word that many names share is a subject only with the word after it: one bank is not another, one group not another', () => {
  assert.equal(subjectOf('BANK PEKAO SA (12/2026) Wyniki za trzeci kwartał'), 'bank pekao')
  assert.equal(subjectOf('BANK MILLENNIUM SA (30/2026) Rezerwy na kredyty frankowe'), 'bank millennium')
  assert.equal(subjectOf('BANK OF JAPAN KEEPS RATES UNCHANGED'), 'bank of japan')
  assert.equal(subjectOf('Bank of America podnosi prognozę dla S&P 500'), 'bank of america')
  assert.equal(subjectOf('Grupa Azoty: strata netto w trzecim kwartale'), 'grupa azoty')
  assert.equal(subjectOf('GRUPA KĘTY SA (41/2026) Prognoza na 2027 rok'), 'grupa kęty')
  assert.equal(subjectOf('Bank'), null)
  const hour = [
    { title: 'BANK PEKAO SA (12/2026) Wyniki za trzeci kwartał', link: 'https://bankier.pl/wiadomosc/a-1.html', time: T },
    { title: 'BANK MILLENNIUM SA (30/2026) Rezerwy na kredyty frankowe', link: 'https://bankier.pl/wiadomosc/b-2.html', time: T + 10 * MIN },
    { title: 'BANK OF JAPAN KEEPS RATES UNCHANGED AT 0.75%', link: 'https://t.me/WalterBloomberg/1', time: T + 15 * MIN },
    { title: 'BANK OF JAPAN: UNDERLYING INFLATION TO REACH TARGET IN 2027', link: 'https://t.me/WalterBloomberg/2', time: T + 16 * MIN },
  ]
  assert.deepEqual(titlesOf(hour).map((g) => g.length).sort(), [1, 1, 2], 'the two lines of the Bank of Japan are one story, each bank\'s report its own')
})
