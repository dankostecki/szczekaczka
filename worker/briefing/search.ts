// Where to read about a story: a search provider behind one interface. Two real ones and the mock (mock.ts):
// - "openai": the web_search tool of the Responses API ($10 per 1000 searches, the pages it reads billed as input tokens);
//   only addresses its searches actually returned or cited are kept, never one the model wrote itself;
// - "tavily": Tavily's search API (1000 free credits a month, a basic search is 1 credit; https://docs.tavily.com).
// Either way the pages are then read by this server (web.ts): a search result alone verifies nothing.
import type { BriefingConfig } from './config'
import { modelOf } from './config'
import { ProviderError, httpError, type Llm, type Usage } from './llm'
import { RESEARCH, untrusted } from './prompts'
import { searchSchema, type SearchAnswer, type TriageStory } from './schemas'
import { checkUrl } from './web'

export interface SearchHit { url: string; title: string; publisher: string; primary: boolean; publishedAt: string | null }
export interface SearchResult { hits: SearchHit[]; usage?: Usage; model?: string; requestId?: string | null }

export interface SearchProvider {
  name: 'openai' | 'tavily' | 'mock'
  search(story: TriageStory, context: { windowFrom: string; cutoff: string }): Promise<SearchResult>
}

// The same page however it is written: no fragment, no tracking parameters, no trailing slash
export function sameUrl(u: string): string {
  try {
    const url = new URL(u)
    url.hash = ''
    for (const k of [...url.searchParams.keys()]) if (/^(utm_|fbclid|gclid|mc_|ref$|cmpid|ocid)/i.test(k)) url.searchParams.delete(k)
    return `${url.host.replace(/^www\./, '')}${url.pathname.replace(/\/$/, '')}${url.search}`.toLowerCase()
  } catch { return u }
}

export function openAiSearch(llm: Llm, c: BriefingConfig): SearchProvider {
  return {
    name: 'openai',
    async search(story, context) {
      const input = untrusted('STORY', {
        window: context,
        headline: story.headline,
        claims: story.claims.map((x) => x.text),
        suggestedQueries: story.queries,
        likelyPrimaryDomains: story.primaryDomains,
        resultsWanted: c.search.maxResults,
      })
      const r = await llm.call<SearchAnswer>({
        stage: 'research', model: modelOf(c, 'research'), instructions: RESEARCH, input, schemaName: 'sources',
        schema: searchSchema(c.search.maxResults + 2), maxOutputTokens: 6000, effort: c.openai.effort,
        webSearch: { contextSize: c.search.contextSize, maxCalls: 4 },
      })
      // Only what the searches returned: an address the model wrote itself is not a source
      const found = new Set(r.sources.map(sameUrl))
      const hits = r.value.results
        .filter((h) => found.has(sameUrl(h.url)))
        .map((h) => ({ url: h.url, title: h.title, publisher: h.publisher, primary: h.primary, publishedAt: null }))
      return { hits, usage: r.usage, model: r.model, requestId: r.requestId }
    },
  }
}

type Fetch = typeof fetch
interface TavilyAnswer { results?: { url?: string; title?: string; content?: string; published_date?: string; score?: number }[] }

export function tavilySearch(c: BriefingConfig, fetchFn: Fetch = fetch): SearchProvider {
  return {
    name: 'tavily',
    async search(story) {
      const hits: SearchHit[] = []
      const seen = new Set<string>()
      for (const query of story.queries.slice(0, 2)) {
        let res: Response
        try {
          res = await fetchFn('https://api.tavily.com/search', {
            method: 'POST',
            headers: { Authorization: `Bearer ${c.search.tavilyKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: query.slice(0, 400), topic: 'news', time_range: 'week', max_results: c.search.maxResults, include_answer: false, include_raw_content: false }),
            signal: AbortSignal.timeout(30_000),
          })
        } catch { throw new ProviderError('Tavily: no connection', 'retryable') }
        if (!res.ok) throw await httpError(res, 'Tavily')
        let body: TavilyAnswer
        try { body = await res.json() as TavilyAnswer } catch { throw new ProviderError('Tavily: the answer is not JSON', 'retryable') }
        for (const r of body.results ?? []) {
          if (typeof r.url !== 'string' || seen.has(sameUrl(r.url))) continue
          seen.add(sameUrl(r.url))
          let host = ''
          try { host = new URL(r.url).hostname.replace(/^www\./, '') } catch { continue }
          const published = r.published_date && Number.isFinite(Date.parse(r.published_date)) ? new Date(r.published_date).toISOString() : null
          hits.push({ url: r.url, title: String(r.title ?? '').slice(0, 300), publisher: host, primary: story.primaryDomains.some((d) => host === d || host.endsWith(`.${d}`)), publishedAt: published })
        }
      }
      return { hits }
    },
  }
}

// The pages to read: allowed addresses only, one per site, the likely primary sources first
export function pickPages(hits: SearchHit[], c: Pick<BriefingConfig, 'web'>, storyLinks: string[]): SearchHit[] {
  const own = new Set(storyLinks.map(sameUrl))
  const bySite = new Set<string>()
  const out: SearchHit[] = []
  for (const h of [...hits].sort((a, b) => Number(b.primary) - Number(a.primary))) {
    const ok = checkUrl(h.url, c.web)
    if (!ok.ok || own.has(sameUrl(h.url))) continue
    const site = ok.url.hostname.replace(/^www\./, '')
    if (bySite.has(site)) continue
    bySite.add(site)
    out.push({ ...h, url: ok.url.toString() })
    if (out.length >= c.web.maxPagesPerStory) break
  }
  return out
}
