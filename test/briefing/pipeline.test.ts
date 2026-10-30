// The whole pipeline with the mock services and a clock of its own: the schedule, one edition per day, retries,
// deadlines, failures that publish nothing, approval, withdrawal, the audio and the page's states
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ProviderError, type Llm } from '../../worker/briefing/llm'
import { inspect } from '../../worker/briefing/mp3'
import { adminEdition, approve, audioOf, nextStep, publicEdition, publicIndex, reject, startByHand, tick, type EditionRecord, type ValidateOutput } from '../../worker/briefing/pipeline'
import { silentMp3 } from '../../worker/briefing/mp3'
import { harness, item, night, run } from './helpers'

const twoNights = () => [...night(14, '2026-10-27'), ...night(14, '2026-10-28')]

const edition = (h: ReturnType<typeof harness>, id = '2026-10-28') => h.d.store.getEdition(id) as EditionRecord | null

test('a whole edition: starts at the cutoff, waits for 07:45, comes out with its audio, sources and times', async () => {
  const h = harness()
  assert.equal(await tick(h.d), Date.parse('2026-10-28T05:00:00Z'), 'before the cutoff it sleeps until the cutoff')
  assert.equal(publicIndex(h.d).today.state, 'scheduled')
  h.clock.now = Date.parse('2026-10-28T05:00:00Z')
  await run(h, () => edition(h)?.status === 'waiting')
  const e = edition(h)!
  assert.equal(e.mode, 'mock')
  assert.equal(publicIndex(h.d).today.state, 'preparing')
  assert.equal(publicEdition(h.d, e.id), null, 'not public before 07:45')
  assert.ok(h.clock.now < e.times.publishAt)
  // at 07:45 it comes out
  await run(h, () => edition(h)?.status === 'published')
  const pub = publicEdition(h.d, '2026-10-28')!
  assert.ok(pub)
  assert.equal(pub.test, true)
  assert.equal(pub.publishedAt, '2026-10-28T06:45:00.000Z')
  assert.equal(pub.late, false)
  assert.equal(pub.window.from, '2026-10-27T18:00:00.000Z')
  assert.equal(pub.window.to, '2026-10-28T06:00:00.000Z')
  assert.ok(Date.parse(pub.cutoff) >= Date.parse('2026-10-28T05:00:00Z') && Date.parse(pub.cutoff) < Date.parse('2026-10-28T05:10:00Z'), 'the actual cutoff: when the news were collected')
  assert.ok(Date.parse(pub.generatedAt) < Date.parse(pub.publishedAt!))
  assert.ok(pub.stories.length >= 3 && pub.stories.length <= 8)
  for (const s of pub.stories) {
    assert.ok(s.sources.length >= 2, 'every story has its sources')
    for (const src of s.sources) assert.match(src.url, /^https:\/\//)
  }
  assert.match(pub.intro, /^Dzień dobry\. Jest środa, dwudziesty ósmy października\./)
  assert.match(pub.intro, /do dziś do godziny szóstej( zero \w+)?\.$/, 'the actual cutoff, in words')
  assert.match(pub.outro, /sztuczna inteligencja/)
  // the audio: one valid MP3 at the published address, as long as the page says
  const [, hash] = /-([0-9a-f]{12})\.mp3$/.exec(pub.audio.url)!
  const audio = audioOf(h.d, '2026-10-28', hash)!
  assert.equal(audio.length, pub.audio.bytes)
  const info = inspect(audio)
  assert.ok(Math.abs(info.seconds - pub.audio.seconds) < 0.1)
  assert.equal(audioOf(h.d, '2026-10-28', '000000000000'), null, 'another hash: nothing')
  assert.equal(h.d.store.audioParts('2026-10-28', 'part'), 0, 'the pieces are gone once joined')
  // announced to the news list, and listed
  assert.deepEqual(h.announced, ['2026-10-28'])
  const index = publicIndex(h.d)
  assert.equal(index.today.state, 'published')
  assert.equal(index.editions[0].id, '2026-10-28')
  // traceable: the manifest ties the audio to the text, the voice and the versions
  const admin = adminEdition(h.d, '2026-10-28')!
  const manifest = (admin.steps.assemble.output as { manifest: { audioSha: string; scriptSha: string; voice: string; parts: unknown[]; prompts: string } }).manifest
  assert.ok(manifest.audioSha.startsWith(hash))
  assert.equal(manifest.voice, 'mock')
  assert.ok(manifest.parts.length >= 1)
  // the paragraphs read from the pages are not kept after publication
  for (const [key, step] of Object.entries(admin.steps)) if (key.startsWith('page:')) assert.equal((step.output as { excerpt?: string }).excerpt, undefined)
})

test('one edition a day: ticks after publication start nothing and repeat no step', async () => {
  const h = harness({}, { start: '2026-10-28T05:00:00Z' })
  await run(h, () => edition(h)?.status === 'published')
  const calls = { ...h.calls }
  const steps = h.d.store.steps('2026-10-28').length
  for (let i = 0; i < 5; i++) await tick(h.d)
  h.clock.now += 3600_000
  await tick(h.d)
  assert.deepEqual(h.calls, calls, 'no model call more')
  assert.equal(h.d.store.steps('2026-10-28').length, steps)
  assert.equal(h.d.store.listEditions(10).length, 1)
  // the next day starts the next edition at its cutoff
  h.clock.now = Date.parse('2026-10-29T05:00:00Z')
  await tick(h.d)
  assert.equal(h.d.store.getEdition('2026-10-29')?.status, 'running')
})

test('a step done is never done again: the same state ticked twice makes one call', async () => {
  const h = harness({}, { start: '2026-10-28T05:00:00Z' })
  await run(h, () => !!h.d.store.getStep('2026-10-28', 'triage'))
  assert.equal(h.calls.triage, 1)
  const e = edition(h)!
  assert.notEqual(nextStep(h.d.store, e, h.d.config), 'triage')
})

test('a failing call is tried again after 1, 2… minutes, then the edition goes on', async () => {
  const h = harness({}, { start: '2026-10-28T05:00:00Z' })
  const real = h.d.llm!
  let failures = 0
  h.d.llm = { ...real, call: async (req) => { if (req.stage === 'triage' && failures < 2) { failures++; throw new ProviderError('OpenAI triage: HTTP 503', 'retryable', 503) } return real.call(req) } } as Llm
  await run(h, () => !!edition(h)?.retry)
  const first = edition(h)!.retry!
  assert.equal(first.step, 'triage')
  assert.equal(first.at - h.clock.now, 60_000)
  // waking up early does nothing
  assert.equal(await tick(h.d), first.at)
  h.clock.now = first.at
  await tick(h.d)
  const second = edition(h)!.retry!
  assert.equal(second.at - h.clock.now, 120_000)
  await run(h, () => edition(h)?.status === 'published')
  assert.equal(h.d.store.getStep('2026-10-28', 'triage')!.attempts, 3)
})

test('a fatal error (a wrong key) stops the edition at once; the page keeps the last one', async () => {
  const h = harness({}, { start: '2026-10-27T05:00:00Z', items: twoNights() })
  await run(h, () => h.d.store.getEdition('2026-10-27')?.status === 'published')
  h.clock.now = Date.parse('2026-10-28T05:00:00Z')
  const real = h.d.llm!
  h.d.llm = { ...real, call: async (req) => { if (req.stage === 'write') throw new ProviderError('OpenAI write: HTTP 401 (invalid_api_key)', 'fatal', 401); return real.call(req) } } as Llm
  await run(h, () => edition(h)?.status === 'failed')
  assert.match(edition(h)!.failure!.message, /401/)
  assert.equal(edition(h)!.failure!.step, 'write:1')
  assert.equal(publicEdition(h.d, '2026-10-28'), null)
  assert.equal(publicIndex(h.d).today.state, 'failed')
  assert.equal(publicIndex(h.d).editions[0].id, '2026-10-27', 'the last edition is still there')
  assert.equal(h.d.store.audioParts('2026-10-28', 'part'), 0)
})

test('the deadline: retries stop at it and nothing is published', async () => {
  const short = { BRIEFING_MAX_STEP_ATTEMPTS: '10', BRIEFING_PUBLISH_AT: '06:10', BRIEFING_DEADLINE: '06:20' }
  const h = harness(short, { start: '2026-10-28T05:00:00Z' })
  const real = h.d.llm!
  h.d.llm = { ...real, call: async (req) => { if (req.stage === 'triage') throw new ProviderError('OpenAI triage: HTTP 429', 'retryable', 429); return real.call(req) } } as Llm
  await run(h, () => edition(h)?.status === 'failed')
  const e = edition(h)!
  assert.ok(h.clock.now >= e.times.deadline)
  assert.match(e.failure!.message, /deadline/)
  assert.equal(publicIndex(h.d).today.state, 'failed')
  // before the deadline the page says "delayed" once the time to publish has passed
  const h2 = harness(short, { start: '2026-10-28T05:00:00Z' })
  h2.d.llm = h.d.llm
  await run(h2, () => h2.clock.now > Date.parse('2026-10-28T05:12:00Z'))
  assert.equal(publicIndex(h2.d).today.state, 'delayed')
})

test('live mode without its secrets: a failed edition saying what is missing, and no call at all', async () => {
  const h = harness({ BRIEFING_MODE: 'live' }, { start: '2026-10-28T05:00:00Z' })
  await tick(h.d)
  const e = edition(h)!
  assert.equal(e.status, 'failed')
  assert.match(e.failure!.message, /OPENAI_API_KEY/)
  assert.match(e.failure!.message, /BRIEFING_OPENAI_MODEL/)
  assert.match(e.failure!.message, /GOOGLE_TTS_API_KEY or GOOGLE_SERVICE_ACCOUNT_JSON/)
  assert.deepEqual(h.calls, {})
  await tick(h.d)
  assert.equal(h.d.store.listEditions(5).length, 1, 'not tried again every tick')
})

test('mode off: nothing starts', async () => {
  const h = harness({ BRIEFING_MODE: 'off' }, { start: '2026-10-28T05:00:00Z' })
  assert.equal(await tick(h.d), null)
  assert.equal(h.d.store.listEditions(5).length, 0)
  assert.equal(publicIndex(h.d).today.state, 'none')
})

test('switched off during an edition: it stops', async () => {
  const h = harness({}, { start: '2026-10-28T05:00:00Z' })
  await run(h, () => !!h.d.store.getStep('2026-10-28', 'collect'))
  h.d.config = { ...h.d.config, mode: 'off' }
  assert.equal(await tick(h.d), null)
  assert.equal(edition(h)!.status, 'failed')
  assert.match(edition(h)!.failure!.message, /switched off/)
})

test('too few news in the window, or too few verified stories: no edition', async () => {
  const empty = harness({}, { start: '2026-10-28T05:00:00Z', items: night(2) })
  await run(empty, () => edition(empty)?.status === 'failed')
  assert.match(edition(empty)!.failure!.message, /only 2 news stories/)
  // the sources do not confirm the claims: every story is dropped
  const h = harness({}, { start: '2026-10-28T05:00:00Z' })
  h.d.fetchPage = async (url) => ({ url, finalUrl: url, host: new URL(url).hostname, domain: new URL(url).hostname, status: 'ok', excerpt: 'Something else entirely, with nothing about the story at all.', fetchedAt: 0 })
  await run(h, () => edition(h)?.status === 'failed')
  assert.match(edition(h)!.failure!.message, /verified stories/)
  assert.equal(h.calls.write, undefined, 'nothing written from unverified claims')
})

test('pages that cannot be read: the story has too few sources and the model is not even asked', async () => {
  const h = harness({}, { start: '2026-10-28T05:00:00Z' })
  h.d.fetchPage = async (url) => ({ url, finalUrl: url, host: 'x', domain: 'x', status: 'paywall', fetchedAt: 0 })
  await run(h, () => edition(h)?.status === 'failed')
  assert.equal(h.calls.verify, undefined)
})

test('a script that keeps failing the checks is not published', async () => {
  const h = harness({}, { start: '2026-10-28T05:00:00Z' })
  const real = h.d.llm!
  h.d.llm = { ...real, call: async (req) => {
    const r = await real.call(req)
    if (req.stage === 'write') (r.value as { segments: { text: string }[] }).segments[0].text += ' Wzrost o 99,9 procent (ok. 5 mld USD).'
    return r
  } } as Llm
  await run(h, () => edition(h)?.status === 'failed')
  assert.match(edition(h)!.failure!.message, /did not pass the checks in 3 attempts/)
  const v = h.d.store.getStep<ValidateOutput>('2026-10-28', 'validate:3')!.output!
  assert.ok(v.lint.some((x) => /numbers not in its verified claims \(99\.9/.test(x)))
  assert.ok(v.lint.some((x) => /brackets/.test(x)))
  assert.ok(v.lint.some((x) => /abbreviation/.test(x)))
  assert.equal(h.calls.validate, undefined, 'the final model is not asked about a script the code already rejected')
})

test('the final check rejects once, the rewrite gets the issues and passes', async () => {
  const h = harness({}, { start: '2026-10-28T05:00:00Z' })
  const real = h.d.llm!
  let seen = ''
  h.d.llm = { ...real, call: async (req) => {
    if (req.stage === 'write' && req.input.includes('issuesToFix":["')) seen = req.input
    if (req.stage === 'validate' && !h.d.store.getStep('2026-10-28', 'validate:1')) {
      return { value: { verdict: 'fail', issues: [{ storyId: 's1', severity: 'error', type: 'unsupported', excerpt: 'x', explanation: 'not in the facts' }] }, usage: { inputTokens: 1, cachedTokens: 0, outputTokens: 1, reasoningTokens: 0, webSearches: 0 }, model: 'mock', requestId: null, sources: [] }
    }
    return real.call(req)
  } } as Llm
  await run(h, () => edition(h)?.status === 'waiting')
  assert.match(seen, /not in the facts/)
  assert.ok(h.d.store.getStep('2026-10-28', 'write:2'))
})

test('audio that does not match its text (cut short) is tried again and, failing, publishes nothing', async () => {
  const h = harness({ BRIEFING_MAX_STEP_ATTEMPTS: '2' }, { start: '2026-10-28T05:00:00Z' })
  h.d.tts = { checkVoice: async () => {}, synthesize: async () => silentMp3(0.5) }
  await run(h, () => edition(h)?.status === 'failed')
  assert.match(edition(h)!.failure!.message, /of audio for \d+ characters/)
  assert.equal(publicEdition(h.d, '2026-10-28'), null)
})

test('the voice service failing: no edition, no partial audio', async () => {
  const h = harness({}, { start: '2026-10-28T05:00:00Z' })
  h.d.tts = { checkVoice: async () => {}, synthesize: async () => { throw new ProviderError('Text-to-Speech: HTTP 403 (PERMISSION_DENIED)', 'fatal', 403) } }
  await run(h, () => edition(h)?.status === 'failed')
  assert.equal(h.d.store.audioParts('2026-10-28', 'part'), 0)
  assert.equal(h.d.store.audioParts('2026-10-28', 'file'), 0)
})

test('a story whose search keeps failing is left out; the others go on', async () => {
  const h = harness({ BRIEFING_MAX_STEP_ATTEMPTS: '2' }, { start: '2026-10-28T05:00:00Z' })
  const search = h.d.search!
  h.d.search = (llm) => {
    const s = search(llm)
    return { ...s, search: async (story, ctx) => { if (story.id === 's1') throw new ProviderError('search: HTTP 500', 'retryable', 500); return s.search(story, ctx) } }
  }
  await run(h, () => edition(h)?.status === 'waiting')
  assert.equal(h.d.store.getStep('2026-10-28', 'search:s1')!.status, 'skipped')
  const pub = edition(h)!.public!
  assert.ok(!pub.stories.some((s) => s.id === 's1'))
})

test('manual approval: ready, then waiting for a person; approved after 07:45 it comes out at once (late)', async () => {
  const h = harness({ BRIEFING_APPROVAL: 'manual' }, { start: '2026-10-28T05:00:00Z' })
  await run(h, () => edition(h)?.status === 'awaiting_approval')
  h.clock.now = Date.parse('2026-10-28T07:10:00Z')
  await tick(h.d)
  assert.equal(edition(h)!.status, 'awaiting_approval', 'not out by itself')
  assert.equal(publicIndex(h.d).today.state, 'delayed')
  assert.equal((await approve(h.d, '2026-10-28')).message, 'published')
  const pub = publicEdition(h.d, '2026-10-28')!
  assert.equal(pub.late, true)
  assert.deepEqual(h.announced, ['2026-10-28'])
})

test('withdrawing a published edition: the page and the news list go back to the one before', async () => {
  const h = harness({}, { start: '2026-10-27T05:00:00Z', items: twoNights() })
  await run(h, () => h.d.store.getEdition('2026-10-27')?.status === 'published')
  h.clock.now = Date.parse('2026-10-28T05:00:00Z')
  await run(h, () => edition(h)?.status === 'published')
  await reject(h.d, '2026-10-28', 'a mistake')
  assert.equal(publicEdition(h.d, '2026-10-28'), null)
  assert.equal(audioOf(h.d, '2026-10-28', 'whatever'), null)
  assert.deepEqual(h.announced, ['2026-10-27', '2026-10-28', '2026-10-27'])
})

test('by hand: a past day, published as soon as it is ready; a second start needs force', async () => {
  const h = harness({}, { start: '2026-10-28T12:00:00Z' })
  const items = [...night(), item('PAP', 'old', '2026-10-25T20:00:00Z')]
  h.d.pollerItems = async () => ({ items, feeds: [], at: h.clock.now })
  assert.equal(startByHand(h.d, '2026-10-29', false).ok, false, 'not a future day')
  assert.equal(startByHand(h.d, '2026-10-28', false).ok, true)
  assert.equal(startByHand(h.d, '2026-10-28', false).ok, false, 'already under way')
  await run(h, () => edition(h)?.status === 'published')
  assert.match(publicEdition(h.d, '2026-10-28')!.intro, /do dziś do godziny siódmej\.$/, 'made at noon: the window ends at 07:00, and so does the greeting')
  assert.equal(startByHand(h.d, '2026-10-28', false).ok, false)
  assert.equal(startByHand(h.d, '2026-10-28', true).ok, true)
})

test('the cost caps: research stops for the remaining stories past three quarters of the cap; the script still fits', async () => {
  const live = { BRIEFING_MODE: 'live', OPENAI_API_KEY: 'k', BRIEFING_OPENAI_MODEL: 'gpt-6.1-sol', GOOGLE_TTS_API_KEY: 'g' }
  // the mock services in live mode, each call billed as 1000 tokens in and 4000 out ($0.042 at the list prices of gpt-6.1-sol)
  const priced = (h: ReturnType<typeof harness>) => {
    const real = h.d.llm!
    h.d.llm = { ...real, call: async (req) => ({ ...(await real.call(req)), usage: { inputTokens: 1000, cachedTokens: 0, outputTokens: 4000, reasoningTokens: 0, webSearches: 0 } }) } as Llm
  }
  const h = harness({ ...live, BRIEFING_MAX_COST_USD: '0.6' }, { start: '2026-10-28T05:00:00Z' })
  priced(h)
  await run(h, () => edition(h)?.status === 'waiting')
  const skipped = h.d.store.steps('2026-10-28').filter(([k, s]) => k.startsWith('verify:') && s.status === 'skipped')
  assert.ok(skipped.length >= 1, 'some stories left out')
  assert.match(skipped[0][1].error!, /cost cap/)
  assert.ok(edition(h)!.costUsd <= 0.6)
  assert.ok(Math.abs(edition(h)!.costUsd - h.d.store.usage('2026-10-28').reduce((n, u) => n + u.costUsd, 0)) < 1e-9, 'the edition\'s cost is the sum of its logged usage')
  // a cap too small for the first call: no edition
  const poor = harness({ ...live, BRIEFING_MAX_COST_USD: '0.1' }, { start: '2026-10-28T05:00:00Z' })
  priced(poor)
  await run(poor, () => edition(poor)?.status === 'failed')
  assert.match(edition(poor)!.failure!.message, /cost cap of the edition/)
  assert.equal(edition(poor)!.costUsd, 0)
  // the monthly cap counts what earlier editions spent
  const month = harness({ ...live, BRIEFING_MAX_MONTHLY_COST_USD: '1' }, { start: '2026-10-28T05:00:00Z' })
  priced(month)
  month.d.store.addUsage({ edition: '2026-10-20', at: Date.parse('2026-10-20T05:00:00Z'), provider: 'openai', stage: 'write', model: 'gpt-6.1-sol',
    inputTokens: 0, cachedTokens: 0, outputTokens: 0, reasoningTokens: 0, webSearches: 0, characters: 0, costUsd: 0.95, requestId: null, ok: true })
  await run(month, () => edition(month)?.status === 'failed')
  assert.match(edition(month)!.failure!.message, /monthly cost cap/)
})

test('editions older than the retention go, and the news list stops pointing at them', async () => {
  const h = harness({ BRIEFING_RETENTION_DAYS: '3' }, { start: '2026-10-28T05:00:00Z' })
  await run(h, () => edition(h)?.status === 'published')
  h.clock.now = Date.parse('2026-11-03T05:00:00Z') // a Tuesday, no news in its window: that edition fails
  await run(h, () => h.d.store.getEdition('2026-11-03')?.status === 'failed')
  await tick(h.d)
  assert.equal(h.d.store.getEdition('2026-10-28'), null)
  assert.equal(h.d.store.audioParts('2026-10-28', 'file'), 0)
  assert.deepEqual(h.announced, ['2026-10-28', null])
})

test('the model that picks the stories sees a story\'s other headlines (moreHeadlines)', async () => {
  const items = [...night(14), item('WALTER', 'MICROSOFT 1Q REV. $92.3B, EST. $90.1B', '2026-10-27T20:05:00Z'),
    item('WALTER', 'MICROSOFT SHARES RISE 5% POST-MARKET', '2026-10-27T20:06:00Z')]
  const h = harness({}, { items })
  const inputs: string[] = []
  const llm = h.d.llm!
  h.d.llm = { ...llm, call: (req) => { if (req.stage === 'triage') inputs.push(req.input); return llm.call(req) } }
  h.clock.now = Date.parse('2026-10-28T05:00:00Z')
  await run(h, () => h.d.store.getStep('2026-10-28', 'triage')?.status === 'done')
  assert.match(inputs[0], /"title":"MICROSOFT 1Q REV\. \$92\.3B, EST\. \$90\.1B"[^}]*"moreHeadlines":\["MICROSOFT SHARES RISE 5% POST-MARKET"\]/)
})

test('the model that picks the stories is told that crypto and commodities are topics of their own, and gets the candidates of both on a crowded night', async () => {
  const crowded = Array.from({ length: 40 }, (_, i) => item('WALTER', `FED ${i} says rates and inflation matter w${i}x${i * 7}z`, `2026-10-27T${19 + (i % 4)}:${10 + (i % 40)}:00Z`))
  const items = [...crowded, item('INVESTINGLIVE', 'Binance appears hacked, CZ says, as Tether and Circle freeze $1.79B in stablecoins', '2026-10-27T21:55:00Z'),
    item('INVESTINGLIVE', 'WTI crude oil falls 5% on a surprise build in stocks', '2026-10-27T22:10:00Z')]
  const h = harness({ BRIEFING_MAX_CANDIDATES: '10' }, { items })
  const asked: { instructions: string; input: string }[] = []
  const llm = h.d.llm!
  h.d.llm = { ...llm, call: (req) => { if (req.stage === 'triage') asked.push({ instructions: req.instructions, input: req.input }); return llm.call(req) } }
  h.clock.now = Date.parse('2026-10-28T05:00:00Z')
  await run(h, () => h.d.store.getStep('2026-10-28', 'triage')?.status === 'done')
  assert.match(asked[0].instructions, /Crypto and commodities are topics of their own, not an afterthought/)
  assert.match(asked[0].instructions, /an exchange hack or a freeze of\s+funds/)
  assert.match(asked[0].input, /Binance appears hacked/)
  assert.match(asked[0].input, /WTI crude oil falls 5%/)
})
