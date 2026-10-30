// Stage 1: which news are in the window, by which date, and how they are grouped and ranked
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { collect, DATE_KIND, inWindow, rank, subjectOf } from '../../worker/briefing/collect'
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
    item('WALTER', 'Fed holds rates steady, Warsh says inflation remains elevated', ms('2026-10-27T19:00:00Z')),
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

// The pairs rank compares are cut down by counting the words they share (a bound, collect.ts); the groups must be the ones a
// comparison of every pair gives: two news that share a word few headlines have, within 6 hours, with Jaccard ≥ 0.55, or one link
test('near-duplicates: the same groups as comparing every pair, on random nights with copied and edited headlines', () => {
  let seed = 11
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31
  const tokensOf = (it: { title: string; translation?: string }) =>
    new Set((`${it.title} ${it.translation?.slice(0, 160) ?? ''}`.toLowerCase().match(/[\p{L}\p{N}$%&]+/gu) ?? []).filter((w) => w.length >= 2))
  for (let trial = 0; trial < 60; trial++) {
    const vocab = Array.from({ length: 30 + Math.floor(rnd() * 2000) }, (_, i) => `w${i.toString(36)}`)
    const word = () => vocab[Math.min(vocab.length - 1, Math.floor(Math.exp(rnd() * Math.log(vocab.length)) - 1))]
    // each headline starts with a word of its own, so that only near-duplicates are put together here (not one subject's headlines)
    const items: Parameters<typeof rank>[0] = []
    const texts: string[] = []
    for (let i = 0; i < 20 + Math.floor(rnd() * 250); i++) {
      const copy = texts.length && rnd() < 0.3 ? texts[Math.floor(rnd() * texts.length)].split(' ') : null
      if (copy) for (let k = Math.floor(rnd() * 3); k > 0; k--) copy[Math.floor(rnd() * copy.length)] = word()
      texts.push(copy ? copy.join(' ') : Array.from({ length: 2 + Math.floor(rnd() * 12) }, word).join(' '))
      items.push({ id: `S:${i}`, source: ['WALTER', 'STOOQ', 'ESPI'][i % 3], label: 'X', lead: '', time: t.from + Math.floor(rnd() * 13 * 3600_000),
        title: `n${i}x ${texts[i]}`,
        link: rnd() < 0.04 ? 'https://example.net/same' : `https://example.net/${i}`, ...(rnd() < 0.2 ? { translation: Array.from({ length: 8 }, word).join(' ') } : {}) })
    }
    // every pair
    const words = items.map(tokensOf)
    const count = new Map<string, number>()
    for (const w of words) for (const x of w) count.set(x, (count.get(x) ?? 0) + 1)
    const parent = items.map((_, i) => i)
    const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])))
    const join = (a: number, b: number) => { const x = find(a), y = find(b); if (x !== y) parent[Math.max(x, y)] = Math.min(x, y) }
    for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
      if (items[i].link === items[j].link) join(i, j)
      const [a, b] = [words[i], words[j]]
      const common = [...a].filter((x) => b.has(x))
      if (a.size < 3 || b.size < 3 || Math.abs(items[i].time - items[j].time) > 6 * 3600_000 || !common.some((x) => count.get(x)! <= 40)) continue
      if (common.length / (a.size + b.size - common.length) >= 0.55) join(i, j)
    }
    const expected = new Set(items.map((_, i) => items.filter((_, j) => find(j) === find(i)).map((x) => x.id).sort().join(' ')))
    const got = new Set(rank(items, { maxCandidates: 1000 }).candidates.map((c) => [...c.itemIds].sort().join(' ')))
    assert.deepEqual([...got].sort(), [...expected].sort(), `trial ${trial}`)
  }
})

test('the subject of a headline is its first word, not one that starts headlines about anything', () => {
  assert.equal(subjectOf('MICROSOFT 1Q REV. $92.3B, EST. $90.1B'), 'microsoft')
  assert.equal(subjectOf('*ALPHABET 3Q EPS $2.41, EST. $2.58'), 'alphabet')
  assert.equal(subjectOf("FED'S WALLER: A CUT IN DECEMBER IS POSSIBLE"), 'fed')
  assert.equal(subjectOf('WARSH: POLICY IS WELL POSITIONED'), 'warsh')
  assert.equal(subjectOf('Orlen: zysk netto w III kwartale wzrósł'), 'orlen')
  assert.equal(subjectOf('S&P 500 CLOSES DOWN 0.4%'), 's&p')
  for (const t of ['U.S. 10-YEAR YIELD RISES', 'USA: indeksy na zamknięciu', 'CHINA YUAN FIXING AT 7.12', 'Na GPW spadki', 'Spółka podała wyniki', 'THE DOLLAR WEAKENS',
    '10-YEAR YIELD RISES', 'BREAKING: X']) assert.equal(subjectOf(t), null, t)
})

// A night like 28/29 October 2026: the Fed's decision at 19:00 and Warsh's press conference after it, then Microsoft's and Alphabet's
// results after the US close, each as many one-line headlines in Walter Bloomberg's channel, which had all its places taken by the Fed before
test('a company\'s results in many headlines are one story and keep their place on a night of the Fed', () => {
  const night = editionTimes('2026-10-29', config)
  const at = (hhmm: string, day = '2026-10-28') => { const [h, m] = hhmm.split(':').map(Number); return new Date(Date.parse(`${day}T00:00:00Z`) + ((h - 1) * 60 + m) * 60_000).toISOString() } // CET
  const walter = (time: string, titles: string[], gap: number) => titles.map((title, i) => item('WALTER', title, new Date(Date.parse(time) + i * gap).toISOString()))
  const items = [
    ...walter(at('19:00'), ['FED HOLDS RATES AT 3.75%-4.00% IN SPLIT VOTE', 'FED: INFLATION REMAINS SOMEWHAT ELEVATED', 'FED: TWO OFFICIALS DISSENTED IN FAVOR OF A CUT', 'FED: JOB GAINS HAVE SLOWED'], 20_000),
    ...walter(at('19:30'), Array.from({ length: 12 }, (_, i) => `WARSH: ${['RATES', 'INFLATION', 'TARIFFS', 'THE DOLLAR'][i % 4]} REMARK NUMBER ${i + 1}`), 180_000),
    ...walter(at('19:05'), ['DOLLAR INDEX RISES AFTER FED', 'GOLD FALLS AFTER FED', 'BITCOIN FALLS AFTER WARSH', 'TREASURY YIELDS RISE AFTER WARSH', 'NASDAQ CLOSES DOWN 0.3%',
      'DOW CLOSES DOWN 0.6%', 'WTI CRUDE SETTLES DOWN 0.8%', 'NIKKEI FUTURES UP 0.5%'], 9 * 60_000),
    ...walter(at('21:05'), ['MICROSOFT 1Q REV. $92.3B, EST. $90.1B', 'MICROSOFT 1Q ADJ EPS $4.89, EST. $4.73', 'MICROSOFT 1Q AZURE REV. +48%', 'MICROSOFT SHARES RISE 5% POST-MARKET',
      'MICROSOFT SEES 2Q AZURE GROWTH 45%-46%'], 40_000),
    ...walter(at('21:06'), ['ALPHABET 3Q REV. $108.2B, EST. $109.5B', 'ALPHABET 3Q EPS $2.41, EST. $2.58', 'ALPHABET 3Q GOOGLE CLOUD REV. $30.7B', 'ALPHABET SHARES FALL 10% POST-MARKET'], 45_000),
  ]
  const now = Date.parse(at('07:45', '2026-10-29'))
  const r = collect(poller(items, now), night, now, { ...config, maxCandidates: 10 }) // Walter: 4 places of 10
  const titles = r.candidates.map((c) => c.title)
  const msft = r.candidates.find((c) => c.title.startsWith('MICROSOFT'))!
  const goog = r.candidates.find((c) => c.title.startsWith('ALPHABET'))!
  assert.ok(msft && goog, titles.join(' | '))
  assert.equal(msft.title, 'MICROSOFT 1Q REV. $92.3B, EST. $90.1B', 'the first headline')
  assert.deepEqual(msft.more, ['MICROSOFT 1Q ADJ EPS $4.89, EST. $4.73', 'MICROSOFT 1Q AZURE REV. +48%', 'MICROSOFT SHARES RISE 5% POST-MARKET', 'MICROSOFT SEES 2Q AZURE GROWTH 45%-46%'])
  assert.equal(goog.itemIds.length, 4)
  assert.equal(titles.filter((t) => t.startsWith('WARSH')).length, 1, 'the press conference is one story')
  assert.equal(titles.filter((t) => t.startsWith('FED')).length, 1)
})

test('one subject more than an hour apart is two stories', () => {
  const r = collect(poller([
    item('WALTER', 'TRUMP: WILL MEET XI THIS WEEK', ms('2026-10-27T19:00:00Z')),
    item('WALTER', 'TRUMP: TARIFFS ON CHINA COULD BE CUT', ms('2026-10-27T19:50:00Z')),
    item('WALTER', 'TRUMP: SIGNS ORDER ON SHIPBUILDING', ms('2026-10-27T21:30:00Z')),
  ], t.cutoff), t, t.cutoff, config)
  assert.deepEqual(r.candidates.map((c) => c.itemIds.length).sort(), [1, 2])
})

test('the Fed\'s chair moves the market like the Fed: a headline of his ranks above one about nothing in particular', () => {
  const time = ms('2026-10-27T20:00:00Z')
  const r = collect(poller([
    item('STOOQ', 'ACME OPENS NEW OFFICE IN OHIO', time),
    item('STOOQ', 'WARSH: A DECEMBER CUT IS POSSIBLE', time),
  ], t.cutoff), t, t.cutoff, config)
  assert.equal(r.candidates[0].title, 'WARSH: A DECEMBER CUT IS POSSIBLE')
  assert.ok(r.candidates[0].score > r.candidates[1].score)
})

test('investingLive is a source of the briefing by default: its items count by their date, rank above the Polish agencies, and routine notices go', () => {
  assert.ok(config.sources.includes('INVESTINGLIVE'))
  assert.equal(DATE_KIND.INVESTINGLIVE, 'published')
  const items = [
    item('INVESTINGLIVE', "Fed's Waller: a rate cut in December is possible", ms('2026-10-27T19:35:00Z'), { description: 'Waller said the labour market is cooling.' }),
    item('PAP', 'Komunikat prasowy: firma otworzyła nowe biuro w regionie', ms('2026-10-27T19:35:00Z')),
    item('INVESTINGLIVE', 'Acme Corp declares $0.25 dividend', ms('2026-10-27T20:00:00Z')),
    item('INVESTINGLIVE', 'Acme Corp Q3 2026 Earnings Call Transcript', ms('2026-10-27T20:00:00Z')),
    item('INVESTINGLIVE', 'Published before the window, ECB holds rates', ms('2026-10-27T17:59:00Z')),
  ]
  const r = collect(poller(items, t.cutoff), t, t.cutoff, config)
  assert.deepEqual(r.candidates.map((c) => c.title), ["Fed's Waller: a rate cut in December is possible", 'Komunikat prasowy: firma otworzyła nowe biuro w regionie'])
  assert.deepEqual(r.candidates[0].sources, ['INVESTINGLIVE'])
  assert.equal(r.stats.routine, 2)
  assert.equal(r.stats.outside, 1)
  // the same story from Walter and investingLive is one, with both sources
  const two = collect(poller([
    item('WALTER', 'MICROSOFT 1Q REV. $92.3B, EST. $90.1B', ms('2026-10-27T21:05:00Z')),
    item('INVESTINGLIVE', 'Microsoft 1Q revenue $92.3B vs $90.1B expected', ms('2026-10-27T21:06:00Z')),
  ], t.cutoff), t, t.cutoff, config)
  assert.equal(two.candidates.length, 1)
  assert.deepEqual(two.candidates[0].sources.sort(), ['INVESTINGLIVE', 'WALTER'])
})

test('crypto and commodities keep places on a night when the macro data and the company results take them all', () => {
  // 40 stories of the macro kind from five sources, each with a first word of its own (so that none is put with another), and five of crypto and commodities
  const sources = ['WALTER', 'STOOQ', 'ESPI', 'GPW', 'PAP']
  const macro = Array.from({ length: 40 }, (_, i) => item(sources[i % 5], `Alfa${i}x inflation and rates headline w${i}y`, ms(`2026-10-27T${19 + (i % 4)}:${10 + (i % 40)}:00Z`)))
  const specials = [
    item('INVESTINGLIVE', 'Binance appears hacked, CZ says, as Tether and Circle freeze $1.79B in stablecoins', ms('2026-10-27T21:55:00Z')),
    item('INVESTINGLIVE', 'Bitcoin falls 6% as crypto liquidations pass $2B', ms('2026-10-27T21:20:00Z')),
    item('INVESTINGLIVE', 'WTI crude oil falls 5% on a surprise build in stocks', ms('2026-10-27T22:10:00Z')),
    item('STOOQ', 'Złoto drożeje o 2%, srebro o 3%', ms('2026-10-27T22:20:00Z')),
    item('STOOQ', 'Miedź najdroższa od roku', ms('2026-10-27T22:30:00Z')),
    item('PAP', 'Cena pszenicy i kukurydzy rośnie, drożeje też cukier', ms('2026-10-27T22:40:00Z')), // a fourth commodity story, with a low score: out
  ]
  const without = collect(poller(macro, t.cutoff), t, t.cutoff, { ...config, maxCandidates: 12 })
  assert.equal(without.candidates.length, 12)
  const r = collect(poller([...macro, ...specials], t.cutoff), t, t.cutoff, { ...config, maxCandidates: 12 })
  const titles = r.candidates.map((c) => c.title)
  assert.equal(r.candidates.length, 12)
  for (const wanted of ['Binance appears hacked', 'Bitcoin falls 6%', 'WTI crude oil', 'Złoto drożeje', 'Miedź najdroższa']) assert.ok(titles.some((x) => x.startsWith(wanted)), `${wanted}: ${titles.join(' | ')}`)
  assert.ok(!titles.some((x) => x.startsWith('Cena pszenicy')), 'three places for a topic: its fourth story is not kept for that')
  // ids follow the order of the score
  assert.deepEqual(r.candidates.map((c) => c.id), r.candidates.map((_, i) => `c${i + 1}`))
  assert.ok(r.candidates.every((c, i) => i === 0 || r.candidates[i - 1].score >= c.score))
  // with room for all of them nothing is moved
  const roomy = collect(poller([...macro, ...specials], t.cutoff), t, t.cutoff, { ...config, maxCandidates: 120 })
  assert.equal(roomy.candidates.length, macro.length + specials.length)
})

test('the words of crypto and of commodities count like the other movers', () => {
  const time = ms('2026-10-27T20:00:00Z')
  const r = collect(poller([
    item('STOOQ', 'ACME OPENS NEW OFFICE IN OHIO', time),
    item('STOOQ', 'Kryptowaluty tracą po ataku na giełdę', time),
    item('STOOQ', 'Ceny ropy i gazu w górę po decyzji OPEC', time),
  ], t.cutoff), t, t.cutoff, config)
  assert.equal(r.candidates[2].title, 'ACME OPENS NEW OFFICE IN OHIO')
  assert.ok(r.candidates[0].score > r.candidates[2].score && r.candidates[1].score > r.candidates[2].score)
})
