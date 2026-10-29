// The translations a channel may have a day (FeedConfig.translatePerDay): the free plan's Workers AI allowance is shared by all channels
import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { NewsItem } from '../src/lib/parse'
import type { CheckResult, FeedState } from '../worker/feeds'
import { PER_DAY, translateNew } from '../worker/translate'
import { FEEDS } from '../src/lib/sources'

const post = (i: number): NewsItem => ({ id: `INVESTINGLIVE:WIADOMOŚCI:${i}`, title: `Headline ${i}`, description: `Lead ${i}`, link: `https://investinglive.com/news/${i}/`,
  pubDate: new Date(Date.UTC(2026, 9, 28, 19, i)).toISOString(), source: 'INVESTINGLIVE', label: 'WIADOMOŚCI' })

function result(n: number): CheckResult {
  const items = Array.from({ length: n }, (_, i) => post(i))
  const state: FeedState = { items, current: items.map((i) => i.id), error: null, checkedAt: 0 }
  return { state, changed: true, add: items, remove: [] }
}
const ai = (calls: { n: number }) => ({ run: async () => { calls.n++; return { choices: [{ message: { content: 'Tytuł\nZajawka' } }], usage: { prompt_tokens: 800, completion_tokens: 60 } } } }) as unknown as Ai
const NOW = Date.parse('2026-10-28T20:00:00Z')

test('the limit of a channel stops its translations for the day; without one, the usual limit', async () => {
  const calls = { n: 0 }
  const r = result(10)
  r.state.ai = { day: '2026-10-28', n: 3 }
  await translateNew(ai(calls), r, NOW, { perDay: 5 }) // 5 a day, 3 used
  assert.equal(calls.n, 2)
  assert.equal(r.state.ai.n, 5)
  assert.equal(r.state.items.filter((i) => i.pl).length, 2)
  // the limit is reached: nothing more
  const said = await translateNew(ai(calls), r, NOW + 1000, { perDay: 5 })
  assert.match(said ?? '', /the limit of 5 a day is reached/)
  assert.equal(calls.n, 2)
  // the usual limit when no other is given
  const plain = result(3)
  plain.state.ai = { day: '2026-10-28', n: PER_DAY }
  assert.match((await translateNew(ai(calls), plain, NOW)) ?? '', new RegExp(`the limit of ${PER_DAY} a day`))
})

test('investingLive has a limit below the usual one, together with Walter and Seeking Alpha within the free allowance', () => {
  const limits = FEEDS.filter((f) => f.source === 'INVESTINGLIVE').map((f) => f.translatePerDay!)
  assert.equal(limits.length, 1)
  for (const n of limits) assert.ok(n > 0 && n < PER_DAY)
  // about 10 neurons a post (the title and the lead) and 10,000 neurons a day for everything: Walter (up to 150 a day) and Seeking Alpha (up to 400) take part of it
  assert.ok(limits.reduce((a, b) => a + b, 0) * 10 + 150 * 8 + 400 * 8 < 10_000)
})
