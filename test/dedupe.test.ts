// A source with a broad channel (investingLive: the general feed has the posts of the central bank and crypto feeds too): a post is shown in
// the narrower channel only, whichever channel sees it first; and the feed's reading with `skip`
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { dropDuplicates, heldLinks } from '../worker/dedupe'
import { checkFeed, type FeedState } from '../worker/feeds'
import { FEEDS, feedKey, type FeedConfig } from '../src/lib/sources'

const feed = (label: string) => FEEDS.find((f) => f.source === 'INVESTINGLIVE' && f.label === label)!
const [NEWS, CB, CRYPTO] = ['WIADOMOŚCI', 'BANKI CENTRALNE', 'KRYPTO'].map(feed)

// RSS 2.0 as such feeds are usually made (the real feed could not be read from the build machine): CDATA leads, dc:creator, a guid, RFC 822 dates
const rss = (items: { title: string; slug: string; at: string; lead: string }[]) => `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:content="http://purl.org/rss/1.0/modules/content/"><channel><title>investingLive</title><link>https://investinglive.com</link>
${items.map((i) => `<item><title>${i.title}</title><link>https://investinglive.com/news/${i.slug}/</link><guid isPermaLink="false">${i.slug}</guid><dc:creator>Author</dc:creator>
<pubDate>${new Date(i.at).toUTCString()}</pubDate><description><![CDATA[<p>${i.lead}</p>]]></description></item>`).join('\n')}</channel></rss>`

const WALLER = { title: "Fed's Waller: a rate cut in December is possible", slug: 'fed-waller-20261028', at: '2026-10-28T19:35:00Z', lead: 'Waller said the labour market is cooling.' }
const GOLD = { title: 'Gold rises 0.5% as the dollar slips', slug: 'gold-20261028', at: '2026-10-28T19:40:00Z', lead: 'Spot gold is up.' }
const BTC = { title: 'Bitcoin falls 2% after the Fed', slug: 'bitcoin-20261028', at: '2026-10-28T19:50:00Z', lead: 'Bitcoin slipped below $100k.' }

// checkFeed reads the network: its fetch is the page's
const served = new Map<string, string>()
globalThis.fetch = (async (url: string | URL | Request) => {
  const body = served.get(String(url))
  return body === undefined ? new Response('no', { status: 404 }) : new Response(body, { headers: { 'content-type': 'application/rss+xml' } })
}) as typeof fetch
const NOW = Date.parse('2026-10-28T20:00:00Z')
async function check(f: FeedConfig, states: Map<string, FeedState>, items: Parameters<typeof rss>[0]) {
  served.set(f.url, rss(items))
  const r = await checkFeed(f, states.get(feedKey(f.source, f.label)), f.url, NOW, f.leads, heldLinks(f, FEEDS, states))
  states.set(feedKey(f.source, f.label), r.state)
  return r
}
const titles = (states: Map<string, FeedState>, f: FeedConfig) => (states.get(feedKey(f.source, f.label))?.items ?? []).map((i) => i.title)

test('the channels of investingLive: English, translated, the general one broad; the others are not', () => {
  assert.equal(NEWS.url, 'https://investinglive.com/feed/news/')
  assert.equal(CB.url, 'https://investinglive.com/feed/centralbank/')
  assert.equal(CRYPTO.url, 'https://investinglive.com/feed/cryptocurrency/')
  for (const f of [NEWS, CB, CRYPTO]) assert.ok(f.lang === 'en' && f.translate && f.translatePerDay! > 0, f.label)
  assert.deepEqual([NEWS.broad, CB.broad, CRYPTO.broad], [true, undefined, undefined])
})

test('an item is read from the feed as it is: title, link, the lead without markup, the date it was published', async () => {
  const states = new Map<string, FeedState>()
  const r = await check(CB, states, [WALLER])
  assert.equal(r.add.length, 1)
  const it = r.add[0]
  assert.equal(it.title, WALLER.title)
  assert.equal(it.link, 'https://investinglive.com/news/fed-waller-20261028/')
  assert.equal(it.description, 'Waller said the labour market is cooling.')
  assert.equal(it.pubDate, '2026-10-28T19:35:00.000Z')
  assert.equal(it.source, 'INVESTINGLIVE')
  assert.equal(it.label, 'BANKI CENTRALNE')
})

test('the broad channel leaves out what a narrower one holds: the narrow one is read first', async () => {
  const states = new Map<string, FeedState>()
  await check(CB, states, [WALLER])
  const r = await check(NEWS, states, [WALLER, GOLD])
  assert.deepEqual(r.add.map((i) => i.title), [GOLD.title])
  assert.deepEqual(titles(states, NEWS), [GOLD.title])
  assert.deepEqual(titles(states, CB), [WALLER.title])
  // read again, the feed unchanged and then with a new item: still not there
  await check(NEWS, states, [WALLER, GOLD])
  const next = await check(NEWS, states, [BTC, WALLER, GOLD])
  assert.deepEqual(next.add.map((i) => i.title), [BTC.title])
})

test('the broad channel read first: the narrow one gets the item and it goes from the broad one, once', async () => {
  const states = new Map<string, FeedState>()
  await check(NEWS, states, [BTC, WALLER, GOLD])
  assert.equal(titles(states, NEWS).length, 3)
  const newsKey = feedKey('INVESTINGLIVE', 'WIADOMOŚCI')
  const wallerId = states.get(newsKey)!.items.find((i) => i.title === WALLER.title)!.id
  const r = await check(CB, states, [WALLER])
  const gone = dropDuplicates(CB, FEEDS, states, r.add)
  assert.deepEqual([...gone.keys()], [newsKey])
  assert.deepEqual(gone.get(newsKey), [wallerId])
  assert.deepEqual(titles(states, NEWS).sort(), [BTC.title, GOLD.title].sort())
  assert.deepEqual(titles(states, CB), [WALLER.title])
  // the broad feed read again: the item is not brought back
  const again = await check(NEWS, states, [BTC, WALLER, GOLD])
  assert.deepEqual(again.add, [])
  assert.deepEqual(titles(states, NEWS).sort(), [BTC.title, GOLD.title].sort())
  // nothing is taken out twice
  assert.equal(dropDuplicates(CB, FEEDS, states, r.add).size, 0)
})

test('two narrow channels do not touch each other, nor does a broad one take from a narrow one', async () => {
  const states = new Map<string, FeedState>()
  await check(CB, states, [WALLER])
  const r = await check(CRYPTO, states, [WALLER, BTC]) // the same post in two narrow channels: both keep it
  assert.equal(r.add.length, 2)
  assert.equal(dropDuplicates(CRYPTO, FEEDS, states, r.add).size, 0)
  assert.equal(heldLinks(CB, FEEDS, states).size, 0, 'only a broad channel has links to leave out')
  assert.equal(dropDuplicates(NEWS, FEEDS, states, r.add).size, 0, 'a broad channel takes nothing from the others')
})

test('a link with a query is the same post (utm tags), and another source\'s link is not', async () => {
  const states = new Map<string, FeedState>()
  await check(CB, states, [WALLER])
  const tagged = { ...WALLER, slug: 'fed-waller-20261028/?utm_source=rss' }
  const r = await check(NEWS, states, [tagged])
  assert.deepEqual(r.add, [])
  // another source holding the same address is not a narrower channel of this one
  const stooq = FEEDS.find((f) => f.source === 'STOOQ')!
  const other = new Map<string, FeedState>([[feedKey(stooq.source, stooq.label), { items: [{ id: 'x', title: 't', description: '', link: WALLER.slug, pubDate: '', source: 'STOOQ', label: 'ŚWIAT' }], error: null, checkedAt: 0 }]])
  assert.equal(heldLinks(NEWS, FEEDS, other).size, 0)
})
