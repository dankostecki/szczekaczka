// Stage 1: which news are in the window, by which date, and how they are grouped and ranked
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { collect, DATE_KIND, inWindow, rank } from '../../worker/briefing/collect'
import { readConfig } from '../../worker/briefing/config'
import { editionTimes } from '../../worker/briefing/time'
import { item, poller } from './helpers'

const { config } = readConfig({})
// Seeking Alpha is not a source of the briefing by default; some of these tests need it
const withSA = readConfig({ BRIEFING_SOURCES: 'WALTER,SEEKINGALPHA,STOOQ,ESPI,GPW,PAP' }).config
const t = editionTimes('2026-10-28', config) // window 2026-10-27T18:00Z … cutoff 2026-10-28T05:00Z
const ms = (s: string) => new Date(Date.parse(s)).toISOString()

test('the 19:00 boundary and the cutoff: [from, cutoff)', () => {
  const items = [
    item('WALTER', 'Before the window by a millisecond, Fed decision', ms('2026-10-27T17:59:59.999Z')),
    item('WALTER', 'Exactly at nineteen hundred Warsaw, Nvidia earnings', ms('2026-10-27T18:00:00.000Z')),
    item('WALTER', 'A minute before the cutoff, Tesla deliveries', ms('2026-10-28T04:59:00.000Z')),
    item('WALTER', 'Exactly at the cutoff, Apple guidance', ms('2026-10-28T05:00:00.000Z')),
  ]
  const r = collect(poller(items, t.cutoff), t, t.cutoff, { ...config, maxCandidates: 50 })
  assert.deepEqual(r.candidates.map((c) => c.title).sort(), ['A minute before the cutoff, Tesla deliveries', 'Exactly at nineteen hundred Warsaw, Nvidia earnings'])
  assert.equal(r.stats.outside, 2)
})

test('the actual cutoff counts, not the configured one: collected at 06:04, a news of 06:02 is in', () => {
  const late = t.cutoff + 4 * 60_000
  const items = [item('STOOQ', 'Published at two past six, PKO results', ms('2026-10-28T05:02:00Z'))]
  assert.equal(collect(poller(items, late), t, late, config).candidates.length, 1)
  assert.equal(collect(poller(items, late), t, t.cutoff, config).candidates.length, 0)
})

test('the publication date decides: no date, a date in the future or another source keep a news out; when it was fetched does not count', () => {
  const at = t.cutoff
  const items = [
    item('WALTER', 'No date at all, but fetched at 22:00', ''),
    item('WALTER', 'A date the parser could not read', 'not a date'),
    item('STOOQ', 'Dated tomorrow by a broken feed', ms('2026-10-29T10:00:00Z')),
    item('MACRONEXT', 'A calendar announcement of this site', ms('2026-10-27T20:00:00Z')),
    // published two days ago; that the Poller read it again tonight changes nothing (its pubDate is the feed's first one)
    item('STOOQ', 'Published two days ago, seen again tonight', ms('2026-10-26T09:00:00Z')),
    item('STOOQ', 'In the window, Orlen buys a refinery', ms('2026-10-27T21:00:00Z')),
  ]
  const r = collect(poller(items, at), t, at, config)
  assert.deepEqual(r.candidates.map((c) => c.title), ['In the window, Orlen buys a refinery'])
  assert.equal(r.stats.noDate, 2)
  assert.equal(r.stats.future, 1)
  assert.equal(r.stats.otherSource, 1)
  assert.equal(r.stats.outside, 1)
  assert.equal(r.candidates[0].dateKind, 'published')
  assert.equal(r.candidates[0].publishedAt, '2026-10-27T21:00:00.000Z')
})

test('Seeking Alpha is not taken by default (no descriptions, a flood after the US close); BRIEFING_SOURCES can add it', () => {
  assert.ok(!config.sources.includes('SEEKINGALPHA'))
  const items = [
    item('SEEKINGALPHA', 'Apple GAAP EPS of $1.64 beats by $0.04, revenue of $94B beats by $1B', ms('2026-10-27T21:10:00Z')),
    item('WALTER', 'NVIDIA Q3 REVENUE $57B, ABOVE ESTIMATES', ms('2026-10-27T21:13:00Z')),
  ]
  const r = collect(poller(items, t.cutoff), t, t.cutoff, config)
  assert.deepEqual(r.candidates.map((c) => c.title), ['NVIDIA Q3 REVENUE $57B, ABOVE ESTIMATES'])
  assert.equal(r.stats.otherSource, 1)
  assert.equal(collect(poller(items, t.cutoff), t, t.cutoff, withSA).candidates.length, 2)
})

test('every source the briefing takes by default has its dates described', () => {
  for (const s of config.sources) assert.equal(DATE_KIND[s], 'published', s)
})

test('routine notices are left out', () => {
  const items = [
    item('SEEKINGALPHA', 'Acme Corp declares $0.25 dividend', ms('2026-10-27T20:00:00Z')),
    item('SEEKINGALPHA', 'Acme Corp Q3 2026 Earnings Call Transcript', ms('2026-10-27T20:00:00Z')),
    item('ESPI', 'XYZ SA: Zawiadomienie w trybie art. 19 ust. 1 MAR', ms('2026-10-27T20:00:00Z')),
    item('ESPI', 'XYZ SA: Informacja o transakcjach na akcjach', ms('2026-10-27T20:00:00Z')),
    item('WALTER', 'NVIDIA Q3 REVENUE $57B, ABOVE ESTIMATES', ms('2026-10-27T21:00:00Z')),
  ]
  const r = collect(poller(items, t.cutoff), t, t.cutoff, withSA)
  assert.deepEqual(r.candidates.map((c) => c.title), ['NVIDIA Q3 REVENUE $57B, ABOVE ESTIMATES'])
  assert.equal(r.stats.routine, 4)
})

test('duplicates are one story: the same headline from two sources, the same link, a repeated id', () => {
  const a = item('WALTER', 'Nvidia third quarter revenue beats estimates on data center demand', ms('2026-10-27T21:00:00Z'))
  const b = item('SEEKINGALPHA', 'Nvidia third quarter revenue beats estimates, data center demand', ms('2026-10-27T21:05:00Z'))
  const c = item('STOOQ', 'Orlen ogłasza przejęcie rafinerii', ms('2026-10-27T22:00:00Z'), { link: 'https://stooq.pl/n/?f=1' })
  const d = item('STOOQ', 'Orlen ogłasza przejęcie rafinerii (aktualizacja)', ms('2026-10-27T22:30:00Z'), { link: 'https://www.stooq.pl/n/?f=1' })
  const r = collect(poller([a, b, c, d, a], t.cutoff), t, t.cutoff, withSA)
  assert.equal(r.candidates.length, 2)
  const nvidia = r.candidates.find((x) => x.title.startsWith('Nvidia'))!
  assert.deepEqual(nvidia.sources.sort(), ['SEEKINGALPHA', 'WALTER'])
  assert.equal(nvidia.publishedAt, '2026-10-27T21:00:00.000Z', 'the earliest publication of the group')
  assert.equal(r.candidates.find((x) => x.title.startsWith('Orlen'))!.itemIds.length, 2)
  assert.ok(r.candidates[0].sources.length === 2, 'a story two sources report ranks first')
})

test('different stories with common words stay apart; stories far apart in time too', () => {
  const r = collect(poller([
    item('WALTER', 'Fed holds rates steady, Powell says inflation remains elevated', ms('2026-10-27T19:00:00Z')),
    item('WALTER', 'ECB holds rates steady, Lagarde says inflation is near target', ms('2026-10-27T19:30:00Z')),
    item('WALTER', 'Oil prices rise as OPEC agrees output cut', ms('2026-10-27T19:00:00Z')),
    item('WALTER', 'Oil prices rise as OPEC agrees output cut', ms('2026-10-28T04:00:00Z')),
  ], t.cutoff), t, t.cutoff, config)
  assert.equal(r.candidates.length, 4)
})

test('no source takes more than 40% of the places, and the translation goes along', () => {
  const word = (k: number) => `w${(k * 7919).toString(36)}z`
  const items = Array.from({ length: 30 }, (_, i) => item('SEEKINGALPHA', `${word(i)} ${word(i + 100)} ${word(i + 200)} reports`, ms('2026-10-27T20:00:00Z'),
    { pl: { title: `Spółka ${word(i)}`, description: '' } }))
  items.push(...Array.from({ length: 5 }, (_, i) => item('STOOQ', `${word(i + 300)} ${word(i + 400)} ${word(i + 500)}`, ms('2026-10-27T20:00:00Z'))))
  const r = collect(poller(items, t.cutoff), t, t.cutoff, { ...withSA, maxCandidates: 10 })
  assert.equal(r.candidates.length, 8, 'four places each: the cap of 40% of ten')
  assert.equal(r.candidates.filter((c) => c.sources.includes('SEEKINGALPHA')).length, 4)
  assert.equal(r.candidates.filter((c) => c.sources.includes('STOOQ')).length, 4)
  assert.ok(r.candidates.find((c) => c.sources.includes('SEEKINGALPHA'))!.translation?.startsWith('Spółka '))
})

test('a full night of news is collected quickly: each of the two steps well within the free plan\'s 10 ms of CPU', () => {
  const words = 'stocks bonds yields dollar euro gold oil earnings guidance revenue merger tariff China Japan Germany Poland bank tech chips cloud'.split(' ')
  const items = Array.from({ length: 700 }, (_, i) => item(['WALTER', 'PAP', 'STOOQ', 'ESPI'][i % 4],
    `Headline ${i} ${words[i % 21]} ${words[(i * 7) % 21]} ${words[(i * 13) % 21]} company${i % 97} update ${i % 5}`,
    new Date(t.from + (i * (t.cutoff - t.from)) / 700).toISOString(), { description: 'A lead of some length that says a little more about the news. '.repeat(3) }))
  const data = poller(items, t.cutoff)
  const best = (f: () => void) => { for (let k = 0; k < 10; k++) f(); let m = Infinity; for (let k = 0; k < 20; k++) { const s = performance.now(); f(); m = Math.min(m, performance.now() - s) } return m }
  const w = inWindow(data, t, t.cutoff, config)
  assert.equal(w.items.length, 700)
  const a = best(() => inWindow(data, t, t.cutoff, config)), b = best(() => rank(w.items, config))
  assert.ok(a < 8 && b < 8, `inWindow ${a.toFixed(1)} ms, rank ${b.toFixed(1)} ms (this machine; the Worker's CPU differs)`)
})
