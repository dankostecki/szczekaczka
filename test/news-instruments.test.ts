// The instruments a news names, for its quotes in the reading window (lib/news-instruments.ts): what the text says, and the topics it is about
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { instrumentsIn, MAX_QUOTED, newsInstruments } from '../src/lib/news-instruments'
import { INSTRUMENTS, MARKET_GROUPS, suggest } from '../src/lib/market'

const OIL = ['CMCMARKETS:UKCRUDEOIL', 'CMCMARKETS:USCRUDEOIL']
const news = (title: string, description = '', source = 'WALTER') => ({ title, description, source })

test('a news of Iran at war has the oil under it, though it does not say so: in capitals, in Polish and in English, with the United States or without', () => {
  for (const title of [
    'TRUMP SAYS US MILITARY OPERATIONS AGAINST IRAN GOING VERY WELL',
    'Iran fires missiles at a tanker in the Strait of Hormuz',
    'Tehran warns of retaliation after the strikes',
    'Iranian drones hit a base, Pentagon says',
    'Iran and the United States agree to talks',
    'Stany Zjednoczone przygotowują nowe sankcje wobec Iranu',
    'Wojna z Iranem: Teheran zapowiada odwet',
    'Irańskie rakiety uderzyły w bazę na Bliskim Wschodzie',
    'Amerykański lotniskowiec płynie w stronę Iranu',
  ]) assert.deepEqual(instrumentsIn([title]), OIL, title)
  // the text of the lead counts as well as the headline, and so does the other language of a translated news
  assert.deepEqual(newsInstruments({ ...news('Iran: nowe informacje', 'Pentagon potwierdza uderzenie'), pl: null }, false), OIL)
  assert.deepEqual(newsInstruments({ ...news('IRAN WARNS OF RESPONSE', 'Strike on a base'), pl: { title: 'Iran zapowiada odpowiedź', description: '' } }, true), OIL)
  assert.deepEqual(newsInstruments({ ...news('NEW REPORT', 'Details'), pl: { title: 'Iran: wojna trwa', description: '' } }, true), OIL)
})

test('Iran alone is not war, and war without Iran is not its oil; no word is taken from inside another', () => {
  for (const title of [
    'Iranian rial hits a record low as inflation rises',  // Iran, nothing of a war
    'Irańska waluta traci na wartości',
    'US strikes on Houthi targets in Yemen',               // a war, not Iran's
    'Wojna na Ukrainie: Rosja ostrzeliwuje Charków',
    'Iran: warunki umowy z Warsaw Pact Bank',               // "war" inside "warunki" and "Warsaw"
    'Iran says us tourists are welcome',                     // "us" the pronoun, not the country
    'Biran, Bahrain and Zoran in the news',                  // "iran" inside names
  ]) assert.deepEqual(instrumentsIn([title]), [], title)
})

test('the topic\'s oil comes after what the news names: no twice, and not pushed out by the three that are named', () => {
  // the oil is named (Brent, WTI): the same two rows, once
  assert.deepEqual(instrumentsIn(['Brent jumps as Iran war fears grow']), OIL)
  assert.deepEqual(instrumentsIn(['Wojna z Iranem: ropa Brent najdroższa od miesięcy']), OIL)
  // oil in any form is both rows already (WTI alone too), so the topic adds nothing
  assert.deepEqual(instrumentsIn(['Iran war: WTI jumps']), OIL)
  // other instruments named: they stay first, in the order they come in, and the oil is added
  assert.deepEqual(instrumentsIn(['Iran war: Tesla, Apple and Orlen fall']), ['NASDAQ:TSLA', 'NASDAQ:AAPL', 'GPW:PKN', ...OIL])
  // more than three named: the first three, then the oil (it is not cut by the limit)
  const many = instrumentsIn(['Iran war: Tesla, Apple, Nvidia and Orlen fall'])
  assert.deepEqual(many.slice(0, MAX_QUOTED), ['NASDAQ:TSLA', 'NASDAQ:AAPL', 'NASDAQ:NVDA'])
  assert.deepEqual(many.slice(MAX_QUOTED), OIL)
  // the same news without Iran keeps the limit
  assert.equal(instrumentsIn(['Tesla, Apple, Nvidia and Orlen fall']).length, MAX_QUOTED)
})

test('only the channels that have quotes: the topic does not add them to a channel that has none', () => {
  assert.deepEqual(newsInstruments({ ...news('Iran war: strikes', '', 'PAP'), pl: null }, false), OIL)
  assert.deepEqual(newsInstruments({ ...news('Iran war: strikes', '', 'ESPI'), pl: null }, false), [])
  assert.deepEqual(newsInstruments({ ...news('Iran war: strikes', '', 'MACRONEXT'), pl: null }, false), [])
})

test('USD/JPY is in the table of the market tab, from CMC: a news naming the pair, and the symbol field, point to it', () => {
  assert.ok(MARKET_GROUPS.find((g) => g.name === 'Waluty')!.items.some((i) => i.symbol === 'CMCMARKETS:USDJPY'))
  assert.deepEqual(instrumentsIn(['USD/JPY rises above 155 after the BOJ decision']), ['CMCMARKETS:USDJPY'])
  assert.deepEqual(instrumentsIn(['Jen najsłabszy od lipca, USDJPY powyżej 155']), ['CMCMARKETS:USDJPY'])
  assert.equal(suggest('jen')[0].symbol, 'CMCMARKETS:USDJPY')
  assert.equal(suggest('usdjpy')[0].symbol, 'CMCMARKETS:USDJPY')
  assert.equal(INSTRUMENTS.filter((i) => i.name === 'USD/JPY').length, 1, 'once: not also from another provider')
})
