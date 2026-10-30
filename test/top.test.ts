// The "Top" tab (lib/top.ts): the news of the last hours by the AI's rating, the same story from several channels once, the languages rated
import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { NewsItem } from '../src/lib/parse'
import { inLanguage, withTime, type Item } from '../src/lib/news'
import { loadPrefs, PREFS_KEY } from '../src/lib/prefs'
import { DEFAULT_TOP_HOURS, IMPORTANCE, importanceLevel, TOP_HOURS, topStories } from '../src/lib/top'

const NOW = Date.parse('2026-10-30T12:00:00Z')
let n = 0
function news(source: string, label: string, title: string, hoursAgo: number, ai: number | null | undefined, more: Partial<NewsItem> = {}): Item {
  n++
  return withTime({ id: `${source}:${label}:${n}`, title, description: '', link: `https://${source.toLowerCase()}.example.net/${n}`,
    pubDate: new Date(NOW - hoursAgo * 3600_000).toISOString(), source, label, ...(ai !== undefined ? { ai } : {}), ...more })
}
const titles = (s: ReturnType<typeof topStories>) => s.map((x) => x.item.title)

test('the window: only the rated news of the last hours, best first; the newer first when two are rated the same', () => {
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

test('the same news from several channels is one story, under its best rated headline; more sources decide between two rated the same', () => {
  const items = [
    news('WALTER', 'TELEGRAM', 'BINANCE HALTS WITHDRAWALS AFTER $1.8B HACK', 2, 8),
    news('INVESTINGLIVE', 'WIADOMOŚCI', 'Binance halts withdrawals after $1.8B hack', 1.9, 8.5),
    news('SEEKINGALPHA', 'MARKET CURRENTS', 'Binance halts withdrawals after hack of $1.8B', 1.8, 7),
    news('WALTER', 'TELEGRAM', 'ECB HOLDS RATES', 1, 9),
    news('WALTER', 'TELEGRAM', 'KREMLIN AIDE WARNS ON STRIKES DURING HOLIDAY', 0.5, 8.5),
  ]
  const top = topStories(items, 4, NOW, ['en', 'pl'])
  assert.equal(top.length, 3)
  assert.equal(top[0].item.title, 'ECB HOLDS RATES', 'the best rated first, however many sources the others have')
  assert.equal(top[1].item.source, 'INVESTINGLIVE', 'the best rated of the three; above the other 8.5, which has one source')
  assert.deepEqual(top[1].sources, ['INVESTINGLIVE', 'WALTER', 'SEEKINGALPHA'])
  assert.equal(top[1].others.length, 2)
  assert.equal(top[1].ai, 8.5)
  assert.equal(top[2].item.title, 'KREMLIN AIDE WARNS ON STRIKES DURING HOLIDAY')
})

test('the order never goes against the colours: a news of a lower step is never above one of a higher, whatever its sources', () => {
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
  const ratings = top.map((s) => s.ai)
  assert.deepEqual(ratings, [...ratings].sort((a, b) => b - a))
  assert.deepEqual(top.map((s) => s.item.title.split(' ')[0]), ['KREMLIN', 'ECB', 'UKRAINE', 'TRUMP', 'Ship'])
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
