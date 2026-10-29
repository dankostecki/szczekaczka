// investingLive's general feed (https://investinglive.com/feed/): all its categories in one channel, the lead translated, and the sections that are no news left out of the briefing.
// The fixture has the structure of the feed as read on 29 October 2026 (RSS 2.0 with the content, dc, atom and sy namespaces; a CDATA title; the date in GMT; two dc:creator;
// a category; comments and guid; the link; a description of a few thousand characters of HTML: paragraphs, lists, a quote), with texts of its own
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { collect } from '../worker/briefing/collect'
import { readConfig } from '../worker/briefing/config'
import { editionTimes } from '../worker/briefing/time'
import { checkFeed } from '../worker/feeds'
import { translateNew } from '../worker/translate'
import { FEEDS, labelsOf } from '../src/lib/sources'
import { tagOf } from '../src/lib/news'
import { poller } from './briefing/helpers'

const feed = FEEDS.find((f) => f.source === 'INVESTINGLIVE')!

const paragraph = (n: number) => `Paragraph ${n} says that the move is about positioning more than news, and that traders should watch the next print, the next auction and the next statement before they decide.`
const description = (first: string) => `
                        <![CDATA[
                            <p dir="ltr"> ${first} ${paragraph(1)} ${paragraph(2)}</p>
<p dir="ltr">${paragraph(3)} ${paragraph(4)}</p><ul><li>Level one is the 200-hour moving average.</li><li>Level two is last week's high.</li></ul>
<blockquote><p>${paragraph(5)}</p></blockquote><p>${paragraph(6)} ${paragraph(7)} ${paragraph(8)} ${paragraph(9)} ${paragraph(10)} ${paragraph(11)} ${paragraph(12)} ${paragraph(13)}</p>
                        ]]>
                    `
const POSTS = [
  { at: '2026-10-29T22:53:09Z', section: 'central-banks', category: 'Central Banks', slug: 'rba-set-for-a-second-hike', title: 'RBA set for back-to-back hike after hot CPI, says a bank economist', first: 'A second hike would extend the rate advantage of the Australian dollar.' },
  { at: '2026-10-29T22:17:20Z', section: 'stocks', category: 'Stocks', slug: 'intel-earnings-call', title: 'Intel earnings call: 18A progress and data centre growth offset by PC slump', first: 'The call is unlikely to reverse the after-hours drop.' },
  { at: '2026-10-29T21:55:57Z', section: 'cryptocurrency', category: 'Cryptocurrency', slug: 'exchange-hack', title: 'Exchange appears hacked, its founder says, as stablecoin issuers freeze $1.79B', first: 'The comments take away part of the uncertainty.' },
  { at: '2026-10-29T20:14:00Z', section: 'news', category: 'News', slug: 'americas-wrap', title: 'investingLive Americas market news wrap: ECB holds, sources say December hike', first: 'Stocks fell.' },
  { at: '2026-10-29T18:40:00Z', section: 'technical-analysis', category: 'Technical Analysis', slug: 'usdchf-support', title: 'USDCHF tests key support as sellers challenge the 200-hour moving average', first: 'The pair is at support.' },
  { at: '2026-10-29T19:54:00Z', section: 'commodities', category: 'Commodities', slug: 'wti-rebounds', title: 'WTI crude oil rebounds after a failed break below $100 and the 200-hour MA', first: 'Crude found buyers at the average.' },
  { at: '2026-10-29T19:30:00Z', section: 'commodities', category: 'Commodities', slug: 'gold-slips', title: 'Gold slips below its 100-hour MA as interest-rate concerns weigh on the recovery', first: 'Gold gave up the gains of the week.' },
]
const rss = (posts = POSTS) => `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"
     xmlns:content="http://purl.org/rss/1.0/modules/content/"
     xmlns:dc="http://purl.org/dc/elements/1.1/"
     xmlns:atom="http://www.w3.org/2005/Atom"
     xmlns:sy="http://purl.org/rss/1.0/modules/syndication/">
    <channel>
        <title>Investinglive RSS Breaking News Feed</title>
        <atom:link href="https://investinglive.com/feed/" rel="self" type="application/rss+xml"/>
        <link>https://investinglive.com/</link>
        <lastBuildDate>Thu, 29 Oct 2026 23:00:09 GMT</lastBuildDate>
        <category>News</category>
        <sy:updatePeriod>hourly</sy:updatePeriod>
        <image><url>https://images.example.com/logo.svg</url><title>Investinglive RSS Breaking News Feed</title><link>https://investinglive.com/</link></image>

${posts.map((p) => `        <item>
            <title><![CDATA[${p.title}]]></title>
            <pubDate>${new Date(p.at).toUTCString()}</pubDate>
            <dc:creator><![CDATA[An Author]]></dc:creator>
            <dc:creator>investinglive.com</dc:creator>
            <category><![CDATA[${p.category}]]></category>

                <comments>https://investinglive.com/${p.section}/${p.slug}/#respond</comments>
                <guid isPermaLink="true">https://investinglive.com/${p.section}/${p.slug}/</guid>

                    <link>https://investinglive.com/${p.section}/${p.slug}/</link>

                    <description>${description(p.first)}</description>
        </item>`).join('\n')}
    </channel>
</rss>`

let served = rss()
globalThis.fetch = (async () => new Response(served, { headers: { 'content-type': 'application/rss+xml' } })) as typeof fetch
const NOW = Date.parse('2026-10-29T23:05:00Z')

test('one channel from the general feed: all the categories in it, shown as INVESTINGLIVE', () => {
  const channels = FEEDS.filter((f) => f.source === 'INVESTINGLIVE')
  assert.equal(channels.length, 1)
  assert.equal(feed.url, 'https://investinglive.com/feed/')
  assert.ok(feed.lang === 'en' && feed.translate && feed.translateLeadOnly && feed.translatePerDay! > 0)
  assert.deepEqual(labelsOf('INVESTINGLIVE'), ['WIADOMOŚCI'])
  assert.equal(tagOf({ source: 'INVESTINGLIVE', label: 'WIADOMOŚCI' } as never), 'INVESTINGLIVE')
})

test('the posts as the feed has them: every section, the title, the link, the time, a lead of 500 characters at most and the text in lines', async () => {
  const r = await checkFeed(feed, undefined, feed.url, NOW)
  assert.equal(r.add.length, POSTS.length)
  const by = new Map(r.add.map((i) => [i.link.split('/')[3], i]))
  assert.deepEqual([...by.keys()].sort(), ['central-banks', 'commodities', 'cryptocurrency', 'news', 'stocks', 'technical-analysis'])
  const oil = r.add.find((i) => i.title.startsWith('WTI crude oil'))!
  assert.equal(oil.link, 'https://investinglive.com/commodities/wti-rebounds/')
  assert.equal(oil.pubDate, '2026-10-29T19:54:00.000Z')
  assert.equal(oil.source, 'INVESTINGLIVE')
  assert.ok(oil.description.startsWith('Crude found buyers at the average.'))
  assert.ok(oil.description.length <= 500 && oil.description.endsWith('…'), `${oil.description.length}`)
  assert.ok(oil.body && oil.body.length <= 3000 && oil.body.split('\n').length > 3, 'the text in lines (paragraphs and list items)')
  assert.ok(!/[<>]|CDATA/.test(`${oil.title}${oil.description}${oil.body}`), 'no markup')
  // read again, nothing changed: nothing new
  const again = await checkFeed(feed, r.state, feed.url, NOW + 120_000)
  assert.equal(again.changed, false)
  // a new post on top
  served = rss([{ at: '2026-10-29T23:01:00Z', section: 'commodities', category: 'Commodities', slug: 'silver-jumps', title: 'Silver jumps 3% as the dollar slides', first: 'Silver rallied.' }, ...POSTS])
  const next = await checkFeed(feed, r.state, feed.url, NOW + 240_000)
  assert.deepEqual(next.add.map((i) => i.title), ['Silver jumps 3% as the dollar slides'])
  served = rss()
})

test('the morning briefing takes commodities, stocks and central banks, and leaves out the technical analysis', async () => {
  const r = await checkFeed(feed, undefined, feed.url, NOW)
  const { config } = readConfig({})
  const t = editionTimes('2026-10-30', config)
  const at = Date.parse('2026-10-30T05:00:00Z') // the cutoff
  const c = collect(poller(r.add, at), t, at, config)
  const titles = c.candidates.map((x) => x.title)
  assert.equal(c.stats.routine, 1)
  assert.ok(!titles.some((x) => x.startsWith('USDCHF')), 'technical analysis is not a story')
  for (const wanted of ['WTI crude oil', 'Gold slips', 'Intel earnings call', 'RBA set for']) assert.ok(titles.some((x) => x.startsWith(wanted)), wanted)
  assert.equal(c.candidates.length, POSTS.length - 1)
})

test('translated: the title and the lead only, never the text, and the translation has no text of its own', async () => {
  const r = await checkFeed(feed, undefined, feed.url, NOW)
  const sent: string[] = []
  const ai = { run: async (_m: string, input: { messages: { role: string; content: string }[] }) => {
    sent.push(input.messages.at(-1)!.content)
    return { choices: [{ message: { content: 'Tytuł\nZajawka po polsku' } }], usage: { prompt_tokens: 900, completion_tokens: 40 } }
  } } as unknown as Ai
  await translateNew(ai, r, NOW, { perDay: feed.translatePerDay, leadOnly: feed.translateLeadOnly })
  assert.equal(sent.length, POSTS.length)
  const oil = r.add.find((i) => i.title.startsWith('WTI crude oil'))!
  const asked = sent.find((s) => s.startsWith('WTI crude oil'))!
  assert.equal(asked, `${oil.title}\n${oil.description}`)
  assert.ok(!asked.includes('Level one is the 200-hour moving average'), 'the list of the text is not sent')
  const done = r.state.items.find((i) => i.id === oil.id)!
  assert.deepEqual(done.pl, { title: 'Tytuł', description: 'Zajawka po polsku' })
  // without the option the text goes along (the other channels' posts have none, or a short one)
  const whole = await checkFeed(feed, undefined, feed.url, NOW)
  const sentWhole: string[] = []
  const ai2 = { run: async (_m: string, input: { messages: { content: string }[] }) => { sentWhole.push(input.messages.at(-1)!.content); return { choices: [{ message: { content: 'T\nZ\nZ2' } }], usage: {} } } } as unknown as Ai
  await translateNew(ai2, whole, NOW, { perDay: 1 })
  assert.ok(sentWhole[0].includes('Level one is the 200-hour moving average'))
})
