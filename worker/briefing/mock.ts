// BRIEFING_MODE=mock: the whole pipeline without one paid call or one request outside, for the tests and for trying it
// locally (wrangler dev). The news are the real ones the Poller has; the model, the search, the pages and the voice are
// made up here from them, consistently enough that every check in code runs on them as on real answers. An edition made
// this way is marked as a test everywhere (the page says so). Never for production.
import type { Llm, LlmRequest, LlmResult, Usage } from './llm'
import { silentMp3 } from './mp3'
import type { SearchProvider } from './search'
import type { TriageAnswer, TriageStory, VerifyAnswer, WriteAnswer, ValidateAnswer } from './schemas'
import type { Tts } from './tts'
import { registrableDomain, type Page } from './web'

const USAGE: Usage = { inputTokens: 1000, cachedTokens: 0, outputTokens: 200, reasoningTokens: 0, webSearches: 0 }

// The data block of a prompt (prompts.ts, untrusted)
export function dataOf<T>(input: string): T {
  const m = /<<<BEGIN [^>]*>>>\n([\s\S]*)\n<<<END [^>]*>>>/.exec(input)
  if (!m) throw new Error('mock: no data block')
  return JSON.parse(m[1]) as T
}

// What a mock claim says: the news' text, made fit to be read (no symbols, abbreviations or tickers)
export function speakable(s: string): string {
  return s.replace(/\$([A-Z]{1,5})\b/g, '$1').replace(/\b[A-Z]{2,8}:[A-Z.]{1,6}\b/g, '').replace(/[()[\]{}<>*#_`|\\]/g, ' ')
    .replace(/%/g, ' procent').replace(/\$/g, '').replace(/€/g, ' euro').replace(/£/g, ' funtów').replace(/¥/g, ' jenów')
    .replace(/\b(?:USD|EUR|PLN|GBP|CHF|JPY|CNY|EPS|YTD)\b/g, '').replace(/https?:\/\/\S+/g, '')
    .replace(/(?<![\p{L}])(?:mld|mln|tys|proc|pkt|zł|ok|np|tzw|godz|ws|wg|ub|br)\.?(?![\p{L}])/giu, '')
    .replace(/(?<![\p{L}])(?:r\/r|k\/k|m\/m|p\.p\.|bps|yoy|qoq)(?![\p{L}])/giu, '')
    .replace(/\s+([,.])/g, '$1').replace(/\s+/g, ' ').replace(/^[\s,.;:-]+|[\s,;:-]+$/g, '').slice(0, 280).trim() || 'Wiadomość bez treści'
}
const sentence = (s: string) => (/[.!?…]$/.test(s) ? s : `${s}.`)

export function mockLlm(): Llm {
  return {
    async checkModel() {},
    async call<T>(req: LlmRequest): Promise<LlmResult<T>> {
      let value: unknown
      if (req.schemaName === 'stories') {
        const data = dataOf<{ candidates: { id: string; title: string; polishTranslation?: string }[] }>(req.input)
        const answer: TriageAnswer = {
          stories: data.candidates.slice(0, 12).map((c, i) => ({
            id: `s${i + 1}`, candidateIds: [c.id], headline: speakable(c.polishTranslation ?? c.title).slice(0, 120), category: 'markets', importance: 5 - Math.min(4, Math.floor(i / 2)),
            claims: [{ id: `s${i + 1}c1`, text: speakable(c.polishTranslation ?? c.title), kind: 'event', eventTime: null, entities: ['Example'] }],
            queries: [c.title.slice(0, 100)], primaryDomains: [], whyItMatters: 'Test.',
          })),
        }
        value = answer
      } else if (req.schemaName === 'verification') {
        const data = dataOf<{ claims: { id: string; text: string }[]; sources: { id: string; excerpt: string }[] }>(req.input)
        const answer: VerifyAnswer = {
          claims: data.claims.map((c) => {
            const quote = sentence(c.text)
            const supports = data.sources.filter((s) => s.excerpt.includes(quote)).map((s) => ({ sourceId: s.id, quote }))
            return { claimId: c.id, verdict: supports.length ? 'supported' : 'insufficient', verifiedText: supports.length ? c.text : null, supports, contradictions: [], eventTime: null, market: null }
          }),
          oldNews: false, oldNewsReason: null,
        }
        value = answer
      } else if (req.schemaName === 'script') {
        const data = dataOf<{ stories: { id: string; workingHeadline: string; wordBudget: number; claims: { id: string; text: string }[] }[] }>(req.input)
        const pad = 'To jest wydanie testowe, przygotowane bez prawdziwego modelu językowego, więc treść służy tylko do sprawdzenia działania przeglądu.'
        const answer: WriteAnswer = {
          segments: data.stories.map((s) => {
            let text = s.claims.map((c) => sentence(c.text)).join(' ')
            do text = `${text} ${pad}`; while ((text.match(/\S+/g) ?? []).length < s.wordBudget * 0.9 && text.length < 1200)
            return { storyId: s.id, headline: s.workingHeadline.slice(0, 90) || 'Wiadomość', text: text.trim(), claimIds: s.claims.map((c) => c.id) }
          }),
        }
        value = answer
      } else if (req.schemaName === 'review') {
        value = { verdict: 'pass', issues: [] } satisfies ValidateAnswer
      } else throw new Error(`mock: no answer for ${req.schemaName}`)
      return { value: value as T, usage: USAGE, model: 'mock', requestId: null, sources: [] }
    },
  }
}

// Two made-up pages per story, on the domains reserved for examples (RFC 2606): never fetched, the mock reader makes them
export function mockSearch(): SearchProvider {
  return {
    name: 'mock',
    async search(story: TriageStory) {
      return { hits: ['example.com', 'example.org'].map((host) => ({ url: `https://${host}/news/${story.id}`, title: story.headline, publisher: host, primary: host === 'example.org', publishedAt: null })) }
    },
  }
}

const FILLER: Record<string, string> = {
  'example.com': 'The report was published by the example newsroom this morning, after our editors followed the developments through the night. ' +
    'They spoke to several analysts and traders in London, New York and Tokyo, who described the market reaction in some detail. ' +
    'More details are expected later today, when the newsroom will publish a longer analysis with charts and comments from economists.',
  'example.org': 'The statement was released on the official website of the example institution and signed by all members of its board. ' +
    'It was distributed to the press together with a short presentation and a table of figures for the previous quarters. ' +
    'The institution will publish a full annual report next month and hold a press conference for journalists in its headquarters.',
}

// A page about the story: what it is about (the story's headline and claims, as the pipeline passes them) and some text of its own
export function mockPage() {
  return async (url: string, about: string[]): Promise<Page> => {
    const host = new URL(url).hostname
    return {
      url, finalUrl: url, host, domain: registrableDomain(host), status: 'ok', title: about[0] ?? 'Example',
      publisher: host === 'example.org' ? 'Example Institution' : 'Example News', publishedAt: null, modifiedAt: null, lang: 'en', fetchedAt: Date.now(),
      excerpt: `${about.map(sentence).join(' ')}\n${FILLER[host] ?? ''}`,
    }
  }
}

// Silence of about the length the text would take to read
export function mockTts(): Tts {
  return {
    async checkVoice() {},
    async synthesize(text: string) { return silentMp3([...text].length * 0.065, { id3: true, infoFrame: true }) },
  }
}
