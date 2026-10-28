// The OpenAI client: what it sends, how it reads answers, refusals, cut-off answers and errors; usage and costs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { costOf, openAiLlm, ProviderError, worstCost } from '../../worker/briefing/llm'
import { obj, str } from '../../worker/briefing/schemas'

const schema = obj({ answer: str(20) })
const req = { stage: 'triage', model: 'model-x', instructions: 'Do it.', input: 'data', schemaName: 'answer', schema, maxOutputTokens: 500 }
const reply = (body: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'x-request-id': 'req_1', ...headers } })
const message = (text: string, annotations: unknown[] = []) => ({ type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text, annotations }] })
const usage = { input_tokens: 1200, input_tokens_details: { cached_tokens: 200 }, output_tokens: 300, output_tokens_details: { reasoning_tokens: 100 } }

function client(answer: (url: string, init: RequestInit) => Response) {
  const sent: { url: string; body: Record<string, unknown>; headers: Headers }[] = []
  const llm = openAiLlm({ apiKey: 'sk-test', baseUrl: 'https://api.openai.com/v1', timeoutMs: 5000 }, (async (url: string, init: RequestInit) => {
    sent.push({ url, body: init.body ? JSON.parse(init.body as string) : {}, headers: new Headers(init.headers) })
    return answer(url, init)
  }) as typeof fetch)
  return { llm, sent }
}

test('the request: Responses API, strict JSON schema, nothing stored, no temperature; the answer read from output[]', async () => {
  const { llm, sent } = client(() => reply({ status: 'completed', model: 'model-x-2026-10-01', output: [{ type: 'reasoning', summary: [] }, message('{"answer":"tak"}')], usage }))
  const r = await llm.call<{ answer: string }>({ ...req, effort: 'low' })
  assert.deepEqual(r.value, { answer: 'tak' })
  assert.equal(r.model, 'model-x-2026-10-01')
  assert.equal(r.requestId, 'req_1')
  assert.deepEqual(r.usage, { inputTokens: 1200, cachedTokens: 200, outputTokens: 300, reasoningTokens: 100, webSearches: 0 })
  const { url, body, headers } = sent[0]
  assert.equal(url, 'https://api.openai.com/v1/responses')
  assert.equal(headers.get('authorization'), 'Bearer sk-test')
  assert.equal(body.model, 'model-x')
  assert.equal(body.instructions, 'Do it.')
  assert.equal(body.input, 'data')
  assert.equal(body.store, false)
  assert.equal(body.max_output_tokens, 500)
  assert.deepEqual(body.reasoning, { effort: 'low' })
  assert.ok(!('temperature' in body))
  const format = (body.text as { format: Record<string, unknown> }).format
  assert.equal(format.type, 'json_schema')
  assert.equal(format.strict, true)
  assert.equal(format.name, 'answer')
  assert.deepEqual(format.schema, { type: 'object', properties: { answer: { type: 'string' } }, required: ['answer'], additionalProperties: false }, 'string lengths are checked here, not sent')
  assert.ok(!('tools' in body))
})

test('web search: the tool, Polish location, the sources included; consulted and cited pages collected, searches counted', async () => {
  const { llm, sent } = client(() => reply({ status: 'completed', output: [
    { type: 'web_search_call', status: 'completed', action: { type: 'search', query: 'q', sources: [{ type: 'url', url: 'https://www.reuters.com/a' }] } },
    { type: 'web_search_call', status: 'completed', action: { type: 'open_page' } },
    message('{"answer":"ok"}', [{ type: 'url_citation', url: 'https://www.ft.com/b', title: 'B', start_index: 0, end_index: 2 }]),
  ], usage }))
  const r = await llm.call({ ...req, webSearch: { contextSize: 'low', maxCalls: 4, allowedDomains: ['reuters.com'] } })
  assert.deepEqual(r.sources.sort(), ['https://www.ft.com/b', 'https://www.reuters.com/a'])
  assert.equal(r.usage.webSearches, 1, 'opening a page is not a search')
  const body = sent[0].body
  assert.deepEqual(body.tools, [{ type: 'web_search', search_context_size: 'low', user_location: { type: 'approximate', country: 'PL', timezone: 'Europe/Warsaw' }, filters: { allowed_domains: ['reuters.com'] } }])
  assert.deepEqual(body.include, ['web_search_call.action.sources'])
  assert.equal(body.max_tool_calls, 4)
})

test('a refusal, a content filter and a missing answer are failures; a cut-off answer may be tried again', async () => {
  const cases: [unknown, 'retryable' | 'fatal', RegExp][] = [
    [{ status: 'completed', output: [{ type: 'message', content: [{ type: 'refusal', refusal: 'I cannot help' }] }], usage }, 'fatal', /refused/],
    [{ status: 'incomplete', incomplete_details: { reason: 'content_filter' }, output: [], usage }, 'fatal', /content_filter/],
    [{ status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' }, output: [message('{"answ')], usage }, 'retryable', /max_output_tokens/],
    [{ status: 'failed', error: { code: 'server_error', message: 'oops' }, output: [], usage }, 'retryable', /failed/],
    [{ status: 'completed', output: [], usage }, 'retryable', /no text/],
    [{ status: 'completed', output: [message('not json')], usage }, 'retryable', /not valid JSON/],
    [{ status: 'completed', output: [message('{"answer":"far too long for the twenty characters"}')], usage }, 'retryable', /does not fit the schema/],
    [{ status: 'completed', output: [message('{"answer":"ok","extra":1}')], usage }, 'retryable', /not allowed/],
  ]
  for (const [body, kind, re] of cases) {
    const { llm } = client(() => reply(body))
    await assert.rejects(llm.call(req), (e: unknown) => e instanceof ProviderError && e.kind === kind && re.test(e.message) && e.usage?.inputTokens === 1200)
  }
})

test('HTTP errors: limits and outages may be retried (honouring Retry-After), no credit or a wrong key may not', async () => {
  const cases: [number, unknown, Record<string, string>, 'retryable' | 'fatal', number | undefined][] = [
    [429, { error: { code: 'rate_limit_exceeded', message: 'slow down' } }, { 'retry-after': '7' }, 'retryable', 7000],
    [429, { error: { code: 'insufficient_quota', message: 'You exceeded your current quota' } }, {}, 'fatal', undefined],
    [503, { error: { message: 'overloaded' } }, { 'retry-after-ms': '1500' }, 'retryable', 1500],
    [500, {}, {}, 'retryable', undefined],
    [401, { error: { code: 'invalid_api_key' } }, {}, 'fatal', undefined],
    [400, { error: { code: 'invalid_request_error', message: 'Unsupported parameter' } }, {}, 'fatal', undefined],
  ]
  for (const [status, body, headers, kind, after] of cases) {
    const { llm } = client(() => reply(body, status, headers))
    await assert.rejects(llm.call(req), (e: unknown) => e instanceof ProviderError && e.kind === kind && e.status === status && e.retryAfterMs === after)
  }
  const { llm } = client(() => { throw Object.assign(new Error('t'), { name: 'TimeoutError' }) })
  await assert.rejects(llm.call(req), /no answer in 5 s/)
})

test('the model is checked before an edition: missing for this key is fatal', async () => {
  const ok = client(() => reply({ id: 'model-x', object: 'model' }))
  await ok.llm.checkModel('model-x')
  assert.equal(ok.sent[0].url, 'https://api.openai.com/v1/models/model-x')
  const missing = client(() => reply({ error: { code: 'model_not_found' } }, 404))
  await assert.rejects(missing.llm.checkModel('gpt-nonexistent'), (e: unknown) => e instanceof ProviderError && e.kind === 'fatal' && /not available to this API key/.test(e.message))
})

test('costs: cached tokens at their price, searches per call; the worst case of a call before it is made', () => {
  const p = { input: 2, cached: 0.1, output: 10 }
  const c = costOf({ inputTokens: 1_000_000, cachedTokens: 400_000, outputTokens: 100_000, reasoningTokens: 50_000, webSearches: 3 }, p, 10)
  assert.ok(Math.abs(c - (0.6 * 2 + 0.4 * 0.1 + 0.1 * 10 + 0.03)) < 1e-9)
  const w = worstCost({ instructions: 'x'.repeat(3000), input: 'y'.repeat(3000), maxOutputTokens: 10_000, webSearch: { contextSize: 'low', maxCalls: 4 } }, p, 10)
  assert.ok(Math.abs(w - ((2000 + 32_000) * 2 / 1e6 + 10_000 * 10 / 1e6 + 0.04)) < 1e-9)
})
