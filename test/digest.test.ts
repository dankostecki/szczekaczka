// The owner's technical file of the last 24 hours (worker/digest.ts): what is in it, as published and with its rating, and when it is made
import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { NewsItem } from '../src/lib/parse'
import type { FeedState } from '../worker/feeds'
import { buildDigest, DIGEST_PART, DIGEST_VERSION, digestDue, nextDigestAt, partsOf } from '../worker/digest'

const NOW = Date.parse('2026-11-20T07:30:00Z') // 8:30 in Warsaw (winter time)
const ago = (h: number) => new Date(NOW - h * 3600_000).toISOString()
const state = (items: NewsItem[]): FeedState => ({ items, error: null, checkedAt: NOW })

test('the news of the last 24 hours, newest first, as published (no translation), with the rating and its step; none of little importance', () => {
  const feeds = new Map<string, FeedState>([
    ['WALTER:TELEGRAM', state([
      { id: 'w1', title: 'GOLD AT THREE-MONTH LOW', description: '', link: 'https://t.me/WalterBloomberg/1', pubDate: ago(1), source: 'WALTER', label: 'TELEGRAM', ai: 8.27,
        pl: { title: 'Złoto najniżej od trzech miesięcy', description: '' } },
      { id: 'w2', title: 'OLD NEWS', description: '', link: 'https://t.me/WalterBloomberg/2', pubDate: ago(25), source: 'WALTER', label: 'TELEGRAM', ai: 9 },
    ])],
    ['INVESTINGLIVE:WIADOMOŚCI', state([
      { id: 'i1', title: 'Fed cuts rates', description: 'The FOMC voted 10-2.', body: 'The FOMC voted 10-2.\n- Two dissents', link: 'https://investinglive.com/a', pubDate: ago(3),
        source: 'INVESTINGLIVE', label: 'WIADOMOŚCI', ai: 6.5, pl: { title: 'Fed obniża stopy', description: 'FOMC 10-2.' } },
    ])],
    ['STOOQ:BIZNES', state([
      { id: 's1', title: 'Orlen: zysk wzrósł', description: 'Koncern podał wyniki.', link: 'https://stooq.pl/n/?f=1', pubDate: ago(2), source: 'STOOQ', label: 'BIZNES', ai: null },
      { id: 's3', title: 'Spokojna', description: '', link: 'https://stooq.pl/n/?f=3', pubDate: ago(0.5), source: 'STOOQ', label: 'BIZNES', ai: 2 },
      { id: 's4', title: 'Umiarkowana', description: '', link: 'https://stooq.pl/n/?f=4', pubDate: ago(0.6), source: 'STOOQ', label: 'BIZNES', ai: 5.9 },
      { id: 's2', title: 'Bez daty', description: '', link: 'https://stooq.pl/n/?f=2', pubDate: '', source: 'STOOQ', label: 'BIZNES' },
    ])],
  ])
  const d = JSON.parse(buildDigest(feeds, NOW))
  assert.equal(d.window.hours, 24)
  assert.equal(d.generatedAt, '2026-11-20T07:30:00.000Z')
  assert.equal(d.generatedWarsaw, '2026-11-20 08:30')
  assert.deepEqual(d.news.map((n: { id: string }) => n.id), ['w1', 's1', 'i1'], 'newest first; older than a day, undated, and of steps 1 and 2 left out')
  const [w, s, i] = d.news
  assert.equal(w.title, 'GOLD AT THREE-MONTH LOW', 'the original, not the translation')
  assert.equal(JSON.stringify(d).includes('Złoto'), false, 'no translation anywhere')
  assert.deepEqual(w.importance, { score: 8.3, level: 4, name: 'bardzo ważna' })
  assert.equal(w.text, undefined, 'no text when the source gives none')
  assert.equal(i.text, 'The FOMC voted 10-2.\n- Two dissents', 'the whole text where there is one')
  assert.deepEqual(i.importance, { score: 6.5, level: 3, name: 'ważna' })
  assert.equal(s.importance, null, 'a news not rated')
  assert.equal(s.sourceName, 'STOOQ')
  assert.equal(s.channel, 'BIZNES')
  assert.equal(s.publishedWarsaw, '2026-11-20 06:30')
  assert.deepEqual(d.counts, { news: 3, byLevel: { 4: 1, 3: 1, none: 1 }, skippedLowImportance: 2 })
  assert.deepEqual(Object.keys(d.sources).sort(), ['INVESTINGLIVE', 'STOOQ', 'WALTER'])
})

test('made at 8:30 Polish time each day, once; one made before that (right after a deploy) is replaced at 8:30', () => {
  const at = (iso: string) => Date.parse(iso)
  assert.equal(digestDue(at('2026-11-20T07:29:00Z'), null), null, '8:29 in Warsaw: not yet')
  assert.equal(digestDue(at('2026-11-20T07:30:00Z'), null), '2026-11-20')
  assert.equal(digestDue(at('2026-11-20T07:30:00Z'), { forDay: null, builtAt: 0, parts: 1 }), '2026-11-20', 'one made at once is replaced')
  assert.equal(digestDue(at('2026-11-20T15:00:00Z'), { forDay: '2026-11-20', builtAt: 0, parts: 1, version: DIGEST_VERSION }), null, 'once a day')
  assert.equal(digestDue(at('2026-11-21T07:31:00Z'), { forDay: '2026-11-20', builtAt: 0, parts: 1, version: DIGEST_VERSION }), '2026-11-21')
  // a file made like an older version (with the news of little importance): made again at once
  assert.equal(digestDue(at('2026-11-20T15:00:00Z'), { forDay: '2026-11-20', builtAt: 0, parts: 1, version: 1 }), '2026-11-20')
  assert.equal(digestDue(at('2026-11-20T15:00:00Z'), { forDay: '2026-11-20', builtAt: 0, parts: 1 }), '2026-11-20')
  // summer time: 8:30 in Warsaw is 6:30 UTC
  assert.equal(digestDue(at('2026-07-01T06:29:00Z'), null), null)
  assert.equal(digestDue(at('2026-07-01T06:30:00Z'), null), '2026-07-01')
  assert.equal(new Date(nextDigestAt(at('2026-11-20T07:00:00Z'))).toISOString(), '2026-11-20T07:30:00.000Z')
  assert.equal(new Date(nextDigestAt(at('2026-11-20T08:00:00Z'))).toISOString(), '2026-11-21T07:30:00.000Z')
})

test('kept in parts small enough for a row of SQLite, put back together as it was', () => {
  const json = 'x'.repeat(DIGEST_PART * 2 + 17)
  const parts = partsOf(json)
  assert.equal(parts.length, 3)
  assert.equal(parts.join(''), json)
  assert.deepEqual(partsOf(''), [''])
})
