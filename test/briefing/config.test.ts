// The settings: safe defaults (off), what a live edition needs, wrong values named
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { missingForLive, readConfig, targetWords } from '../../worker/briefing/config'

test('defaults: off, automatic publication, Monday to Saturday, 19:00 to 07:00 with the cutoff at 06:00, no model', () => {
  const { config, problems } = readConfig({})
  assert.deepEqual(problems, [])
  assert.equal(config.mode, 'off')
  assert.equal(config.approval, 'auto')
  assert.deepEqual(config.days, [1, 2, 3, 4, 5, 6])
  assert.deepEqual([config.windowStart, config.windowEnd, config.cutoff, config.publishAt, config.deadline], ['19:00', '07:00', '06:00', '07:00', '10:00'])
  assert.equal(config.openai.models.write, undefined, 'no model is assumed')
  assert.equal(config.tts.voice, 'pl-PL-Chirp3-HD-Aoede')
  assert.equal(config.targetSeconds, 180)
  assert.equal(targetWords(config), 420)
  assert.equal(config.search.provider, 'openai')
  assert.equal(readConfig({ BRIEFING_MODE: 'mock' }).config.search.provider, 'mock')
})

test('missing secrets for a live edition are listed, never assumed', () => {
  const { config } = readConfig({ BRIEFING_MODE: 'live' })
  const missing = missingForLive(config)
  assert.ok(missing.some((m) => m.startsWith('OPENAI_API_KEY')))
  assert.ok(missing.some((m) => m.startsWith('BRIEFING_OPENAI_MODEL')))
  assert.ok(missing.some((m) => m.startsWith('GOOGLE_TTS_API_KEY or GOOGLE_SERVICE_ACCOUNT_JSON')))
  const ready = readConfig({ BRIEFING_MODE: 'live', OPENAI_API_KEY: 'k', BRIEFING_OPENAI_MODEL: 'gpt-6.1-sol', GOOGLE_TTS_API_KEY: 'g' }).config
  assert.deepEqual(missingForLive(ready), [])
  // a model the price list does not know needs its prices (for the caps)
  const unknown = readConfig({ BRIEFING_MODE: 'live', OPENAI_API_KEY: 'k', BRIEFING_OPENAI_MODEL: 'some-new-model', GOOGLE_TTS_API_KEY: 'g' }).config
  assert.ok(missingForLive(unknown).some((m) => /prices of some-new-model/.test(m)))
  const priced = readConfig({ BRIEFING_MODE: 'live', OPENAI_API_KEY: 'k', BRIEFING_OPENAI_MODEL: 'some-new-model', GOOGLE_TTS_API_KEY: 'g',
    BRIEFING_OPENAI_PRICES: '{"some-new-model":{"input":3,"output":12}}' }).config
  assert.deepEqual(missingForLive(priced), [])
  assert.deepEqual(priced.openai.prices['some-new-model'], { input: 3, output: 12, cached: 3 })
  assert.ok(missingForLive(readConfig({ BRIEFING_MODE: 'live', OPENAI_API_KEY: 'k', BRIEFING_OPENAI_MODEL: 'gpt-6.1-sol', BRIEFING_SEARCH_PROVIDER: 'tavily', GOOGLE_TTS_API_KEY: 'g' }).config)
    .some((m) => m.startsWith('TAVILY_API_KEY')))
  assert.ok(missingForLive(readConfig({ BRIEFING_MODE: 'live', OPENAI_API_KEY: 'k', BRIEFING_OPENAI_MODEL: 'gpt-6.1-sol', GOOGLE_SERVICE_ACCOUNT_JSON: '{"x":1}' }).config)
    .some((m) => /not a service account key/.test(m)))
  // a model per stage
  const split = readConfig({ BRIEFING_OPENAI_MODEL: 'gpt-6.1-terra', BRIEFING_OPENAI_MODEL_VERIFY: 'gpt-6.1-sol' }).config
  assert.equal(split.openai.models.verify, 'gpt-6.1-sol')
  assert.equal(split.openai.models.write, 'gpt-6.1-terra')
})

test('wrong values are named and the default is kept', () => {
  const { config, problems } = readConfig({
    BRIEFING_MODE: 'on', BRIEFING_CUTOFF: '7am', BRIEFING_TARGET_SECONDS: '5', BRIEFING_DAYS: '1-9', BRIEFING_OPENAI_PRICES: 'cheap',
    BRIEFING_OPENAI_REASONING_EFFORT: 'extreme', BRIEFING_SEARCH_PROVIDER: 'google',
  })
  assert.equal(config.mode, 'off')
  assert.equal(config.cutoff, '06:00')
  assert.equal(config.targetSeconds, 180)
  for (const k of ['BRIEFING_MODE', 'BRIEFING_CUTOFF', 'BRIEFING_TARGET_SECONDS', 'BRIEFING_DAYS', 'BRIEFING_OPENAI_PRICES', 'BRIEFING_OPENAI_REASONING_EFFORT', 'BRIEFING_SEARCH_PROVIDER']) {
    assert.ok(problems.some((p) => p.startsWith(k)), k)
  }
  // times that do not fit together
  const t = readConfig({ BRIEFING_CUTOFF: '07:30', BRIEFING_PUBLISH_AT: '06:30', BRIEFING_DEADLINE: '06:00' }).problems
  assert.ok(t.some((p) => /CUTOFF must be before BRIEFING_WINDOW_END/.test(p)))
  assert.ok(t.some((p) => /PUBLISH_AT must not be before/.test(p)))
  assert.ok(t.some((p) => /DEADLINE must be after/.test(p)))
  assert.deepEqual(readConfig({ BRIEFING_DAYS: '1-5,7' }).config.days, [1, 2, 3, 4, 5, 7])
})
