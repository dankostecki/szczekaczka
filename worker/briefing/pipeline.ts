// The morning briefing, step by step. Each call of tick() does at most one step (one outside call: a model, a search,
// a page, a piece of audio), saves what it got, and says when to wake up next; the Durable Object (do.ts) calls it from its
// alarm. So every step is small (the free plan's 10 ms of CPU and 50 requests per call), a step that is done is never
// repeated or paid for again, and after a crash or a deploy the edition goes on from where it stopped.
//
//   prepare → collect → rank → triage → for each story: search, page×n, verify → select → write ⇄ validate → tts×n → assemble → publish
//
// An edition is one per Polish date (its id): a second start of the same day does nothing. A failed step is tried again
// after 1, 2, 4… minutes, up to BRIEFING_MAX_STEP_ATTEMPTS times and never after the deadline; a story whose research
// fails is left out; anything else that fails stops the edition, and the page keeps the last one that came out.
// Nothing is published unless every stage succeeded: no partial audio, no unverified story, no text the checks rejected.
import type { PublicEdition, BriefingPointer, BriefingIndex, TodayState, BriefingStory } from '../../src/lib/briefing'
import { type BriefingConfig, type Stage, missingForLive, modelOf, targetWords, STAGES } from './config'
import { inWindow, rank, type Candidate, type CollectStats, type PollerItems, type WindowItem } from './collect'
import { ProviderError, costOf, worstCost, type Llm, type LlmRequest, type Usage } from './llm'
import { joinMp3, inspect } from './mp3'
import { PROMPT_VERSION, TRIAGE, VERIFY, WRITE, VALIDATE, clean, untrusted } from './prompts'
import { triageSchema, verifySchema, writeSchema, validateSchema, type TriageAnswer, type TriageStory, type VerifyAnswer, type WriteAnswer, type ValidateAnswer } from './schemas'
import { chunkText, greeting, lintScript, scriptText, wordCount, SIGN_OFF, type Script } from './script'
import { pickPages, type SearchHit, type SearchProvider } from './search'
import { AUDIO_SLICE, type Store, type StepRecord, type UsageRow } from './store'
import { actualCutoff, addDays, dayLabel, dueEdition, editionIdAt, editionTimes, isEditionId, nextCutoff, relativeDay, warsawHHMM, warsawLabel, weekday, type EditionTimes } from './time'
import type { Tts } from './tts'
import { checkStory, originDomains, type CheckedPage, type CheckedStory } from './verify'
import type { Page } from './web'

export const PIPELINE_VERSION = '1'
const STEP_GAP_MS = 500
const MAX_RETRY_MS = 15 * 60_000
const TAVILY_PER_SEARCH = 0.008 // pay as you go; the free credits are not counted (an upper bound)

export type EditionStatus = 'running' | 'waiting' | 'awaiting_approval' | 'published' | 'failed' | 'rejected'

export interface EditionRecord {
  id: string
  mode: 'live' | 'mock'
  status: EditionStatus
  manual: boolean
  times: EditionTimes
  createdAt: number
  updatedAt: number
  collectedAt?: number
  cutoff?: number          // the actual cutoff (times.cutoff is the configured one)
  generatedAt?: number
  publishedAt?: number
  finishedAt?: number
  failure?: { step: string; message: string }
  retry?: { step: string; at: number; error: string }
  costUsd: number          // estimated, from the usage logged
  approval: 'auto' | 'manual'
  versions: { pipeline: string; prompts: string; models: Record<Stage, string>; search: string; voice: string; ttsEndpoint: string; speakingRate: number | null }
  notes: string[]
  public?: PublicEdition
}

export interface Deps {
  store: Store
  config: BriefingConfig
  problems: string[]                                      // of the configuration (readConfig)
  now: () => number
  llm: Llm | null
  search: ((llm: Llm) => SearchProvider) | null
  tts: Tts | null
  fetchPage: (url: string, about: string[]) => Promise<Page>
  pollerItems: (from: number, to: number) => Promise<PollerItems>
  onPublished: (latest: BriefingPointer | null) => Promise<void>
  log: (message: string) => void
}

// A rule says there is no edition today (too few stories, the cost cap, a script that failed its checks): not worth retrying
export class RuleFailure extends Error {
  constructor(message: string, public output?: unknown) { super(message) }
}
// The money set aside for the edition would not cover the next call. In research, the stories not yet checked are left out
// (a quarter of the cap is kept for writing and checking the script); anywhere else the edition stops.
export class CostCap extends RuleFailure {}
const RESEARCH_SHARE = 0.75

// ── Outputs of the steps ──
export interface CollectOutput { items: WindowItem[]; stats: CollectStats; collectedAt: number; cutoff: number }
export interface RankOutput { candidates: Candidate[]; groups: number }
export interface TriageOutput { stories: TriageStory[]; model: string }
export interface SearchOutput { provider: string; hits: SearchHit[]; pages: string[] }
export interface VerifyOutput { checked: CheckedStory; pages: string[] }
export interface SelectOutput { stories: { id: string; budget: number }[]; dropped: { id: string; headline: string; reason: string }[] }
export interface WriteOutput { script: Script; model: string }
export interface ValidateOutput { pass: boolean; lint: string[]; issues: ValidateAnswer['issues']; chunks: string[] }
export interface TtsOutput { index: number; characters: number; textBytes: number; textSha: string; audioBytes: number; audioSha: string; seconds: number }
export interface AssembleOutput { manifest: Manifest }
export interface Manifest {
  edition: string
  scriptSha: string
  audioSha: string
  bytes: number
  seconds: number
  sampleRate: number
  parts: { textSha: string; characters: number; audioSha: string; seconds: number }[]
  voice: string
  languageCode: string
  ttsModel: string
  ttsEndpoint: string
  speakingRate: number | null
  openaiModels: Record<string, string>
  pipeline: string
  prompts: string
}

type StepResult = { output: unknown; status?: 'done' | 'skipped'; patch?: Partial<EditionRecord> }

const STORY_STEP = /^(search|page|verify):/

export async function sha256(data: Uint8Array | string): Promise<string> {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))
  return Array.from(d, (b) => b.toString(16).padStart(2, '0')).join('')
}

const monthStart = (now: number) => { const d = new Date(now); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) }
const iso = (ms: number) => new Date(ms).toISOString()

// ── Creating an edition ──
function versionsOf(d: Deps): EditionRecord['versions'] {
  const c = d.config
  return {
    pipeline: PIPELINE_VERSION, prompts: PROMPT_VERSION,
    models: Object.fromEntries(STAGES.map((s) => [s, c.mode === 'mock' ? 'mock' : modelOf(c, s)])) as Record<Stage, string>,
    search: c.search.provider, voice: c.mode === 'mock' ? 'mock' : c.tts.voice, ttsEndpoint: c.tts.endpoint, speakingRate: c.tts.speakingRate ?? null,
  }
}

function create(d: Deps, times: EditionTimes, manual: boolean): EditionRecord {
  const now = d.now()
  const e: EditionRecord = {
    id: times.id, mode: d.config.mode === 'mock' ? 'mock' : 'live', status: 'running', manual, times, createdAt: now, updatedAt: now,
    costUsd: 0, approval: d.config.approval, versions: versionsOf(d), notes: [],
  }
  const missing = [...d.problems, ...(e.mode === 'live' ? missingForLive(d.config) : [])]
  if (missing.length) {
    e.status = 'failed'
    e.failure = { step: 'config', message: `not configured: ${missing.join('; ')}` }
    e.finishedAt = now
    d.log(`briefing ${e.id}: ${e.failure.message}`)
  } else d.log(`briefing ${e.id}: started (${e.mode}${manual ? ', by hand' : ''})`)
  d.store.putEdition(e)
  return e
}

// ── Which step is next ──
function stepState(store: Store, id: string) {
  const get = <T>(k: string) => store.getStep<T>(id, k)
  const done = (k: string) => { const s = get(k); return !!s && (s.status === 'done' || s.status === 'skipped') }
  const out = <T>(k: string) => get<T>(k)?.output
  return { get, done, out }
}

export function nextStep(store: Store, e: EditionRecord, c: BriefingConfig): string | null {
  const { done, out, get } = stepState(store, e.id)
  for (const k of ['prepare', 'collect', 'rank', 'triage']) if (!done(k)) return k
  for (const s of out<TriageOutput>('triage')!.stories) {
    if (!done(`search:${s.id}`)) return `search:${s.id}`
    const pages = out<SearchOutput>(`search:${s.id}`)?.pages ?? []
    for (let i = 0; i < pages.length; i++) if (!done(`page:${s.id}:${i}`)) return `page:${s.id}:${i}`
    if (!done(`verify:${s.id}`)) return `verify:${s.id}`
  }
  if (!done('select')) return 'select'
  let passed = 0
  for (let n = 1; n <= c.limits.maxWriteAttempts; n++) {
    if (!done(`write:${n}`)) return `write:${n}`
    if (!done(`validate:${n}`)) return `validate:${n}`
    if (out<ValidateOutput>(`validate:${n}`)!.pass) { passed = n; break }
  }
  if (!passed) return null // validate:max throws: the edition has failed already
  const chunks = out<ValidateOutput>(`validate:${passed}`)!.chunks
  for (let i = 0; i < chunks.length; i++) if (!done(`tts:${i}`)) return `tts:${i}`
  for (const k of ['assemble', 'publish']) if (!done(k)) return k
  void get
  return null
}

// ── The steps ──
function storyOf(d: Deps, e: EditionRecord, id: string): TriageStory {
  const s = stepState(d.store, e.id).out<TriageOutput>('triage')!.stories.find((x) => x.id === id)
  if (!s) throw new RuleFailure(`no story ${id}`)
  return s
}

function linksOf(d: Deps, e: EditionRecord, story: TriageStory): string[] {
  const candidates = stepState(d.store, e.id).out<RankOutput>('rank')!.candidates
  return story.candidateIds.flatMap((id) => candidates.find((c) => c.id === id)?.links ?? [])
}

const scaled = (tokens: number, attempt: number) => Math.round(tokens * (1 + 0.5 * (attempt - 1)))
const passedRound = (d: Deps, e: EditionRecord) => {
  const { out } = stepState(d.store, e.id)
  for (let n = 1; n <= d.config.limits.maxWriteAttempts; n++) if (out<ValidateOutput>(`validate:${n}`)?.pass) return n
  return 0
}

// A model call within the caps, its usage logged (a failed call too: it was billed)
function metered(d: Deps, e: EditionRecord): Llm {
  const llm = d.llm
  if (!llm) throw new RuleFailure('no language model configured')
  const per1000 = d.config.openai.webSearchPer1000
  const record = (stage: string, model: string, usage: Usage, ok: boolean, requestId: string | null) => {
    const prices = e.mode === 'mock' ? { input: 0, cached: 0, output: 0 } : d.config.openai.prices[model] ?? d.config.openai.prices[modelOf(d.config, stage as Stage)]
    const costUsd = prices ? costOf(usage, prices, e.mode === 'mock' ? 0 : per1000) : 0
    addUsage(d, e, { provider: 'openai', stage, model, ...usage, characters: 0, costUsd, requestId, ok })
  }
  return {
    checkModel: (id) => llm.checkModel(id),
    async call<T>(req: LlmRequest) {
      if (e.mode === 'live') {
        const prices = d.config.openai.prices[req.model]
        if (!prices) throw new RuleFailure(`no prices for ${req.model} (BRIEFING_OPENAI_PRICES)`)
        const worst = worstCost(req, prices, per1000)
        const spent = d.store.getEdition(e.id)?.costUsd ?? 0
        const cap = d.config.limits.maxCostPerEditionUsd * (req.stage === 'research' || req.stage === 'verify' ? RESEARCH_SHARE : 1)
        if (spent + worst > cap) {
          throw new CostCap(`cost cap of the edition: $${spent.toFixed(3)} spent, the next call (${req.stage}) could cost up to $${worst.toFixed(3)}, cap $${cap.toFixed(2)}`)
        }
        const month = d.store.costSince(monthStart(d.now()))
        if (month + worst > d.config.limits.maxCostPerMonthUsd) {
          throw new CostCap(`monthly cost cap: $${month.toFixed(2)} spent this month, the next call could cost up to $${worst.toFixed(3)}, cap $${d.config.limits.maxCostPerMonthUsd}`)
        }
      }
      try {
        const r = await llm.call<T>(req)
        record(req.stage, r.model, r.usage, true, r.requestId)
        return r
      } catch (err) {
        if (err instanceof ProviderError && err.usage) record(req.stage, req.model, err.usage, false, null)
        throw err
      }
    },
  }
}

function addUsage(d: Deps, e: EditionRecord, u: Omit<UsageRow, 'edition' | 'at'>) {
  d.store.addUsage({ edition: e.id, at: d.now(), ...u })
  const cur = d.store.getEdition(e.id)
  if (cur) { cur.costUsd += u.costUsd; cur.updatedAt = d.now(); d.store.putEdition(cur) }
  d.log(`briefing ${e.id} usage ${u.provider}/${u.stage}${u.model ? ` ${u.model}` : ''}: ` +
    (u.provider === 'google-tts' ? `${u.characters} characters` : `in ${u.inputTokens} (cached ${u.cachedTokens}) out ${u.outputTokens} (reasoning ${u.reasoningTokens}) searches ${u.webSearches}`) +
    ` ≈ $${u.costUsd.toFixed(4)} estimated${u.ok ? '' : ' (failed call)'}`)
}

const STEPS: Record<string, (d: Deps, e: EditionRecord, key: string, attempt: number) => Promise<StepResult>> = {
  async prepare(d, e) {
    if (e.mode === 'live') {
      if (!d.llm || !d.tts) throw new RuleFailure('the services are not configured')
      for (const id of new Set(Object.values(e.versions.models))) await d.llm.checkModel(id)
      await d.tts.checkVoice()
    }
    return { output: { checkedAt: d.now(), models: e.versions.models, voice: e.versions.voice } }
  },

  async collect(d, e) {
    const data = await d.pollerItems(e.times.from, e.times.to)
    const collectedAt = d.now()
    const cutoff = actualCutoff(collectedAt, e.times)
    const r = inWindow(data, e.times, cutoff, d.config)
    const notes = r.stats.feedProblems.length ? [`channels failing at the cutoff: ${r.stats.feedProblems.join(', ')}`] : []
    const output: CollectOutput = { items: r.items, stats: r.stats, collectedAt, cutoff }
    if (r.items.length < d.config.minStories) throw new RuleFailure(`only ${r.items.length} news stories in the window`, { ...output, items: [] })
    return { output, patch: { collectedAt, cutoff, notes: [...e.notes, ...notes] } }
  },

  async rank(d, e) {
    const { items } = stepState(d.store, e.id).out<CollectOutput>('collect')!
    const r = rank(items, d.config)
    if (r.candidates.length < d.config.minStories) throw new RuleFailure(`only ${r.candidates.length} distinct stories in the window`, r)
    return { output: r satisfies RankOutput }
  },

  async triage(d, e, _key, attempt) {
    const { cutoff } = stepState(d.store, e.id).out<CollectOutput>('collect')!
    const { candidates } = stepState(d.store, e.id).out<RankOutput>('rank')!
    const previous = d.store.listEditions(5).find((x) => x.id < e.id && x.status === 'published')?.public
    const input = untrusted('NEWS', {
      edition: { date: dayLabel(e.id), windowFrom: warsawLabel(e.times.from), cutoff: warsawLabel(cutoff) },
      previousEdition: previous ? { date: dayLabel(previous.id), headlines: previous.stories.map((s) => s.headline) } : null,
      candidates: candidates.map((c) => ({
        id: c.id, sources: c.sources, published: `${warsawLabel(Date.parse(c.publishedAt))} (${c.publishedAt})`,
        title: clean(c.title, 300), lead: clean(c.lead, 400), ...(c.translation ? { polishTranslation: clean(c.translation, 500) } : {}),
      })),
    })
    const r = await metered(d, e).call<TriageAnswer>({
      stage: 'triage', model: e.versions.models.triage, instructions: TRIAGE, input, schemaName: 'stories',
      schema: triageSchema(d.config.maxResearch + 4), maxOutputTokens: scaled(16_000, attempt), effort: d.config.openai.effort,
    })
    // Only candidates that exist, ids that cannot clash, the most important first
    const known = new Set(candidates.map((c) => c.id))
    const stories = r.value.stories
      .map((s) => ({ ...s, candidateIds: [...new Set(s.candidateIds.filter((id) => known.has(id)))] }))
      .filter((s) => s.candidateIds.length && s.claims.length)
      .sort((a, b) => b.importance - a.importance)
      .slice(0, d.config.maxResearch)
      .map((s, i): TriageStory => {
        const id = `s${i + 1}`
        return { ...s, id, claims: s.claims.map((c, k) => ({ ...c, id: `${id}c${k + 1}` })) }
      })
    if (!stories.length) throw new RuleFailure('no story was picked')
    return { output: { stories, model: r.model } satisfies TriageOutput }
  },

  async search(d, e, key) {
    const story = storyOf(d, e, key.split(':')[1])
    if (!d.search) throw new RuleFailure('no search provider configured')
    const cutoff = e.cutoff ?? e.times.cutoff
    const provider = d.search(metered(d, e))
    const r = await provider.search(story, { windowFrom: iso(e.times.from), cutoff: iso(cutoff) })
    if (provider.name === 'tavily') addUsage(d, e, { provider: 'tavily', stage: 'research', model: '', inputTokens: 0, cachedTokens: 0, outputTokens: 0,
      reasoningTokens: 0, webSearches: Math.min(2, story.queries.length), characters: 0, costUsd: e.mode === 'mock' ? 0 : TAVILY_PER_SEARCH * Math.min(2, story.queries.length), requestId: null, ok: true })
    const pages = pickPages(r.hits, d.config, linksOf(d, e, story))
    return { output: { provider: provider.name, hits: r.hits.slice(0, 12), pages: pages.map((p) => p.url) } satisfies SearchOutput }
  },

  async page(d, e, key) {
    const [, sid, i] = key.split(':')
    const story = storyOf(d, e, sid)
    const url = stepState(d.store, e.id).out<SearchOutput>(`search:${sid}`)!.pages[Number(i)]
    const about = [story.headline, ...story.claims.map((c) => c.text), ...story.claims.flatMap((c) => c.entities), ...story.queries]
    return { output: await d.fetchPage(url, about) }
  },

  async verify(d, e, key, attempt) {
    const sid = key.split(':')[1]
    const story = storyOf(d, e, sid)
    const { out } = stepState(d.store, e.id)
    const urls = out<SearchOutput>(`search:${sid}`)?.pages ?? []
    const pages: CheckedPage[] = urls.map((_, i) => out<Page>(`page:${sid}:${i}`)).filter((p): p is Page => !!p).map((p, i) => ({ ...p, id: `p${i + 1}` }))
    const readable = pages.filter((p) => p.status === 'ok' && p.excerpt)
    const ctx = { originDomains: originDomains(linksOf(d, e, story)), windowFrom: e.times.from, editionYear: Number(e.id.slice(0, 4)) }
    if (readable.length < d.config.verify.minSources) {
      const answer: VerifyAnswer = { claims: [], oldNews: false, oldNewsReason: null }
      const checked = { ...checkStory(story, pages, answer, ctx, d.config), usable: false, reason: `${readable.length} readable source(s), ${d.config.verify.minSources} needed` }
      return { output: { checked, pages: pages.map((p) => `${p.id} ${p.status} ${p.finalUrl}`) } satisfies VerifyOutput }
    }
    const cutoff = e.cutoff ?? e.times.cutoff
    const input = untrusted('CHECK', {
      edition: { windowFrom: `${warsawLabel(e.times.from)} (${iso(e.times.from)})`, cutoff: `${warsawLabel(cutoff)} (${iso(cutoff)})` },
      claims: story.claims.map((c) => ({ id: c.id, kind: c.kind, text: clean(c.text, 400), eventTime: c.eventTime })),
      sources: readable.map((p) => ({ id: p.id, publisher: p.publisher ?? p.domain, title: p.title ?? '', url: p.finalUrl,
        publishedAt: p.publishedAt ?? null, modifiedAt: p.modifiedAt ?? null, excerpt: clean(p.excerpt!, 3200) })),
    })
    const r = await metered(d, e).call<VerifyAnswer>({
      stage: 'verify', model: e.versions.models.verify, instructions: VERIFY, input, schemaName: 'verification',
      schema: verifySchema(), maxOutputTokens: scaled(8000, attempt), effort: d.config.openai.effort,
    })
    const checked = checkStory(story, pages, r.value, ctx, d.config)
    return { output: { checked, pages: pages.map((p) => `${p.id} ${p.status} ${p.finalUrl}`) } satisfies VerifyOutput }
  },

  async select(d, e) {
    const { out } = stepState(d.store, e.id)
    const triage = out<TriageOutput>('triage')!
    const checked = triage.stories.map((s) => out<VerifyOutput>(`verify:${s.id}`)?.checked).filter((c): c is CheckedStory => !!c)
    const order = new Map(triage.stories.map((s, i) => [s.id, i]))
    const usable = checked.filter((c) => c.usable)
      .sort((a, b) => b.importance - a.importance || b.claims.filter((x) => x.kept).length - a.claims.filter((x) => x.kept).length || order.get(a.id)! - order.get(b.id)!)
    const chosen = usable.slice(0, d.config.maxStories)
    const dropped = [
      ...triage.stories.filter((s) => !checked.some((c) => c.id === s.id)).map((s) => ({ id: s.id, headline: s.headline, reason: 'research failed' })),
      ...checked.filter((c) => !c.usable).map((c) => ({ id: c.id, headline: c.headline, reason: c.reason ?? 'not verified' })),
      ...usable.slice(d.config.maxStories).map((c) => ({ id: c.id, headline: c.headline, reason: 'no room' })),
    ]
    const output = { stories: [] as SelectOutput['stories'], dropped }
    if (chosen.length < d.config.minStories) throw new RuleFailure(`only ${chosen.length} verified stories, ${d.config.minStories} needed`, output)
    const fixed = wordCount(greeting(e.id, d.config.windowStart, warsawHHMM(e.cutoff ?? e.times.cutoff))) + wordCount(SIGN_OFF)
    const available = Math.max(60, targetWords(d.config) - fixed)
    const weight = chosen.reduce((n, c) => n + c.importance, 0)
    output.stories = chosen.map((c) => ({ id: c.id, budget: Math.max(30, Math.min(120, Math.round((available * c.importance) / weight))) }))
    return { output: output satisfies SelectOutput }
  },

  async write(d, e, key, attempt) {
    const n = Number(key.split(':')[1])
    const { out } = stepState(d.store, e.id)
    const sel = out<SelectOutput>('select')!
    const checked = new Map(sel.stories.map((s) => [s.id, out<VerifyOutput>(`verify:${s.id}`)!.checked]))
    const previous = n > 1 ? out<ValidateOutput>(`validate:${n - 1}`) : undefined
    const input = untrusted('STORIES', {
      edition: { date: dayLabel(e.id) },
      totalWords: sel.stories.reduce((x, s) => x + s.budget, 0),
      stories: sel.stories.map((s) => {
        const c = checked.get(s.id)!
        return {
          id: s.id, workingHeadline: c.headline, wordBudget: s.budget,
          claims: c.claims.filter((x) => x.kept).map((x) => ({
            id: x.id, kind: x.kind, text: x.text,
            when: x.eventTime && Number.isFinite(Date.parse(x.eventTime)) ? `${relativeDay(Date.parse(x.eventTime), e.id)}, ${warsawLabel(Date.parse(x.eventTime))} czasu polskiego` : null,
            market: x.market, sources: [...new Set(x.sources.map((src) => src.publisher))],
          })),
        }
      }),
      issuesToFix: previous ? [...previous.lint, ...previous.issues.map((i) => `${i.storyId}: ${i.type}: „${i.excerpt}” – ${i.explanation}`)] : [],
    })
    const r = await metered(d, e).call<WriteAnswer>({
      stage: 'write', model: e.versions.models.write, instructions: WRITE, input, schemaName: 'script',
      schema: writeSchema(d.config.maxStories), maxOutputTokens: scaled(10_000, attempt), effort: d.config.openai.effort,
    })
    const rank = new Map(sel.stories.map((s, i) => [s.id, i]))
    const segments = r.value.segments.filter((s) => rank.has(s.storyId)).sort((a, b) => rank.get(a.storyId)! - rank.get(b.storyId)!)
    const script: Script = { intro: greeting(e.id, d.config.windowStart, warsawHHMM(e.cutoff ?? e.times.cutoff)), segments, outro: SIGN_OFF }
    return { output: { script, model: r.model } satisfies WriteOutput }
  },

  async validate(d, e, key, attempt) {
    const n = Number(key.split(':')[1])
    const { out } = stepState(d.store, e.id)
    const sel = out<SelectOutput>('select')!
    const { script } = out<WriteOutput>(`write:${n}`)!
    const checked = new Map(sel.stories.map((s) => [s.id, out<VerifyOutput>(`verify:${s.id}`)!.checked]))
    const target = targetWords(d.config)
    const lint = lintScript(script, {
      storyIds: sel.stories.map((s) => s.id),
      claims: new Map([...checked].map(([id, c]) => [id, new Map(c.claims.filter((x) => x.kept).map((x) => [x.id, x.text!]))])),
      minWords: Math.round(target * 0.6), maxWords: Math.round(target * 1.3), years: [Number(e.id.slice(0, 4)), Number(e.id.slice(0, 4)) - 1],
    })
    let issues: ValidateAnswer['issues'] = []
    let pass = lint.length === 0
    if (pass) {
      const input = untrusted('SCRIPT', {
        segments: script.segments.map((s) => ({
          storyId: s.storyId, headline: s.headline, text: s.text,
          facts: checked.get(s.storyId)!.claims.filter((x) => x.kept && s.claimIds.includes(x.id)).map((x) => ({
            id: x.id, text: x.text,
            when: x.eventTime && Number.isFinite(Date.parse(x.eventTime)) ? `${relativeDay(Date.parse(x.eventTime), e.id)}, ${warsawLabel(Date.parse(x.eventTime))} czasu polskiego` : null,
            market: x.market,
          })),
        })),
        editionDate: dayLabel(e.id),
      })
      const r = await metered(d, e).call<ValidateAnswer>({
        stage: 'validate', model: e.versions.models.validate, instructions: VALIDATE, input, schemaName: 'review',
        schema: validateSchema(), maxOutputTokens: scaled(6000, attempt), effort: d.config.openai.effort,
      })
      issues = r.value.issues
      pass = r.value.verdict === 'pass' && !issues.some((i) => i.severity === 'error')
    }
    const output: ValidateOutput = { pass, lint, issues, chunks: pass ? chunkText(scriptText(script), d.config.tts.maxChunkBytes) : [] }
    if (!pass && n >= d.config.limits.maxWriteAttempts) throw new RuleFailure(`the script did not pass the checks in ${n} attempts`, output)
    return { output }
  },

  async tts(d, e, key) {
    const i = Number(key.split(':')[1])
    if (!d.tts) throw new RuleFailure('no voice configured')
    const text = stepState(d.store, e.id).out<ValidateOutput>(`validate:${passedRound(d, e)}`)!.chunks[i]
    const characters = [...text].length
    const estimate = ttsUsage(d, e, characters, true)
    if (d.store.costSince(monthStart(d.now())) + estimate.costUsd > d.config.limits.maxCostPerMonthUsd) throw new CostCap('monthly cost cap reached before the audio')
    const audio = await d.tts.synthesize(text)
    addUsage(d, e, estimate)
    let info
    try { info = inspect(audio) } catch (err) { throw new ProviderError(`Text-to-Speech: ${(err as Error).message}`, 'retryable') }
    // Speech is about 15 characters a second: far off that, the audio is not the text (cut short, or something else)
    const perChar = info.seconds / characters
    if (perChar < 0.025 || perChar > 0.2) throw new ProviderError(`Text-to-Speech: ${info.seconds.toFixed(1)} s of audio for ${characters} characters`, 'retryable')
    d.store.putAudio(e.id, 'part', i, audio)
    return { output: {
      index: i, characters, textBytes: new TextEncoder().encode(text).length, textSha: await sha256(text),
      audioBytes: audio.length, audioSha: await sha256(audio), seconds: info.seconds,
    } satisfies TtsOutput }
  },

  async assemble(d, e) {
    const { out } = stepState(d.store, e.id)
    const round = passedRound(d, e)
    const { chunks } = out<ValidateOutput>(`validate:${round}`)!
    const { script } = out<WriteOutput>(`write:${round}`)!
    const outputs = chunks.map((_, i) => out<TtsOutput>(`tts:${i}`)!)
    const parts = chunks.map((_, i) => d.store.getAudio(e.id, 'part', i))
    if (parts.some((p) => !p)) throw new RuleFailure('a piece of the audio is missing')
    for (const [i, p] of parts.entries()) if (await sha256(p!) !== outputs[i].audioSha) throw new RuleFailure(`audio piece ${i} changed after it was made`)
    let joined
    try { joined = joinMp3(parts as Uint8Array[]) } catch (err) { throw new RuleFailure(`the audio cannot be joined: ${(err as Error).message}`) }
    const expected = outputs.reduce((n, o) => n + o.seconds, 0)
    if (Math.abs(joined.info.seconds - expected) > 0.5) throw new RuleFailure(`the joined audio is ${joined.info.seconds.toFixed(1)} s, its pieces ${expected.toFixed(1)} s`)
    const text = scriptText(script)
    if (chunks.join(' ').replace(/\s+/g, ' ') !== text.replace(/\s+/g, ' ')) throw new RuleFailure('the audio pieces are not the script')
    const audioSha = await sha256(joined.bytes)
    d.store.deleteAudio(e.id, 'file')
    for (let k = 0; k * AUDIO_SLICE < joined.bytes.length; k++) d.store.putAudio(e.id, 'file', k, joined.bytes.subarray(k * AUDIO_SLICE, (k + 1) * AUDIO_SLICE))
    const manifest: Manifest = {
      edition: e.id, scriptSha: await sha256(text), audioSha, bytes: joined.bytes.length, seconds: Math.round(joined.info.seconds * 10) / 10,
      sampleRate: joined.info.sampleRate,
      parts: outputs.map((o) => ({ textSha: o.textSha, characters: o.characters, audioSha: o.audioSha, seconds: o.seconds })),
      voice: e.versions.voice, languageCode: d.config.tts.languageCode,
      ttsModel: e.mode === 'mock' ? 'mock' : /Chirp3-HD/.test(e.versions.voice) ? 'Chirp 3: HD' : 'unknown', ttsEndpoint: e.versions.ttsEndpoint,
      speakingRate: e.versions.speakingRate,
      openaiModels: Object.fromEntries(['triage', 'write'].map((s) => [s, (out<{ model?: string }>(s === 'write' ? `write:${round}` : s)?.model) ?? ''])),
      pipeline: PIPELINE_VERSION, prompts: e.versions.prompts,
    }
    const now = d.now()
    const sel = out<SelectOutput>('select')!
    const stories: BriefingStory[] = script.segments.map((s) => {
      const c = out<VerifyOutput>(`verify:${s.storyId}`)!.checked
      const cited = c.claims.filter((x) => x.kept && s.claimIds.includes(x.id))
      const sources = [...new Map(cited.flatMap((x) => x.sources).map((src) => [src.url, src])).values()]
      return { id: s.storyId, headline: s.headline, text: s.text,
        sources: sources.map((src) => ({ title: src.title, publisher: src.publisher, url: src.url, publishedAt: src.publishedAt, modifiedAt: src.modifiedAt })) }
    })
    void sel
    const pub: PublicEdition = {
      id: e.id, window: { from: iso(e.times.from), to: iso(e.times.to) }, cutoff: iso(e.cutoff ?? e.times.cutoff), generatedAt: iso(now), publishedAt: null,
      late: false, audio: { url: `/api/briefing/audio/${e.id}-${audioSha.slice(0, 12)}.mp3`, seconds: manifest.seconds, bytes: manifest.bytes },
      intro: script.intro, outro: script.outro, stories, test: e.mode === 'mock',
    }
    d.store.deleteAudio(e.id, 'part')
    return { output: { manifest } satisfies AssembleOutput, patch: { generatedAt: now, public: pub } }
  },

  async publish(d, e) {
    const now = d.now()
    pruneExcerpts(d, e)
    if (e.approval === 'manual') return { output: { status: 'awaiting_approval' }, patch: { status: 'awaiting_approval' } }
    if (now < e.times.publishAt) return { output: { status: 'waiting' }, patch: { status: 'waiting' } }
    return { output: { status: 'published' }, patch: published(e, now) }
  },
}

function ttsUsage(d: Deps, e: EditionRecord, characters: number, ok: boolean): Omit<UsageRow, 'edition' | 'at'> {
  // Characters this month beyond the free ones are billed (an estimate: Google counts the month in its own way)
  const before = d.store.ttsCharsSince(monthStart(d.now()))
  const free = d.config.tts.freeCharsPerMonth
  const billed = Math.max(0, before + characters - free) - Math.max(0, before - free)
  const costUsd = e.mode === 'mock' ? 0 : (billed * d.config.tts.perMillionChars) / 1e6
  return { provider: 'google-tts', stage: 'tts', model: e.versions.voice, inputTokens: 0, cachedTokens: 0, outputTokens: 0, reasoningTokens: 0, webSearches: 0, characters, costUsd, requestId: null, ok }
}

function published(e: EditionRecord, now: number): Partial<EditionRecord> {
  return {
    status: 'published', publishedAt: now, finishedAt: now,
    ...(e.public ? { public: { ...e.public, publishedAt: iso(now), late: now > e.times.publishAt + 5 * 60_000 } } : {}),
  }
}

// After the check, only the short quotes stay: the paragraphs read from the pages were for the check, not to keep
function pruneExcerpts(d: Deps, e: EditionRecord) {
  for (const [key, step] of d.store.steps(e.id)) {
    if (!key.startsWith('page:') || !step.output) continue
    const page = step.output as Page
    if (page.excerpt) d.store.putStep(e.id, key, { ...step, output: { ...page, excerpt: undefined, excerptChars: page.excerpt.length } })
  }
}

function fail(d: Deps, e: EditionRecord, step: string, message: string) {
  const now = d.now()
  const cur = d.store.getEdition(e.id) ?? e
  Object.assign(cur, { status: 'failed', failure: { step, message: message.slice(0, 1000) }, finishedAt: now, updatedAt: now })
  delete cur.retry
  d.store.putEdition(cur)
  pruneExcerpts(d, cur)
  d.store.deleteAudio(cur.id, 'part')
  d.log(`briefing ${cur.id}: failed at ${step}: ${message}`)
}

async function announce(d: Deps) {
  const latest = d.store.listEditions(60).find((x) => x.status === 'published')
  await d.onPublished(latest?.publishedAt ? { id: latest.id, publishedAt: iso(latest.publishedAt) } : null)
}

// One step of the running edition; when to wake up next
async function advance(d: Deps, e: EditionRecord): Promise<number> {
  const key = nextStep(d.store, e, d.config)
  if (!key) { fail(d, e, 'plan', 'no step left before publication'); return d.now() + STEP_GAP_MS }
  const kind = key.split(':')[0]
  const prev = d.store.getStep(e.id, key)
  const attempt = (prev?.attempts ?? 0) + 1
  const startedAt = d.now()
  try {
    const r = await STEPS[kind](d, e, key, attempt)
    const cur = d.store.getEdition(e.id)
    if (!cur || cur.status !== 'running') return d.now() + STEP_GAP_MS // stopped or rejected meanwhile: drop the result
    d.store.putStep(e.id, key, { status: r.status ?? 'done', attempts: attempt, output: r.output, startedAt, finishedAt: d.now() } satisfies StepRecord)
    Object.assign(cur, r.patch ?? {}, { updatedAt: d.now() })
    delete cur.retry
    d.store.putEdition(cur)
    const status = cur.status as EditionStatus // the step may have changed it (publish)
    if (status === 'published') { d.log(`briefing ${cur.id}: published`); await announce(d) }
    else if (status !== 'running') d.log(`briefing ${cur.id}: ${status}`)
    return d.now() + STEP_GAP_MS
  } catch (err) {
    const cur = d.store.getEdition(e.id)
    if (!cur || cur.status !== 'running') return d.now() + STEP_GAP_MS
    const message = err instanceof Error ? err.message : String(err)
    const record = (status: StepRecord['status'], extra: Partial<StepRecord> = {}) =>
      d.store.putStep(e.id, key, { status, attempts: attempt, error: message.slice(0, 1000), startedAt, finishedAt: d.now(), ...extra })
    const storyStep = STORY_STEP.test(key)
    if (err instanceof CostCap && storyStep) {
      record('skipped')
      d.log(`briefing ${e.id}: ${key} left out: ${message}`)
      return d.now() + STEP_GAP_MS
    }
    if (err instanceof RuleFailure) { record('failed', err.output ? { output: err.output } : {}); fail(d, cur, key, message); return d.now() + STEP_GAP_MS }
    // A model that will not answer about one story (a refusal, a content filter): without that story
    const aboutContent = err instanceof ProviderError && err.kind === 'fatal' && err.status === undefined
    if (err instanceof ProviderError && err.kind === 'fatal' && !(storyStep && aboutContent)) { record('failed'); fail(d, cur, key, message); return d.now() + STEP_GAP_MS }
    if (storyStep && (aboutContent || attempt >= d.config.limits.maxStepAttempts)) {
      record('skipped')
      d.log(`briefing ${e.id}: ${key} given up (${message}); the story is left out`)
      return d.now() + STEP_GAP_MS
    }
    if (attempt >= d.config.limits.maxStepAttempts) { record('failed'); fail(d, cur, key, `${attempt} attempts: ${message}`); return d.now() + STEP_GAP_MS }
    if (!(err instanceof ProviderError)) console.error(`briefing ${e.id}: ${key}`, err)
    const wait = Math.min(MAX_RETRY_MS, Math.max(err instanceof ProviderError ? err.retryAfterMs ?? 0 : 0, d.config.limits.retryBaseMs * 2 ** (attempt - 1)))
    const at = d.now() + wait
    record('failed', { retryAt: at })
    cur.retry = { step: key, at, error: message.slice(0, 300) }
    cur.updatedAt = d.now()
    d.store.putEdition(cur)
    d.log(`briefing ${e.id}: ${key} failed (attempt ${attempt}), again in ${Math.round(wait / 1000)} s: ${message}`)
    return at
  }
}

// ── The loop ──
export async function tick(d: Deps): Promise<number | null> {
  const now = d.now()
  const recent = d.store.listEditions(10)
  // A finished edition whose time has come
  for (const e of recent) {
    if (e.status === 'waiting' && now >= e.times.publishAt) {
      Object.assign(e, published(e, now), { updatedAt: now })
      d.store.putEdition(e)
      d.log(`briefing ${e.id}: published`)
      await announce(d)
    }
  }
  const running = recent.find((e) => e.status === 'running')
  // Switched off, or to the other mode, while an edition was under way: it stops (a mock edition must not go on with paid services)
  if (running && running.mode !== d.config.mode) {
    fail(d, running, 'config', d.config.mode === 'off' ? 'BRIEFING_MODE was switched off' : `BRIEFING_MODE changed to ${d.config.mode}`)
    return d.config.mode === 'off' ? null : d.now() + STEP_GAP_MS
  }
  if (running) {
    if (now >= running.times.deadline) fail(d, running, running.retry?.step ?? nextStep(d.store, running, d.config) ?? 'deadline', `the deadline (${warsawLabel(running.times.deadline)}) passed before the edition was ready${running.retry ? `; last error: ${running.retry.error}` : ''}`)
    else if (running.retry && running.retry.at > now) return running.retry.at
    else return advance(d, running)
  }
  if (d.config.mode === 'off') return null
  const due = dueEdition(now, d.config)
  if (due && !d.store.getEdition(due.id)) {
    const e = create(d, due, false)
    if (e.status === 'running') return d.now() + STEP_GAP_MS
  }
  await housekeeping(d, now)
  const waiting = recent.filter((e) => e.status === 'waiting').map((e) => e.times.publishAt)
  return Math.min(nextCutoff(now, d.config), ...waiting)
}

// Editions older than BRIEFING_RETENTION_DAYS go, with their audio; the news list's pointer follows
async function housekeeping(d: Deps, now: number) {
  const oldest = addDays(editionIdAt(now), -d.config.retentionDays)
  let gone = false
  for (const e of d.store.listEditions(400)) {
    if (e.id < oldest && e.status !== 'running') { gone ||= e.status === 'published'; d.store.deleteEdition(e.id) }
  }
  if (gone) await announce(d)
}

// ── By hand (the admin endpoints) ──
export function startByHand(d: Deps, id: string, force: boolean): { ok: boolean; message: string } {
  const now = d.now()
  if (d.config.mode === 'off') return { ok: false, message: 'BRIEFING_MODE is off' }
  if (!isEditionId(id) || id > editionIdAt(now)) return { ok: false, message: 'expected the date of today or of a past day, YYYY-MM-DD' }
  const old = d.store.getEdition(id)
  if (old?.status === 'running') return { ok: false, message: 'this edition is under way' }
  if (d.store.listEditions(10).some((e) => e.status === 'running')) return { ok: false, message: 'another edition is under way' }
  if (old && !force) return { ok: false, message: `this edition exists (${old.status}); add force=1 to make it again (a new run costs again)` }
  if (old) d.store.deleteEdition(id)
  const t = editionTimes(id, d.config)
  // A past day, or today after its time: published as soon as it is ready, with time to finish
  const times = { ...t, publishAt: Math.min(t.publishAt, now), deadline: Math.max(t.deadline, now + 3 * 3600_000) }
  const e = create(d, times, true)
  return e.status === 'running' ? { ok: true, message: `started ${id}` } : { ok: false, message: e.failure?.message ?? 'not started' }
}

export async function approve(d: Deps, id: string): Promise<{ ok: boolean; message: string }> {
  const e = d.store.getEdition(id)
  if (!e || e.status !== 'awaiting_approval') return { ok: false, message: 'no edition waiting for approval with this date' }
  const now = d.now()
  if (now < e.times.publishAt) Object.assign(e, { status: 'waiting', updatedAt: now })
  else Object.assign(e, published(e, now), { updatedAt: now })
  d.store.putEdition(e)
  const status = e.status as EditionStatus
  if (status === 'published') await announce(d)
  d.log(`briefing ${id}: approved (${status})`)
  return { ok: true, message: status }
}

export async function reject(d: Deps, id: string, reason: string): Promise<{ ok: boolean; message: string }> {
  const e = d.store.getEdition(id)
  if (!e || !['awaiting_approval', 'waiting', 'published', 'running'].includes(e.status)) return { ok: false, message: 'no edition to withdraw with this date' }
  const was = e.status
  Object.assign(e, { status: 'rejected', failure: { step: 'review', message: `withdrawn by hand: ${reason}`.slice(0, 500) }, finishedAt: d.now(), updatedAt: d.now() })
  d.store.putEdition(e)
  if (was === 'published') await announce(d)
  d.log(`briefing ${id}: withdrawn (${reason})`)
  return { ok: true, message: 'rejected' }
}

// ── What the page gets ──
export function publicIndex(d: Deps): BriefingIndex {
  const now = d.now()
  const id = editionIdAt(now)
  const t = editionTimes(id, d.config)
  const e = d.store.getEdition(id)
  let state: TodayState
  if (e?.status === 'published') state = 'published'
  else if (e && (e.status === 'failed' || e.status === 'rejected')) state = 'failed'
  else if (d.config.mode === 'off' || !d.config.days.includes(weekday(id))) state = 'none'
  else if (!e) state = now < t.cutoff ? 'scheduled' : now >= t.deadline ? 'failed' : now < t.publishAt ? 'preparing' : 'delayed'
  else state = now < t.publishAt ? 'preparing' : 'delayed'
  const editions = d.store.listEditions(60).filter((x) => x.status === 'published' && x.public).slice(0, 30).map((x) => ({
    id: x.id, publishedAt: x.public!.publishedAt ?? iso(x.publishedAt ?? x.updatedAt), seconds: x.public!.audio.seconds, stories: x.public!.stories.length, test: x.public!.test,
  }))
  return { today: { id, state, publishAt: iso(t.publishAt) }, schedule: { days: d.config.days, seconds: d.config.targetSeconds }, editions }
}

export function publicEdition(d: Deps, id: string): PublicEdition | null {
  const e = d.store.getEdition(id)
  return e?.status === 'published' && e.public ? e.public : null
}

// The edition's MP3, when its address (with the start of its hash) is the published one
export function audioOf(d: Deps, id: string, hash: string): Uint8Array | null {
  const e = d.store.getEdition(id)
  if (e?.status !== 'published' || !e.public || !e.public.audio.url.endsWith(`${id}-${hash}.mp3`)) return null
  const n = d.store.audioParts(id, 'file')
  const parts: Uint8Array[] = []
  for (let k = 0; k < n; k++) { const p = d.store.getAudio(id, 'file', k); if (!p) return null; parts.push(p) }
  const out = new Uint8Array(parts.reduce((x, p) => x + p.length, 0))
  let at = 0
  for (const p of parts) { out.set(p, at); at += p.length }
  return out.length === e.public.audio.bytes ? out : null
}

// ── For the operator (admin endpoints): everything, but never a secret ──
export function adminStatus(d: Deps) {
  const c = d.config
  return {
    mode: c.mode, approval: c.approval, problems: d.problems, missing: c.mode === 'live' ? missingForLive(c) : [],
    schedule: { days: c.days, windowStart: c.windowStart, windowEnd: c.windowEnd, cutoff: c.cutoff, publishAt: c.publishAt, deadline: c.deadline },
    models: Object.fromEntries(STAGES.map((s) => [s, c.openai.models[s] ?? null])), search: c.search.provider, voice: c.tts.voice,
    secrets: { OPENAI_API_KEY: !!c.openai.apiKey, TAVILY_API_KEY: !!c.search.tavilyKey, GOOGLE_TTS_API_KEY: !!c.tts.apiKey, GOOGLE_SERVICE_ACCOUNT_JSON: !!c.tts.serviceAccountJson },
    caps: c.limits, costThisMonthUsd: Math.round(d.store.costSince(monthStart(d.now())) * 1e4) / 1e4,
    costNote: 'estimated from the logged usage and the configured prices; the bills are in the OpenAI, Google Cloud and Tavily dashboards',
    editions: d.store.listEditions(14).map((e) => ({ id: e.id, status: e.status, mode: e.mode, costUsd: Math.round(e.costUsd * 1e4) / 1e4, failure: e.failure, retry: e.retry, notes: e.notes })),
  }
}

export function adminEdition(d: Deps, id: string) {
  const e = d.store.getEdition(id)
  if (!e) return null
  return { edition: e, next: e.status === 'running' ? nextStep(d.store, e, d.config) : null, steps: Object.fromEntries(d.store.steps(id)), usage: d.store.usage(id) }
}
