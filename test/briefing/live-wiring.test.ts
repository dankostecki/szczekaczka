// The live providers wired together, every HTTP answer simulated here: OpenAI's Responses API (answers made by the mock
// model from the request's own data), its web search, the pages and their robots.txt, Google's voices and synthesis.
// This shows that the requests and answers of the real clients fit the pipeline; it does not show that the real services
// answer this way (nothing here goes to the network).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readConfig } from '../../worker/briefing/config'
import { openAiLlm } from '../../worker/briefing/llm'
import { dataOf, mockLlm } from '../../worker/briefing/mock'
import { inspect, silentMp3 } from '../../worker/briefing/mp3'
import { audioOf, publicEdition, type Deps } from '../../worker/briefing/pipeline'
import { openAiSearch } from '../../worker/briefing/search'
import { memoryStore } from '../../worker/briefing/store'
import { googleTts } from '../../worker/briefing/tts'
import { fetchPage } from '../../worker/briefing/web'
import { night, poller, run } from './helpers'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'x-request-id': 'req_x' } })

test('a live edition with the real clients against simulated services', async () => {
  const env = {
    BRIEFING_MODE: 'live', OPENAI_API_KEY: 'sk-test', BRIEFING_OPENAI_MODEL: 'gpt-6.1-sol', GOOGLE_TTS_API_KEY: 'AIza-test',
  }
  const { config, problems } = readConfig(env)
  assert.deepEqual(problems, [])
  const mock = mockLlm()
  const claimsOf = new Map<string, string[]>() // page path → the claims it states
  const log: string[] = []
  let invented = 0

  const fetchFn = (async (url: string, init: RequestInit = {}) => {
    const u = new URL(url)
    log.push(`${init.method ?? 'GET'} ${u.host}${u.pathname}`)
    if (u.host === 'api.openai.com') {
      assert.equal(new Headers(init.headers).get('authorization'), 'Bearer sk-test')
      if (u.pathname === '/v1/models/gpt-6.1-sol') return json({ id: 'gpt-6.1-sol', object: 'model' })
      assert.equal(u.pathname, '/v1/responses')
      const body = JSON.parse(init.body as string)
      assert.equal(body.store, false)
      assert.equal(body.text.format.strict, true)
      const name = body.text.format.name as string
      const usage = { input_tokens: 2000, input_tokens_details: { cached_tokens: 0 }, output_tokens: 500, output_tokens_details: { reasoning_tokens: 100 } }
      if (name === 'sources') {
        assert.equal(body.tools[0].type, 'web_search')
        const story = dataOf<{ headline: string; claims: string[] }>(body.input)
        const key = `${story.claims[0].slice(0, 20).replace(/\W+/g, '-')}-${claimsOf.size}`
        const pages = [`https://www.example-news.com/${key}`, `https://ir.examplecorp.com/${key}`]
        for (const p of pages) claimsOf.set(new URL(p).pathname, story.claims)
        invented++
        const results = [...pages, `https://www.made-up-by-the-model.com/${key}`].map((url) => ({ url, title: story.headline, publisher: new URL(url).host, primary: url.includes('examplecorp') }))
        return json({ status: 'completed', model: 'gpt-6.1-sol-2026-09-30', usage, output: [
          { type: 'web_search_call', status: 'completed', action: { type: 'search', query: 'q', sources: pages.map((url) => ({ type: 'url', url })) } },
          { type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: JSON.stringify({ results }), annotations: [] }] },
        ] })
      }
      const r = await mock.call({ stage: 'x', model: body.model, instructions: body.instructions, input: body.input, schemaName: name, schema: { type: 'null' }, maxOutputTokens: 1 })
      return json({ status: 'completed', model: 'gpt-6.1-sol-2026-09-30', usage, output: [
        { type: 'reasoning', summary: [] },
        { type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: JSON.stringify(r.value), annotations: [] }] },
      ] })
    }
    if (u.host === 'texttospeech.googleapis.com') {
      assert.equal(new Headers(init.headers).get('x-goog-api-key'), 'AIza-test')
      if (u.pathname === '/v1/voices') return json({ voices: [{ name: 'pl-PL-Chirp3-HD-Aoede', languageCodes: ['pl-PL'] }, { name: 'pl-PL-Chirp3-HD-Charon', languageCodes: ['pl-PL'] }] })
      const body = JSON.parse(init.body as string)
      assert.equal(body.voice.name, 'pl-PL-Chirp3-HD-Aoede')
      assert.ok(new TextEncoder().encode(body.input.text).length <= config.tts.maxChunkBytes)
      const mp3 = silentMp3([...body.input.text].length * 0.065, { id3: true, infoFrame: true })
      return json({ audioContent: Buffer.from(mp3).toString('base64') })
    }
    if (u.pathname === '/robots.txt') return new Response('User-agent: *\nDisallow: /private\n', { headers: { 'Content-Type': 'text/plain' } })
    const claims = claimsOf.get(u.pathname)
    if (!claims) return new Response('not found', { status: 404 })
    const own = u.host.includes('examplecorp')
      ? 'The statement was released on the investor relations website of the company and signed by its management board this evening.'
      : 'Our newsroom followed the story through the night and spoke to analysts and traders in several financial centres about it.'
    const html = `<!doctype html><html lang="en"><head><title>${claims[0]}</title><meta property="og:site_name" content="${u.host}">
      <meta property="article:published_time" content="2026-10-27T22:00:00Z"></head><body><nav>Menu</nav>
      <article>${claims.map((c) => `<p>${c}.</p>`).join('')}<p>${own}</p><p>More details are expected later, the report said on its pages.</p></article></body></html>`
    return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
  }) as typeof fetch

  const clock = { now: Date.parse('2026-10-28T05:00:00Z') }
  const items = night()
  const llm = openAiLlm({ apiKey: config.openai.apiKey!, baseUrl: config.openai.baseUrl, timeoutMs: config.openai.timeoutMs }, fetchFn)
  const robots = new Map()
  const announced: string[] = []
  const d: Deps = {
    store: memoryStore(), config, problems, now: () => clock.now, llm,
    search: (l) => openAiSearch(l, config),
    tts: googleTts(config.tts, fetchFn, () => clock.now),
    fetchPage: (url, about) => fetchPage(url, about, config.web, robots, fetchFn, clock.now),
    pollerItems: async (from, to) => poller(items.filter((i) => Date.parse(i.pubDate) >= from && Date.parse(i.pubDate) < to), clock.now),
    onPublished: async (p) => { if (p) announced.push(p.id) },
    log: () => {},
  }
  await run({ d, clock, logs: [], announced: [], calls: {} }, () => d.store.getEdition('2026-10-28')?.status === 'published', 600)
  const e = d.store.getEdition('2026-10-28')!
  const pub = publicEdition(d, '2026-10-28')!
  assert.equal(pub.test, false)
  assert.ok(pub.stories.length >= 3)
  // sources: only what the searches returned, never the address the model made up; robots.txt read once per site
  for (const s of pub.stories) for (const src of s.sources) assert.ok(!src.url.includes('made-up'))
  assert.ok(invented > 0)
  assert.equal(log.filter((l) => l === 'GET www.example-news.com/robots.txt').length, 1)
  assert.ok(!log.some((l) => l.includes('made-up-by-the-model')), 'never fetched')
  // the models and the voice were checked first, then used
  assert.equal(log[0], 'GET api.openai.com/v1/models/gpt-6.1-sol')
  assert.ok(log.includes('GET texttospeech.googleapis.com/v1/voices'))
  // the audio and the usage
  const [, hash] = /-([0-9a-f]{12})\.mp3$/.exec(pub.audio.url)!
  assert.ok(inspect(audioOf(d, '2026-10-28', hash)!).seconds > 20)
  const usage = d.store.usage('2026-10-28')
  assert.ok(usage.some((u) => u.provider === 'openai' && u.stage === 'research' && u.webSearches === 1))
  assert.ok(usage.some((u) => u.provider === 'google-tts' && u.characters > 0 && u.costUsd === 0), 'within the free characters')
  assert.ok(e.costUsd > 0 && e.costUsd < config.limits.maxCostPerEditionUsd)
  assert.equal(usage.filter((u) => u.provider === 'openai').every((u) => u.model === 'gpt-6.1-sol-2026-09-30'), true)
  assert.deepEqual(announced, ['2026-10-28'])
})
