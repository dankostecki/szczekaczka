// The importance of every news of the list, rated as it comes in (worker/rate.ts): which channels, how many at a time and a day, what is kept
// from check to check, what the page is told, and that a failure of the service only pauses it
import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { NewsItem } from '../src/lib/parse'
import { FEEDS } from '../src/lib/sources'
import { checkFeed, type CheckResult, type FeedState } from '../worker/feeds'
import { LEVELS, QUESTION } from '../worker/briefing/importance'
import { NEWS_MODEL, PER_DAY, rateConfig, ratedFeed, rateNew, topMeta } from '../worker/rate'
import { PAUSE_MS } from '../worker/translate'
import { fakeAi } from './briefing/helpers'

const NOW = Date.parse('2026-10-30T10:00:00Z')
const post = (i: number, source = 'WALTER', label = 'TELEGRAM'): NewsItem => ({ id: `${source}:${label}:${i}`, title: `Headline ${i}`, description: i % 2 ? `Lead ${i}` : '',
  link: `https://example.net/${i}`, pubDate: new Date(NOW - i * 60_000).toISOString(), source, label })
function result(n: number): CheckResult {
  const items = Array.from({ length: n }, (_, i) => post(i))
  const state: FeedState = { items, current: items.map((i) => i.id), error: null, checkedAt: 0 }
  return { state, changed: true, add: items.slice(0, 3), remove: [] }
}
interface Asked { model: string; questions: Record<string, { type: string; criteria: string[]; instructions: Record<string, unknown> }> }

test('the settings: on, Clef-flash, both languages, a day\'s limit per channel; a wrong value falls back to the default and is said', () => {
  assert.deepEqual(rateConfig({}), { enabled: true, model: NEWS_MODEL, langs: ['en', 'pl'], perDay: PER_DAY, problems: [] })
  assert.equal(NEWS_MODEL, '@cf/cloudflare/clef-flash')
  assert.deepEqual(rateConfig({ NEWS_AI_RANK: 'off', NEWS_AI_RANK_LANGS: 'en', NEWS_AI_RANK_MODEL: '@cf/cloudflare/clef', NEWS_AI_RANK_PER_DAY: '50' }),
    { enabled: false, model: '@cf/cloudflare/clef', langs: ['en'], perDay: 50, problems: [] })
  const wrong = rateConfig({ NEWS_AI_RANK: 'maybe', NEWS_AI_RANK_LANGS: 'de', NEWS_AI_RANK_MODEL: '@cf/google/gemma-4-26b-a4b-it', NEWS_AI_RANK_PER_DAY: '-3' })
  assert.equal(wrong.problems.length, 4)
  assert.deepEqual({ ...wrong, problems: [] }, { enabled: true, model: NEWS_MODEL, langs: ['en', 'pl'], perDay: PER_DAY, problems: [] })
})

test('which channels are rated: every news channel, or those in English only; never MacroNext\'s announcements', () => {
  const both = rateConfig({}), en = rateConfig({ NEWS_AI_RANK_LANGS: 'en' }), off = rateConfig({ NEWS_AI_RANK: 'off' })
  const names = (c: typeof both) => FEEDS.filter((f) => ratedFeed(f, c)).map((f) => f.source)
  assert.ok(!names(both).includes('MACRONEXT'))
  for (const s of ['ESPI', 'GPW', 'STOOQ', 'PAP', 'WALTER', 'SEEKINGALPHA', 'INVESTINGLIVE'] as const) assert.ok(names(both).includes(s), s)
  assert.deepEqual([...new Set(names(en))].sort(), ['INVESTINGLIVE', 'SEEKINGALPHA', 'WALTER'])
  assert.deepEqual(names(off), [])
  // what the page is told: the languages, or nothing when it is off or there is no Workers AI
  assert.deepEqual(topMeta(both, true), { langs: ['en', 'pl'] })
  assert.deepEqual(topMeta(en, true), { langs: ['en'] })
  assert.equal(topMeta(off, true), null)
  assert.equal(topMeta(both, false), null)
})

test('the news without a rating, newest first, 40 to a request and two requests at a check; each its question with its own headline', async () => {
  const { ai, calls } = fakeAi((h) => (/Headline 1$/.test(h) ? 9 : 2))
  const r = result(100)
  const said = await rateNew(ai, r, NOW, rateConfig({}))
  assert.equal(calls.n, 2)
  const asked = calls.inputs as Asked[]
  assert.deepEqual(asked.map((a) => Object.keys(a.questions).length), [40, 40])
  assert.deepEqual(calls.models, [NEWS_MODEL, NEWS_MODEL])
  assert.equal(asked[0].model, 'clef-flash')
  assert.deepEqual(asked[0].questions.n1, { type: 'score', criteria: LEVELS, instructions: { question: QUESTION, headline: 'Headline 0', sources: 'WALTER' } })
  assert.deepEqual(asked[0].questions.n2.instructions, { question: QUESTION, headline: 'Headline 1', sources: 'WALTER', lead: 'Lead 1' })
  const byId = new Map(r.state.items.map((i) => [i.id, i]))
  assert.equal(byId.get('WALTER:TELEGRAM:1')!.ai, 9)
  assert.equal(byId.get('WALTER:TELEGRAM:0')!.ai, 2)
  assert.equal(byId.get('WALTER:TELEGRAM:79')!.ai, 2)
  assert.equal(byId.get('WALTER:TELEGRAM:80')!.ai, undefined, 'the rest at the next check')
  // the rated news go out (the ones already on their way with their rating, the older ones again)
  assert.equal(r.add.length, 80)
  assert.ok(r.add.every((i) => typeof i.ai === 'number'))
  assert.equal(r.changed, true)
  assert.deepEqual(r.state.rate, { day: '2026-10-30', n: 80 })
  assert.match(said!, /rated 80\/80 \(3000 tokens; 80 today\)/)
  // the next check: the remaining 20, nothing asked twice
  await rateNew(ai, r, NOW + 60_000, rateConfig({}))
  assert.equal(calls.n, 3)
  assert.ok(r.state.items.every((i) => typeof i.ai === 'number'))
  assert.equal(r.state.rate!.n, 100)
  assert.equal(await rateNew(ai, r, NOW + 120_000, rateConfig({})), undefined, 'nothing left to rate')
  assert.equal(calls.n, 3)
})

test('the day\'s limit of a channel: no more ratings that day; the next day starts afresh', async () => {
  const { ai, calls } = fakeAi(() => 5)
  const r = result(30)
  r.state.rate = { day: '2026-10-30', n: 45 }
  await rateNew(ai, r, NOW, rateConfig({ NEWS_AI_RANK_PER_DAY: '50' }))
  assert.equal(r.state.items.filter((i) => typeof i.ai === 'number').length, 5)
  assert.equal(r.state.rate!.n, 50)
  assert.match((await rateNew(ai, r, NOW + 1000, rateConfig({ NEWS_AI_RANK_PER_DAY: '50' })))!, /the limit of 50 a day is reached/)
  assert.equal(calls.n, 1)
  await rateNew(ai, r, Date.parse('2026-10-31T00:05:00Z'), rateConfig({ NEWS_AI_RANK_PER_DAY: '50' }))
  assert.ok(r.state.items.every((i) => typeof i.ai === 'number'))
})

test('the service fails: nothing rated, a pause of ten minutes, then again; a news it gave no answer for is not asked again', async () => {
  const down = fakeAi(() => null)
  const r = result(10)
  const said = await rateNew(down.ai, r, NOW, rateConfig({}))
  assert.match(said!, /failed: paused 10 min \| the service is down/)
  assert.ok(r.state.items.every((i) => i.ai === undefined))
  assert.equal(r.state.rate!.retryAt, NOW + PAUSE_MS)
  assert.equal(r.state.rate!.n, 0)
  assert.equal(r.dirty, true)
  const up = fakeAi(() => 4)
  assert.equal(await rateNew(up.ai, r, NOW + 60_000, rateConfig({})), undefined, 'paused')
  assert.equal(up.calls.n, 0)
  // back: answers for all but one; that one is left unrated for good (null)
  const some = { run: async (_m: string, input: Asked) => ({ answers: Object.fromEntries(Object.keys(input.questions).filter((k) => k !== 'n3').map((k) => [k, { type: 'score', score: 2 }])),
    usage: { input_tokens: 100, output_tokens: 0 } }) } as unknown as Ai
  await rateNew(some, r, NOW + PAUSE_MS + 1, rateConfig({}))
  assert.equal(r.state.items[2].ai, null)
  assert.equal(r.state.items[0].ai, 5)
  assert.equal(r.state.rate!.retryAt, undefined)
  const again = fakeAi(() => 9)
  await rateNew(again.ai, r, NOW + PAUSE_MS + 2, rateConfig({}))
  assert.equal(again.calls.n, 0, 'null is not asked again')
})

test('a rating stays with its news from check to check while its title and lead stay; a corrected news is rated again', async () => {
  const feed = FEEDS.find((f) => f.source === 'STOOQ')!
  const rss = (title: string) => `<?xml version="1.0"?><rss version="2.0"><channel><title>Stooq</title>
    <item><title>${title}</title><link>https://stooq.pl/n/?f=1</link><description>Opis pierwszy</description><pubDate>Fri, 30 Oct 2026 09:00:00 GMT</pubDate></item>
    <item><title>Drugi news o rynku</title><link>https://stooq.pl/n/?f=2</link><description>Opis drugi</description><pubDate>Fri, 30 Oct 2026 08:00:00 GMT</pubDate></item>
    </channel></rss>`
  let served = rss('Pierwszy news o rynku')
  const real = globalThis.fetch
  globalThis.fetch = (async () => new Response(served, { headers: { 'content-type': 'application/rss+xml' } })) as typeof fetch
  try {
    const { ai, calls } = fakeAi(() => 7)
    const first = await checkFeed(feed, undefined, feed.url, NOW)
    await rateNew(ai, first, NOW, rateConfig({}))
    assert.ok(first.state.items.every((i) => i.ai === 7))
    const again = await checkFeed(feed, first.state, feed.url, NOW + 120_000)
    assert.ok(again.state.items.every((i) => i.ai === 7), 'kept')
    assert.deepEqual(again.state.rate, first.state.rate, 'the count goes on')
    await rateNew(ai, again, NOW + 120_000, rateConfig({}))
    assert.equal(calls.n, 1, 'nothing asked again')
    served = rss('Pierwszy news o rynku (korekta)')
    const corrected = await checkFeed(feed, again.state, feed.url, NOW + 240_000)
    const byLink = new Map(corrected.state.items.map((i) => [i.link, i]))
    assert.equal(byLink.get('https://stooq.pl/n/?f=1')!.ai, undefined, 'a corrected title: to be rated again')
    assert.equal(byLink.get('https://stooq.pl/n/?f=2')!.ai, 7)
  } finally {
    globalThis.fetch = real
  }
})

test('only the news of the last day are rated: an entry of months ago that a feed still holds, or one without a date, is not', async () => {
  const { ai, calls } = fakeAi(() => 5)
  const r = result(3)
  r.state.items.push({ ...post(90), pubDate: '2026-06-01T10:00:00.000Z' }, { ...post(91), pubDate: '' })
  await rateNew(ai, r, NOW, rateConfig({}))
  assert.equal(calls.n, 1)
  assert.equal(Object.keys((calls.inputs[0] as Asked).questions).length, 3)
  assert.deepEqual(r.state.items.map((i) => i.ai), [5, 5, 5, undefined, undefined])
  assert.equal(await rateNew(ai, r, NOW + 60_000, rateConfig({})), undefined)
})
