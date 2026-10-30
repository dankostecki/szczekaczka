// Shared by the briefing's tests: news items, the Poller's data, and a pipeline with mock services and a clock of its own
import type { NewsItem } from '../../src/lib/parse'
import type { PollerItems } from '../../worker/briefing/collect'
import { readConfig, type Env } from '../../worker/briefing/config'
import { mockLlm, mockPage, mockSearch, mockTts } from '../../worker/briefing/mock'
import { tick, type Deps } from '../../worker/briefing/pipeline'
import { memoryStore } from '../../worker/briefing/store'

let n = 0
export function item(source: string, title: string, pubDate: string, more: Partial<NewsItem> = {}): NewsItem {
  n++
  return { id: `${source}:X:${n}`, title, link: `https://${source.toLowerCase()}.example.net/${n}`, description: '', pubDate, source, label: 'X', ...more }
}

export function poller(items: NewsItem[], at: number): PollerItems {
  return { items, feeds: [{ key: 'WALTER:TELEGRAM', error: null, failures: 0, checkedAt: at }], at }
}

// The news of a night: distinct stories from several sources, all inside the window of the edition of `day` (19:30 the day before onwards)
export function night(count = 14, day = '2026-10-28'): NewsItem[] {
  const subjects = ['Fed', 'Nvidia', 'Orlen', 'ECB', 'Tesla', 'gold', 'Nikkei', 'Brent', 'KGHM', 'Apple', 'bitcoin', 'Treasury', 'Microsoft', 'PKO', 'Toyota', 'Samsung']
  const start = Date.parse(`${day}T00:00:00Z`) - 4.5 * 3600_000 // 20:30 or 21:30 in Warsaw the day before
  return subjects.slice(0, count).map((s, i) => item(i % 2 ? 'WALTER' : 'STOOQ', `${s} reports news number ${i + 1} about markets ${['alpha', 'beta', 'gamma', 'delta'][i % 4]} ${s.toLowerCase()}wise`,
    new Date(start + i * 15 * 60_000).toISOString()))
}

export interface Harness { d: Deps; clock: { now: number }; logs: string[]; announced: (string | null)[]; calls: Record<string, number> }

export function harness(env: Env = {}, opts: { items?: NewsItem[]; start?: string } = {}): Harness {
  const clock = { now: Date.parse(opts.start ?? '2026-10-28T04:59:00Z') } // 05:59 in Warsaw, a minute before the cutoff
  const { config, problems } = readConfig({ BRIEFING_MODE: 'mock', ...env })
  const logs: string[] = []
  const announced: (string | null)[] = []
  const calls: Record<string, number> = {}
  const llm = mockLlm()
  const counted = { ...llm, call: async <T,>(req: Parameters<typeof llm.call>[0]) => { calls[req.stage] = (calls[req.stage] ?? 0) + 1; return llm.call<T>(req) } }
  const items = opts.items ?? night()
  const d: Deps = {
    store: memoryStore(), config, problems, now: () => clock.now,
    llm: counted, search: () => mockSearch(), tts: mockTts(), fetchPage: mockPage(),
    pollerItems: async (from, to) => poller(items.filter((i) => !i.pubDate || (Date.parse(i.pubDate) >= from && Date.parse(i.pubDate) < to)), clock.now),
    onPublished: async (p) => { announced.push(p?.id ?? null) },
    log: (m) => logs.push(m),
  }
  return { d, clock, logs, announced, calls }
}

// Runs the loop as the alarm would, the clock jumping to each wake-up, until `until` holds (checked after each tick, before
// the clock moves on) or `max` ticks
export async function run(h: Harness, until: () => boolean, max = 400): Promise<number> {
  if (until()) return 0
  for (let i = 1; i <= max; i++) {
    const next = await tick(h.d)
    if (until()) return i
    if (next === null) throw new Error(`the loop stopped; last logs:\n${h.logs.slice(-8).join('\n')}`)
    h.clock.now = Math.max(h.clock.now + 1, next)
  }
  throw new Error(`not done in ${max} ticks; last logs:\n${h.logs.slice(-8).join('\n')}`)
}

// Workers AI as the ratings of importance see it (importance.ts). A chat model answers "number: score" for every headline of the request's last
// message; a decision model (Clef) answers a `score` level for every question; the score from `rate` (the headline's text and its number, 0 to 10, or
// null for a service that is down). Keeps what it was asked.
export interface AiCalls { n: number; users: string[]; systems: string[]; models: string[]; inputs: unknown[] }
export function fakeAi(rate: (headline: string, n: number) => number | string | null, calls: AiCalls = { n: 0, users: [], systems: [], models: [], inputs: [] }): { ai: Ai; calls: AiCalls } {
  const ai = {
    run: async (model: string, input: { messages?: { role: string; content: string }[]; questions?: Record<string, { instructions: { headline: string } }> }) => {
      calls.n++
      calls.models.push(model); calls.inputs.push(input)
      if (input.questions) {
        const rates = Object.entries(input.questions).map(([id, q]) => ({ id, score: rate(q.instructions.headline, Number(id.slice(1))) }))
        if (rates.some((r) => r.score === null)) throw new Error('the service is down')
        return {
          model: (input as { model?: string }).model,
          answers: Object.fromEntries(rates.map((r) => [r.id, { type: 'score', score: (Number(r.score) / 10) * 4, legend: {}, probabilities: {}, confidence: 0.9 }])),
          usage: { input_tokens: 1500, output_tokens: 0 },
        }
      }
      const messages = input.messages!
      const user = messages[messages.length - 1].content
      calls.users.push(user); calls.systems.push(messages[0].content)
      const lines = user.split('\n').flatMap((l) => { const m = /^(\d+)\. (.*)$/.exec(l); return m ? [{ n: Number(m[1]), text: m[2] }] : [] })
      const rates = lines.map((l) => ({ n: l.n, score: rate(l.text, l.n) }))
      if (rates.some((r) => r.score === null)) throw new Error('the service is down')
      return { choices: [{ message: { content: rates.map((r) => `${r.n}: ${r.score}`).join('\n') } }], usage: { prompt_tokens: 1500, completion_tokens: 200 } }
    },
  } as unknown as Ai
  return { ai, calls }
}
