// The public preview of a Telegram channel (parseTelegram in src/lib/parse.ts): a mark before the headline that a copy of a channel adds is left out
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseTelegram } from '../src/lib/parse'
import { FEEDS } from '../src/lib/sources'

const feed = FEEDS.find((f) => f.source === 'WALTER')!
const post = (id: number, text: string, at: string) =>
  `<div class="tgme_widget_message text_not_supported_wrap js-widget_message" data-post="walter_bloomberg/${id}" data-view="x">` +
  `<div class="tgme_widget_message_text js-message_text" dir="auto">${text}</div>` +
  `<a class="tgme_widget_message_date" href="https://t.me/walter_bloomberg/${id}"><time datetime="${at}" class="time">17:03</time></a></div>`

test('Walter Bloomberg is read from @walter_bloomberg, its "🚨" before each headline left out', () => {
  assert.equal(feed.url, 'https://t.me/s/walter_bloomberg')
  const html = post(39245, '🚨 $ANT - *ANTHROPIC SHARES SURGE 10%, HIT SESSION HIGH', '2026-11-27T17:03:38+00:00') +
    post(39246, '🚨🚨 FED&#39;S WALLER: CUTS STILL LIKELY<br/>MORE TO COME', '2026-11-27T18:08:06+00:00') +
    post(39247, '⚠️ OIL JUMPS 3%', '2026-11-27T18:20:00+00:00') +
    post(39248, '🚨<br/>US 10-YEAR YIELD AT 4.1%', '2026-11-27T18:25:00+00:00') +
    post(39249, 'NO MARK HERE 📈 WITH ONE INSIDE', '2026-11-27T18:28:26+00:00')
  const items = parseTelegram(html, feed)
  assert.deepEqual(items.map((i) => i.title), [
    '$ANT - *ANTHROPIC SHARES SURGE 10%, HIT SESSION HIGH', "FED'S WALLER: CUTS STILL LIKELY", 'OIL JUMPS 3%', 'US 10-YEAR YIELD AT 4.1%', 'NO MARK HERE 📈 WITH ONE INSIDE'])
  assert.equal(items[1].description, 'MORE TO COME')
  assert.equal(items[0].link, 'https://t.me/walter_bloomberg/39245')
})
