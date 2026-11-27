// The owner's technical files of the news (worker/digest.ts): what is in them, as published and with the rating, their spans and when they are made
import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { NewsItem } from '../src/lib/parse'
import type { FeedState } from '../worker/feeds'
import { buildDigest, DIGEST_PART, DIGEST_VERSION, DIGESTS, digestDue, digestOf, lastEnded, nextDigestAt, partsOf, spanOf } from '../worker/digest'

const DAY = DIGESTS[0]

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
  const d = JSON.parse(buildDigest(feeds, NOW, { from: NOW - 24 * 3600_000, to: NOW }))
  assert.equal(d.window.hours, 24)
  assert.equal(d.window.name, '24 godziny do 8:30')
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

test('four files, each at its address, each the latest span of its kind that has ended, made once', () => {
  const at = (iso: string) => Date.parse(iso)
  assert.deepEqual(DIGESTS.map((d) => d.path), ['/api/digest.json', '/api/digest-night.json', '/api/digest-morning.json', '/api/digest-midday.json'])
  assert.equal(digestOf('/api/digest-morning.json')!.key, 'morning')
  assert.equal(digestOf('/api/digest-evening.json'), undefined)
  // the spans, Polish time (winter: UTC+1)
  const span = (key: string, day: string) => { const s = spanOf(DIGESTS.find((d) => d.key === key)!, day); return [new Date(s.from).toISOString(), new Date(s.to).toISOString()] }
  assert.deepEqual(span('day', '2026-11-27'), ['2026-11-26T07:30:00.000Z', '2026-11-27T07:30:00.000Z'])
  assert.deepEqual(span('night', '2026-11-27'), ['2026-11-26T15:00:00.000Z', '2026-11-27T06:30:00.000Z'], '16:00 the day before to 7:30')
  assert.deepEqual(span('morning', '2026-11-27'), ['2026-11-27T06:30:00.000Z', '2026-11-27T10:40:00.000Z'], '7:30 to 11:40')
  assert.deepEqual(span('midday', '2026-11-27'), ['2026-11-27T10:40:00.000Z', '2026-11-27T14:40:00.000Z'], '11:40 to 15:40')
  // summer time: 7:30 in Warsaw is 5:30 UTC
  assert.deepEqual(span('night', '2026-07-01'), ['2026-06-30T14:00:00.000Z', '2026-07-01T05:30:00.000Z'])
  // which span has ended: at 10:00 in Warsaw today's night and day spans, yesterday's morning and midday
  const ten = at('2026-11-27T09:00:00Z')
  assert.deepEqual(DIGESTS.map((d) => lastEnded(d, ten)), ['2026-11-27', '2026-11-27', '2026-11-26', '2026-11-26'])
  // due: not made yet, made for another day, or by an older version; made for it: not again
  const night = DIGESTS[1]
  assert.equal(digestDue(night, ten, null), '2026-11-27')
  assert.equal(digestDue(night, ten, { forDay: '2026-11-26', builtAt: 0, parts: 1, version: DIGEST_VERSION }), '2026-11-27')
  assert.equal(digestDue(night, ten, { forDay: '2026-11-27', builtAt: 0, parts: 1, version: DIGEST_VERSION }), null)
  assert.equal(digestDue(night, ten, { forDay: '2026-11-27', builtAt: 0, parts: 1, version: 3 }), '2026-11-27')
  assert.equal(digestDue(DAY, at('2026-11-27T07:29:00Z'), { forDay: '2026-11-26', builtAt: 0, parts: 1, version: DIGEST_VERSION }), null, '8:29: yesterday\'s is still the latest')
  assert.equal(digestDue(DAY, at('2026-11-27T07:30:00Z'), { forDay: '2026-11-26', builtAt: 0, parts: 1, version: DIGEST_VERSION }), '2026-11-27')
  assert.equal(new Date(nextDigestAt(DIGESTS[3], ten)).toISOString(), '2026-11-27T14:40:00.000Z')
  assert.equal(new Date(nextDigestAt(night, ten)).toISOString(), '2026-11-28T06:30:00.000Z')
})

test('kept in parts small enough for a row of SQLite, put back together as it was', () => {
  const json = 'x'.repeat(DIGEST_PART * 2 + 17)
  const parts = partsOf(json)
  assert.equal(parts.length, 3)
  assert.equal(parts.join(''), json)
  assert.deepEqual(partsOf(''), [''])
})

test('a file made after its span (after a deploy) still holds its span, not up to the moment it was made', () => {
  const later = Date.parse('2026-11-20T09:40:00Z')
  const item = (id: string, iso: string): NewsItem => ({ id, title: id, description: '', link: `https://t.me/x/${id}`, pubDate: iso, source: 'WALTER', label: 'TELEGRAM', ai: 9 })
  const feeds = new Map([['WALTER:TELEGRAM', state([item('after', '2026-11-20T08:00:00Z'), item('before', '2026-11-20T07:00:00Z'), item('day-before', '2026-11-19T07:40:00Z'), item('too-old', '2026-11-19T07:20:00Z')])]])
  const d = JSON.parse(buildDigest(feeds, later, spanOf(DAY, '2026-11-20')))
  assert.deepEqual(d.news.map((n: { id: string }) => n.id), ['before', 'day-before'])
  assert.equal(d.window.to, '2026-11-20T07:30:00.000Z')
  assert.equal(d.window.toWarsaw, '2026-11-20 08:30')
  assert.equal(d.generatedAt, '2026-11-20T09:40:00.000Z')
})
