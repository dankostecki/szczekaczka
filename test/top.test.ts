// The "Top" tab (lib/top.ts): the news of the last hours by the AI's rating, the same story from several channels once, the languages rated
import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { NewsItem } from '../src/lib/parse'
import { inLanguage, withTime, type Item } from '../src/lib/news'
import { loadPrefs, PREFS_KEY } from '../src/lib/prefs'
import { DEFAULT_TOP_HOURS, IMPORTANCE, importanceLevel, importanceName, TOP_HOURS, topStories } from '../src/lib/top'

const NOW = Date.parse('2026-10-30T12:00:00Z')
let n = 0
function news(source: string, label: string, title: string, hoursAgo: number, ai: number | null | undefined, more: Partial<NewsItem> = {}): Item {
  n++
  return withTime({ id: `${source}:${label}:${n}`, title, description: '', link: `https://${source.toLowerCase()}.example.net/${n}`,
    pubDate: new Date(NOW - hoursAgo * 3600_000).toISOString(), source, label, ...(ai !== undefined ? { ai } : {}), ...more })
}
const titles = (s: ReturnType<typeof topStories>) => s.map((x) => x.item.title)

test('the window: only the rated news of the last hours, the most important step first; the newer first within a step', () => {
  const items = [
    news('STOOQ', 'BIZNES', 'Orlen podnosi prognozę wydobycia', 1, 6),
    news('WALTER', 'TELEGRAM', 'FED CUTS RATES BY 25 BPS', 3, 9.5),
    news('ESPI', 'BANKIER', 'Spółka Alfa: umowa na dostawę części', 0.5, 2),
    news('PAP', 'BIZNES', 'Rząd przyjął projekt budżetu', 6, 8),
    news('GPW', 'KOMUNIKATY', 'Zawieszenie obrotu akcjami spółki Beta', 2, 6),
    news('STOOQ', 'ŚWIAT', 'Nikkei zyskuje 1,2 proc.', 10, 7),
    news('STOOQ', 'KRAJ', 'Bez oceny', 1, undefined),
    news('STOOQ', 'KRAJ', 'Ocena nieudana', 1, null),
    news('STOOQ', 'KRAJ', 'Starsza niż doba', 25, 10),
  ]
  assert.deepEqual(titles(topStories(items, 4, NOW, ['en', 'pl'])),
    ['FED CUTS RATES BY 25 BPS', 'Orlen podnosi prognozę wydobycia', 'Zawieszenie obrotu akcjami spółki Beta', 'Spółka Alfa: umowa na dostawę części'],
    'Orlen (an hour ago) before the suspension (two hours ago): both rated 6')
  assert.deepEqual(titles(topStories(items, 8, NOW, ['en', 'pl'])).slice(0, 2), ['FED CUTS RATES BY 25 BPS', 'Rząd przyjął projekt budżetu'])
  assert.equal(topStories(items, 12, NOW, ['en', 'pl']).length, 6)
  assert.equal(topStories(items, 24, NOW, ['en', 'pl']).length, 6, 'a news older than a day is not there (the server keeps a day)')
  assert.deepEqual(TOP_HOURS, [4, 8, 12, 24])
})

test('the same news from several channels is one story, under its best rated headline; within a step of the importance the newest story first', () => {
  const items = [
    news('WALTER', 'TELEGRAM', 'BINANCE HALTS WITHDRAWALS AFTER $1.8B HACK', 2, 8),
    news('INVESTINGLIVE', 'WIADOMOŚCI', 'Binance halts withdrawals after $1.8B hack', 1.9, 8.5),
    news('SEEKINGALPHA', 'MARKET CURRENTS', 'Binance halts withdrawals after hack of $1.8B', 1.8, 7),
    news('WALTER', 'TELEGRAM', 'ECB HOLDS RATES', 1, 9),
    news('WALTER', 'TELEGRAM', 'KREMLIN AIDE WARNS ON STRIKES DURING HOLIDAY', 0.5, 8.5),
  ]
  const top = topStories(items, 4, NOW, ['en', 'pl'])
  assert.equal(top.length, 3)
  // all three have the four bars: the newest first, whatever the number behind the bars and however many sources
  assert.deepEqual(top.map((s) => s.item.title.split(' ')[0]), ['KREMLIN', 'ECB', 'Binance'])
  assert.equal(top[2].item.source, 'INVESTINGLIVE', 'the best rated of the three headlines of the story')
  assert.deepEqual(top[2].sources, ['INVESTINGLIVE', 'WALTER', 'SEEKINGALPHA'])
  assert.equal(top[2].others.length, 2)
  assert.equal(top[2].ai, 8.5)
})

test('the order never goes against the colours, and within a colour never against the clock', () => {
  // as seen on the phone: orange news (7.6) that two channels reported were above red ones (8.0) of one channel
  const items = [
    news('WALTER', 'TELEGRAM', 'UKRAINE REPORTEDLY HALTS STRIKES ON RUSSIAN REFINERIES', 11, 7.6),
    news('INVESTINGLIVE', 'WIADOMOŚCI', 'Ukraine reportedly halts strikes on Russian refineries', 10.9, 7.4),
    news('WALTER', 'TELEGRAM', 'ECB POLICYMAKERS SEE DECEMBER HIKE THEN PAUSE', 3, 8),
    news('WALTER', 'TELEGRAM', 'TRUMP SAYS US MILITARY OPERATIONS AGAINST IRAN GOING VERY WELL', 1, 7.1),
    news('INVESTINGLIVE', 'WIADOMOŚCI', 'Trump says US military operations against Iran going very well', 0.9, 6.8),
    news('WALTER', 'TELEGRAM', 'KREMLIN AIDE SAYS MASS UKRAINIAN STRIKES COULD AFFECT TALKS', 5, 8.2),
    news('INVESTINGLIVE', 'WIADOMOŚCI', 'Ship on fire in the Strait of Hormuz near Oman', 9, 6.5),
  ]
  const top = topStories(items, 24, NOW, ['en', 'pl'])
  const levels = top.map((s) => importanceLevel(s.ai))
  assert.deepEqual(levels, [...levels].sort((a, b) => b - a), 'a lower step is never above a higher one')
  top.forEach((s, i) => { if (i && levels[i] === levels[i - 1]) assert.ok(s.item.time <= top[i - 1].item.time, `${s.item.title}: older than the one above it`) })
  assert.deepEqual(top.map((s) => s.item.title.split(' ')[0]), ['ECB', 'KREMLIN', 'TRUMP', 'Ship', 'UKRAINE'])
})

test('news of the same four bars are in the order of their hours, and a site whose links differ only after "?" is not one story', () => {
  // as seen on the phone (12 November 2026, 8 hours): three news with four bars at 13:25, 14:47 and 16:10, in that order, then one with
  // three at 14:17; and under Stooq's news of Putin "Piszą o tym też: WALTER, ESPI, PAP": every Stooq news of the window was one story,
  // as their links are all "stooq.pl/n/?f=…", and with them whatever any of them was put together with
  const stooq = (n: number) => ({ link: `https://stooq.pl/n/?f=${1700000 + n}` })
  const items = [
    news('WALTER', 'TELEGRAM', 'PUTIN: FOR RUSSIA THERE IS ONLY ONE DEMARCATION LINE WITH UKRAINE, THE STATE BORDER - IFX', 4.6, 9.6),
    news('INVESTINGLIVE', 'WIADOMOŚCI', "Fed's Hammack: We need to get to restrictive policy to bring inflation down", 3.2, 9.3),
    news('WALTER', 'TELEGRAM', "FED'S HAMMACK: WE NEED TO GET TO RESTRICTIVE POLICY TO BRING INFLATION DOWN", 3.25, 8.4),
    news('STOOQ', 'ŚWIAT', 'Rosja: Putin zaproponował misję humanitarną w Konstantynówce na wschodzie Ukrainy', 1.8, 8.8, stooq(1)),
    news('INVESTINGLIVE', 'WIADOMOŚCI', 'Trump: We do not need a deal with Iran', 3.7, 7.4),
    news('STOOQ', 'BIZNES', 'Orlen: zysk netto w trzecim kwartale wzrósł o 12 proc.', 5.5, 6.4, stooq(2)),
    news('ESPI', 'BANKIER', 'ORLEN SA (41/2026) Szacunkowe wyniki za trzeci kwartał', 5.6, 6.1),
    news('STOOQ', 'KRAJ', 'NBP: stopy procentowe bez zmian', 7, 7.9, stooq(3)),
    news('STOOQ', 'ŚWIAT', 'Rosja: bank centralny obniżył stopę procentową do 15 proc.', 1.5, 6.6, stooq(4)),
  ]
  const top = topStories(items, 8, NOW, ['en', 'pl'])
  assert.deepEqual(top.map((s) => `${importanceLevel(s.ai)} ${s.item.title.slice(0, 16)}`), [
    '4 Rosja: Putin zap',  // 1.8 hours ago
    "4 Fed's Hammack: W",  // 3.2
    '4 PUTIN: FOR RUSSI',  // 4.6
    '3 Rosja: bank cent',  // 1.5
    '3 Trump: We do not',  // 3.7
    '3 Orlen: zysk nett',  // 5.5
    '3 NBP: stopy proce',  // 7
  ])
  const putin = top[0]
  assert.deepEqual(putin.sources, ['STOOQ'], 'only its own source: no other Stooq news, and none of what they were put together with')
  assert.deepEqual(top[1].sources, ['INVESTINGLIVE', 'WALTER'])
  assert.deepEqual(top.find((s) => s.item.title.startsWith('Orlen'))!.sources, ['STOOQ', 'ESPI'], 'a company\'s news and its report: one story still')
})

test('news shown in Polish are put together by their text as published; the languages the server rates decide what is in', () => {
  const en = news('WALTER', 'TELEGRAM', 'TESLA DELIVERIES MISS ESTIMATES', 2, 7, { pl: { title: 'Dostawy Tesli poniżej prognoz', description: '' } })
  const twin = news('SEEKINGALPHA', 'MARKET CURRENTS', 'Tesla deliveries miss estimates', 2, 6, { pl: { title: 'Dostawy Tesli niższe od oczekiwań', description: '' } })
  const pl = news('PAP', 'BIZNES', 'Prezes NBP o stopach procentowych', 1, 8)
  const shown = [en, twin, pl].map((i) => inLanguage(i, []))
  const both = topStories(shown, 4, NOW, ['en', 'pl'])
  assert.deepEqual(both.map((s) => s.item.title), ['Prezes NBP o stopach procentowych', 'Dostawy Tesli poniżej prognoz'], 'shown in Polish, grouped by the English')
  assert.equal(both[1].sources.length, 2)
  // only the channels in English are rated now: a Polish news keeps an old rating at most, and is left out
  assert.deepEqual(topStories(shown, 4, NOW, ['en']).map((s) => s.item.source), ['WALTER'])
})

test('a rating as the page shows it: four steps, from a quiet news to a very important one; and what the tab and the list remember', () => {
  assert.deepEqual([0, 2.5, 3.9, 4, 5.9, 6, 7.9, 8, 10].map(importanceLevel), [1, 1, 1, 2, 2, 3, 3, 4, 4])
  assert.deepEqual(IMPORTANCE.map((s) => s.name), ['spokojna', 'umiarkowana', 'ważna', 'bardzo ważna'])
  assert.deepEqual([0, 4.5, 7.6, 9.2].map(importanceName), ['spokojna', 'umiarkowana', 'ważna', 'bardzo ważna'], 'the name beside the bars in the news\'s window')
  for (const step of IMPORTANCE) assert.equal(IMPORTANCE[importanceLevel(step.from) - 1], step, 'each step starts where it says')
  const store = new Map<string, string>()
  ;(globalThis as { localStorage?: unknown }).localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v) } }
  try {
    store.set(PREFS_KEY, JSON.stringify({ topHours: 8, topSource: 'WALTER' }))
    assert.deepEqual([loadPrefs().topHours, loadPrefs().topSource], [8, 'WALTER'])
    store.set(PREFS_KEY, JSON.stringify({ topHours: 5, topSource: 'MACRONEXT' }))
    assert.deepEqual([loadPrefs().topHours, loadPrefs().topSource], [DEFAULT_TOP_HOURS, ''], 'what the tab does not have: the defaults')
    store.set(PREFS_KEY, JSON.stringify({ topSource: 'NOWHERE' }))
    assert.equal(loadPrefs().topSource, '')
    // the importance in every list: off until the reader switches it on
    assert.equal(loadPrefs().showImportance, false)
    store.set(PREFS_KEY, JSON.stringify({ showImportance: true }))
    assert.equal(loadPrefs().showImportance, true)
    store.set(PREFS_KEY, JSON.stringify({ showImportance: 'yes' }))
    assert.equal(loadPrefs().showImportance, false)
  } finally {
    delete (globalThis as { localStorage?: unknown }).localStorage
  }
})
