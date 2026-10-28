// OpenAI's Responses API (POST /v1/responses), with structured outputs (a strict JSON schema), over plain fetch.
// Request and answer as OpenAI's official SDK types them (openai@7.45.1): `instructions`, `input`, `text.format`,
// `max_output_tokens`, `store`, `reasoning.effort`, the `web_search` tool with `include: ['web_search_call.action.sources']`;
// the answer's text is in output[] (messages with output_text or refusal parts), its usage in `usage`.
// Nothing is stored at OpenAI (store: false). No temperature: reasoning models refuse it.
import type { Effort, Prices } from './config'
import { apiSchema, validate, type Schema } from './schemas'

export interface Usage { inputTokens: number; cachedTokens: number; outputTokens: number; reasoningTokens: number; webSearches: number }
export const NO_USAGE: Usage = { inputTokens: 0, cachedTokens: 0, outputTokens: 0, reasoningTokens: 0, webSearches: 0 }

// A failure of an outside service. retryable: worth another try later (a limit, an outage, a broken answer); fatal: it will
// fail the same way (a wrong key, a model the key cannot use, no credit), so the edition stops at once.
export class ProviderError extends Error {
  usage?: Usage // what the failed call was billed for, when it got that far
  constructor(message: string, public kind: 'retryable' | 'fatal', public status?: number, public retryAfterMs?: number) { super(message) }
}

export interface LlmRequest {
  stage: string
  model: string
  instructions: string
  input: string
  schemaName: string
  schema: Schema
  maxOutputTokens: number
  effort?: Effort
  webSearch?: { contextSize: 'low' | 'medium' | 'high'; allowedDomains?: string[]; maxCalls: number }
}

export interface LlmResult<T> {
  value: T
  usage: Usage
  model: string          // as OpenAI answered (the dated version of the id)
  requestId: string | null
  sources: string[]      // pages the web search consulted (action.sources) and cited (url_citation)
}

export interface Llm {
  call<T>(req: LlmRequest): Promise<LlmResult<T>>
  checkModel(id: string): Promise<void>
}

export function costOf(u: Usage, p: Prices, webSearchPer1000: number): number {
  const fresh = Math.max(0, u.inputTokens - u.cachedTokens)
  return (fresh * p.input + u.cachedTokens * p.cached + u.outputTokens * p.output) / 1e6 + (u.webSearches * webSearchPer1000) / 1000
}

// The most a call can cost: its input (at about 3 characters a token, which overestimates JSON and Polish), all its output
// tokens, and each allowed search with 8000 tokens of pages
export function worstCost(req: Pick<LlmRequest, 'instructions' | 'input' | 'maxOutputTokens' | 'webSearch'>, p: Prices, webSearchPer1000: number): number {
  const input = Math.ceil((req.instructions.length + req.input.length) / 3)
  const searches = req.webSearch?.maxCalls ?? 0
  return ((input + searches * 8000) * p.input + req.maxOutputTokens * p.output) / 1e6 + (searches * webSearchPer1000) / 1000
}

type Fetch = typeof fetch

// "Retry-After" in seconds or as a date; "retry-after-ms" first. Only waits of a minute or less are honoured here.
function retryAfter(h: Headers): number | undefined {
  const ms = Number(h.get('retry-after-ms'))
  if (Number.isFinite(ms) && ms > 0) return ms
  const v = h.get('retry-after')
  if (!v) return undefined
  const s = Number(v)
  if (Number.isFinite(s)) return s * 1000
  const at = Date.parse(v)
  return Number.isFinite(at) ? Math.max(0, at - Date.now()) : undefined
}

const NO_CREDIT = /insufficient_quota|credit_balance|spend_limit|billing/i

export async function httpError(res: Response, what: string): Promise<ProviderError> {
  let detail = ''
  try { const j = await res.json() as { error?: { message?: string; code?: string; type?: string } }; detail = [j.error?.code, j.error?.type, j.error?.message].filter(Boolean).join(': ') } catch { /* not JSON */ }
  detail = detail.slice(0, 300)
  const s = res.status
  const message = `${what}: HTTP ${s}${detail ? ` (${detail})` : ''}`
  if (s === 429 && NO_CREDIT.test(detail)) return new ProviderError(message, 'fatal', s)
  if (s === 408 || s === 409 || s === 429 || s >= 500) return new ProviderError(message, 'retryable', s, retryAfter(res.headers))
  return new ProviderError(message, 'fatal', s)
}

interface ApiResponse {
  id?: string
  model?: string
  status?: string
  error?: { message?: string; code?: string } | null
  incomplete_details?: { reason?: string } | null
  output?: {
    type: string
    content?: { type: string; text?: string; refusal?: string; annotations?: { type: string; url?: string }[] }[]
    action?: { type?: string; sources?: { type: string; url?: string }[] }
  }[]
  usage?: {
    input_tokens?: number; output_tokens?: number
    input_tokens_details?: { cached_tokens?: number }
    output_tokens_details?: { reasoning_tokens?: number }
  }
}

const usageOf = (body: ApiResponse): Usage => ({
  inputTokens: body.usage?.input_tokens ?? 0,
  cachedTokens: body.usage?.input_tokens_details?.cached_tokens ?? 0,
  outputTokens: body.usage?.output_tokens ?? 0,
  reasoningTokens: body.usage?.output_tokens_details?.reasoning_tokens ?? 0,
  webSearches: (body.output ?? []).filter((o) => o.type === 'web_search_call' && (o.action?.type ?? 'search') === 'search').length,
})

export function readResponse(body: ApiResponse): { text: string; usage: Usage; sources: string[] } {
  const usage = usageOf(body)
  if (body.status === 'failed') throw new ProviderError(`OpenAI: the response failed (${body.error?.code ?? ''} ${body.error?.message ?? ''})`.trim(), 'retryable')
  if (body.status === 'incomplete') {
    const why = body.incomplete_details?.reason ?? 'unknown'
    throw new ProviderError(`OpenAI: incomplete answer (${why})`, why === 'content_filter' ? 'fatal' : 'retryable')
  }
  if (body.status && body.status !== 'completed') throw new ProviderError(`OpenAI: response status ${body.status}`, 'retryable')
  const sources = new Set<string>()
  let text = ''
  for (const o of body.output ?? []) {
    for (const s of o.action?.sources ?? []) if (s.url) sources.add(s.url)
    if (o.type !== 'message') continue
    for (const c of o.content ?? []) {
      if (c.type === 'refusal') throw new ProviderError(`OpenAI: the model refused (${(c.refusal ?? '').slice(0, 200)})`, 'fatal')
      if (c.type === 'output_text') {
        text += c.text ?? ''
        for (const a of c.annotations ?? []) if (a.type === 'url_citation' && a.url) sources.add(a.url)
      }
    }
  }
  if (!text) throw new ProviderError('OpenAI: no text in the answer', 'retryable')
  return { text, usage, sources: [...sources] }
}

export function openAiLlm(opts: { apiKey: string; baseUrl: string; timeoutMs: number }, fetchFn: Fetch = fetch): Llm {
  const headers = { Authorization: `Bearer ${opts.apiKey}`, 'Content-Type': 'application/json' }
  return {
    async checkModel(id) {
      let res: Response
      try {
        res = await fetchFn(`${opts.baseUrl}/models/${encodeURIComponent(id)}`, { headers, signal: AbortSignal.timeout(20_000) })
      } catch (e) { throw new ProviderError(`OpenAI: no connection (${(e as Error).name})`, 'retryable') }
      if (res.status === 404) throw new ProviderError(`OpenAI: the model "${id}" is not available to this API key`, 'fatal', 404)
      if (!res.ok) throw await httpError(res, 'OpenAI /models')
    },

    async call<T>(req: LlmRequest): Promise<LlmResult<T>> {
      const body: Record<string, unknown> = {
        model: req.model,
        instructions: req.instructions,
        input: req.input,
        text: { format: { type: 'json_schema', name: req.schemaName, schema: apiSchema(req.schema), strict: true } },
        max_output_tokens: req.maxOutputTokens,
        store: false,
        metadata: { app: 'szczekaczka-briefing', stage: req.stage },
      }
      if (req.effort) body.reasoning = { effort: req.effort }
      if (req.webSearch) {
        body.tools = [{
          type: 'web_search',
          search_context_size: req.webSearch.contextSize,
          user_location: { type: 'approximate', country: 'PL', timezone: 'Europe/Warsaw' },
          ...(req.webSearch.allowedDomains?.length ? { filters: { allowed_domains: req.webSearch.allowedDomains } } : {}),
        }]
        body.include = ['web_search_call.action.sources']
        body.max_tool_calls = req.webSearch.maxCalls
      }
      let res: Response
      try {
        res = await fetchFn(`${opts.baseUrl}/responses`, { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(opts.timeoutMs) })
      } catch (e) {
        const timeout = (e as Error)?.name === 'TimeoutError'
        throw new ProviderError(timeout ? `OpenAI: no answer in ${Math.round(opts.timeoutMs / 1000)} s` : 'OpenAI: no connection', 'retryable')
      }
      const requestId = res.headers.get('x-request-id')
      if (!res.ok) throw await httpError(res, `OpenAI ${req.stage}`)
      let parsed: ApiResponse
      try { parsed = await res.json() as ApiResponse } catch { throw new ProviderError('OpenAI: the answer is not JSON', 'retryable') }
      // A failed answer was still billed: its usage goes with the error, to be logged
      const billed = usageOf(parsed)
      try {
        const { text, usage, sources } = readResponse(parsed)
        let value: unknown
        try { value = JSON.parse(text) } catch { throw new ProviderError('OpenAI: the structured answer is not valid JSON', 'retryable') }
        const problems = validate(req.schema, value)
        if (problems.length) throw new ProviderError(`OpenAI: the answer does not fit the schema (${problems.slice(0, 3).join('; ')})`, 'retryable')
        return { value: value as T, usage, model: parsed.model ?? req.model, requestId, sources }
      } catch (e) {
        if (e instanceof ProviderError) e.usage = billed
        throw e
      }
    },
  }
}
