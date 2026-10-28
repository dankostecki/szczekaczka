// The script: the greeting in words, the checks in code, and the parts for the voice (bytes, sentences, the text kept whole)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chunkText, dayOrdinal, greeting, hourWords, lintScript, scriptText, splitSentences, wordCount, SIGN_OFF, type Script } from '../../worker/briefing/script'

const bytes = (s: string) => new TextEncoder().encode(s).length

test('the date and the hours in words, as a newsreader says them', () => {
  assert.equal(dayOrdinal(1), 'pierwszy')
  assert.equal(dayOrdinal(12), 'dwunasty')
  assert.equal(dayOrdinal(20), 'dwudziesty')
  assert.equal(dayOrdinal(28), 'dwudziesty ósmy')
  assert.equal(dayOrdinal(31), 'trzydziesty pierwszy')
  assert.equal(hourWords('06:00'), 'szóstej')
  assert.equal(hourWords('19:00'), 'dziewiętnastej')
  assert.equal(hourWords('06:30'), 'szóstej trzydzieści')
  assert.equal(hourWords('05:45'), 'piątej czterdzieści pięć')
  assert.equal(hourWords('06:05'), 'szóstej zero pięć')
  assert.equal(greeting('2026-10-28', '19:00', '06:00'),
    'Dzień dobry. Jest środa, dwudziesty ósmy października. Oto poranny przegląd rynków: najważniejsze wiadomości od wczoraj, od godziny dziewiętnastej, do dziś do godziny szóstej.')
  assert.match(greeting('2026-11-02', '19:00', '06:00'), /Jest poniedziałek, drugi listopada/)
})

const claims = new Map([['s1', new Map([['s1c1', 'Przychody Nvidii wyniosły 57 miliardów dolarów, o 62 procent więcej niż przed rokiem']])],
  ['s2', new Map([['s2c1', 'Rezerwa Federalna obniżyła stopy o 25 punktów bazowych, do przedziału od 3,5 do 3,75 procent']])]])
const ctx = { storyIds: ['s1', 's2'], claims, minWords: 20, maxWords: 200, years: [2026, 2025] }
const good = (): Script => ({
  intro: greeting('2026-10-28', '19:00', '06:00'),
  segments: [
    { storyId: 's1', headline: 'Nvidia z rekordowymi przychodami', text: 'Nvidia podała, że jej przychody wyniosły 57 miliardów dolarów. To o 62 procent więcej niż przed rokiem.', claimIds: ['s1c1'] },
    { storyId: 's2', headline: 'Fed tnie stopy', text: 'Rezerwa Federalna obniżyła wczoraj stopy procentowe o 25 punktów bazowych, do przedziału od 3,5 do 3,75 procent.', claimIds: ['s2c1'] },
  ],
  outro: SIGN_OFF,
})

test('a good script passes the checks in code', () => {
  assert.deepEqual(lintScript(good(), ctx), [])
})

test('what a voice reads badly or a script must not have is caught', () => {
  const cases: [string, RegExp][] = [
    ['Akcje wzrosły o 62%.', /symbol/],
    ['Przychody to 57 mld dolarów.', /abbreviation/],
    ['Przychody to 57 mln dolarów.', /abbreviation/],
    ['Kurs USD wzrósł o 62 procent.', /code/],
    ['Spółka (NASDAQ:NVDA) zyskała 62 procent.', /ticker|brackets/],
    ['Więcej na https://example.com o 62 procent.', /address/],
    ['To **ważne**: 62 procent.', /formatting/],
    ['Akcje $NVDA zyskały 62 procent.', /ticker|symbol/],
    ['Wzrost o 62 procent r/r.', /abbreviation/],
  ]
  for (const [text, re] of cases) {
    const s = good()
    s.segments[0].text = text
    const issues = lintScript(s, ctx)
    assert.ok(issues.some((i) => re.test(i)), `${text}: ${issues.join(' | ')}`)
  }
})

test('unsupported or missing claims: numbers not in the cited claims, claims that were not verified, stories missing or twice', () => {
  const s = good()
  s.segments[0].text = 'Nvidia podała, że jej przychody wyniosły 58 miliardów dolarów.'
  assert.ok(lintScript(s, ctx).some((i) => /numbers not in its verified claims \(58\)/.test(i)))
  const t = good()
  t.segments[1].text = 'Nvidia podała, że jej przychody wyniosły 57 miliardów dolarów.' // a number of another story
  assert.ok(lintScript(t, ctx).some((i) => /segment s2 text: numbers not in its verified claims/.test(i)))
  const u = good()
  u.segments[0].claimIds = ['s1c1', 's1c9']
  assert.ok(lintScript(u, ctx).some((i) => /not verified \(s1c9\)/.test(i)))
  const v = good()
  v.segments = [v.segments[0], { ...v.segments[0] }]
  const issues = lintScript(v, ctx)
  assert.ok(issues.some((i) => /twice/.test(i)) && issues.some((i) => /story s2: no segment/.test(i)))
  const w = good()
  w.segments[0].storyId = 's9'
  assert.ok(lintScript(w, ctx).some((i) => /not one of the selected stories/.test(i)))
  const x = good()
  x.segments[0].headline = 'Nvidia: 99 miliardów'
  assert.ok(lintScript(x, ctx).some((i) => /headline: numbers/.test(i)))
})

test('length: too short or too long a script, a sentence a voice would choke on', () => {
  assert.ok(lintScript(good(), { ...ctx, minWords: 500 }).some((i) => /at least 500/.test(i)))
  assert.ok(lintScript(good(), { ...ctx, maxWords: 30 }).some((i) => /at most 30/.test(i)))
  const s = good()
  s.segments[0].text = `Nvidia podała ${'bardzo długie zdanie bez kropki '.repeat(12)} o 57 miliardach dolarów.`
  assert.ok(lintScript(s, ctx).some((i) => /a sentence over 300/.test(i)))
})

test('sentences: split at their ends, not at decimal commas or inside quotes', () => {
  assert.deepEqual(splitSentences('Kurs wzrósł o 2,5 procent. „Jest dobrze” – powiedział prezes. Czy tak? Tak!'),
    ['Kurs wzrósł o 2,5 procent.', '„Jest dobrze” – powiedział prezes.', 'Czy tak?', 'Tak!'])
})

test('the voice\'s parts: whole sentences, at most the byte limit with Polish letters, and together exactly the script', () => {
  const s = good()
  s.segments.push(...Array.from({ length: 12 }, (_, i) => ({ storyId: `x${i}`, headline: 'x', claimIds: [],
    text: `Zażółć gęślą jaźń numer ${i}. Źdźbło łąki ćmy ósmej przegonił świt. Następne zdanie, które coś mówi o rynku i o złotym.` })))
  const text = scriptText(s)
  for (const max of [400, 800, 1800, 4800]) {
    const parts = chunkText(text, max)
    for (const p of parts) assert.ok(bytes(p) <= max, `${bytes(p)} > ${max}`)
    assert.equal(parts.join(' ').replace(/\s+/g, ' '), text.replace(/\s+/g, ' '), 'nothing lost, nothing added')
    for (const p of parts) assert.match(p, /[.!?…]$/, 'each part ends a sentence')
    if (max === 4800) assert.equal(parts.length, 1)
  }
  assert.ok(chunkText(text, 400).length > chunkText(text, 1800).length)
  // a paragraph that fits is not cut in two
  const paras = chunkText('Pierwszy akapit. Ma dwa zdania.\n\nDrugi akapit jest tutaj.', 40)
  assert.deepEqual(paras, ['Pierwszy akapit. Ma dwa zdania.', 'Drugi akapit jest tutaj.'])
})

test('a sentence longer than the limit is split at a comma, then at a space; never inside a character', () => {
  const long = `${'Zażółć gęślą jaźń, '.repeat(30)}koniec.`
  const parts = chunkText(long, 200)
  for (const p of parts) assert.ok(bytes(p) <= 200)
  assert.ok(parts.slice(0, -1).every((p) => p.endsWith(',')), 'at commas')
  assert.equal(parts.join(' '), long.trim())
  const words = `${'źdźbło '.repeat(80)}koniec.`
  for (const p of chunkText(words, 100)) { assert.ok(bytes(p) <= 100); assert.ok(!p.includes('�')) }
  // characters outside the basic plane stay whole
  const emoji = `${'ąę🙂'.repeat(60)}.`
  const cut = chunkText(emoji, 50)
  assert.equal(cut.join(''), emoji)
  for (const p of cut) assert.ok(bytes(p) <= 50 && !/[\uD800-\uDBFF]$/.test(p))
})

test('words are counted roughly as a reader says them (a number with a decimal comma is two, a hyphenated name one)', () => {
  assert.equal(wordCount('Dzień dobry, jest 2,5 procent; S&P 500 i Coca-Cola.'), 11)
})
