// The morning briefing's settings: read from the Worker's environment (wrangler.jsonc "vars", the dashboard, secrets), with
// defaults for everything that has a safe one. Nothing paid runs unless BRIEFING_MODE is "live" and every secret it needs is
// set; the model has no default on purpose (docs/poranny-przeglad.md says which ids OpenAI listed when this was written).

export type Mode = 'off' | 'mock' | 'live'
export type Approval = 'auto' | 'manual'
export type SearchProviderName = 'openai' | 'tavily' | 'mock'
export type ClaimKind = 'event' | 'figure' | 'official' | 'quote' | 'market' | 'forecast'
export const CLAIM_KINDS: ClaimKind[] = ['event', 'figure', 'official', 'quote', 'market', 'forecast']
export type Stage = 'triage' | 'research' | 'verify' | 'write' | 'validate'
export const STAGES: Stage[] = ['triage', 'research', 'verify', 'write', 'validate']
export type Effort = 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max'
const EFFORTS: Effort[] = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']

// US dollars per 1 million tokens
export interface Prices { input: number; cached: number; output: number }

// OpenAI's list prices as its pricing page showed them on 2026-10-28 (read through search results: the page itself could
// not be opened from the build machine). Used only to estimate costs and to stop at the caps; BRIEFING_OPENAI_PRICES
// replaces or adds models. The bill in the OpenAI dashboard is what counts.
export const LIST_PRICES: Record<string, Prices> = {
  'gpt-6-astra': { input: 10, cached: 1, output: 50 },
  'gpt-6.1-sol': { input: 2, cached: 0.1, output: 10 },
  'gpt-6.1-terra': { input: 1, cached: 0.05, output: 5 },
  'gpt-6-luna': { input: 0.1, cached: 0.01, output: 0.5 },
}
// The web search tool of the Responses API: $10 per 1000 calls (the pages it reads are billed as input tokens)
export const WEB_SEARCH_PER_1000 = 10
// Google Cloud Text-to-Speech, Chirp 3: HD voices: 1 million characters a month free, then $30 per million (pricing page, 2026-10-28)
export const TTS_PER_MILLION_CHARS = 30
export const TTS_FREE_CHARS_PER_MONTH = 1_000_000

export interface BriefingConfig {
  mode: Mode
  approval: Approval
  days: number[]          // ISO weekdays with an edition (1 Monday … 7 Sunday)
  windowStart: string     // "HH:MM" of the day before, Warsaw time
  windowEnd: string       // "HH:MM" of the day of the edition: the end of the requested window
  cutoff: string          // the editorial cutoff: news published from then on are not in the edition
  publishAt: string       // when a finished edition goes out (sooner it waits, later it goes at once)
  deadline: string        // no new attempts after this; the page keeps the last edition
  targetSeconds: number
  wordsPerMinute: number
  maxCandidates: number   // RSS stories shown to the model that picks the stories
  maxResearch: number     // stories researched and verified
  maxStories: number      // stories in the edition at most
  minStories: number      // fewer verified stories than this: no edition
  sources: string[]       // the site's sources taken into the briefing
  openai: {
    apiKey?: string
    models: Record<Stage, string | undefined>
    effort?: Effort
    prices: Record<string, Prices>
    webSearchPer1000: number
    timeoutMs: number
    baseUrl: string
  }
  search: { provider: SearchProviderName; tavilyKey?: string; maxResults: number; contextSize: 'low' | 'medium' | 'high' }
  web: { maxPagesPerStory: number; timeoutMs: number; maxBytes: number; blockedDomains: string[]; userAgent: string; ownHosts: string[] }
  verify: { minSources: number; primaryFor: ClaimKind[]; staleHours: number }
  tts: {
    apiKey?: string
    serviceAccountJson?: string
    voice: string
    languageCode: string
    speakingRate?: number
    endpoint: string
    maxChunkBytes: number
    perMillionChars: number
    freeCharsPerMonth: number
    timeoutMs: number
  }
  limits: { maxCostPerEditionUsd: number; maxCostPerMonthUsd: number; maxStepAttempts: number; retryBaseMs: number; maxWriteAttempts: number }
  retentionDays: number
  adminToken?: string
  // The pack for ChatGPT without the API (pack.ts): made at `at` on the days of the briefing, whatever the mode.
  // Its settings' problems are its own: a wrong one does not stop an edition
  pack: { enabled: boolean; at: string; problems: string[] }
}

export type Env = Record<string, unknown>

const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/
export const minutesOf = (hhmm: string) => { const m = TIME.exec(hhmm)!; return Number(m[1]) * 60 + Number(m[2]) }

// "1-6", "1,2,3,4,5", "1-5,7"
function parseDays(s: string): number[] | null {
  const days = new Set<number>()
  for (const part of s.split(',').map((p) => p.trim()).filter(Boolean)) {
    const m = /^([1-7])(?:-([1-7]))?$/.exec(part)
    if (!m) return null
    const a = Number(m[1]), b = Number(m[2] ?? m[1])
    if (b < a) return null
    for (let d = a; d <= b; d++) days.add(d)
  }
  return days.size ? [...days].sort() : null
}

const DEFAULT_BLOCKED = [
  // social networks, video, forums and aggregators: not a source to verify a fact against
  'x.com', 'twitter.com', 'facebook.com', 'instagram.com', 'tiktok.com', 'threads.net', 'linkedin.com', 'reddit.com',
  'youtube.com', 'youtu.be', 't.me', 'telegram.org', 'news.google.com', 'msn.com', 'flipboard.com', 'stocktwits.com',
  'wykop.pl', 'pinterest.com', 'quora.com', 'medium.com', 'substack.com',
]

export function readConfig(env: Env): { config: BriefingConfig; problems: string[] } {
  const problems: string[] = []
  const str = (k: string): string | undefined => {
    const v = env[k]
    return typeof v === 'string' && v.trim() ? v.trim() : undefined
  }
  const num = (k: string, def: number, min: number, max: number): number => {
    const v = str(k)
    if (v === undefined) return def
    const n = Number(v)
    if (!Number.isFinite(n) || n < min || n > max) { problems.push(`${k}: expected a number from ${min} to ${max}, got "${v}"`); return def }
    return n
  }
  const time = (k: string, def: string): string => {
    const v = str(k) ?? def
    if (!TIME.test(v)) { problems.push(`${k}: expected HH:MM, got "${v}"`); return def }
    return v
  }
  const oneOf = <T extends string>(k: string, values: readonly T[], def: T): T => {
    const v = str(k)
    if (v === undefined) return def
    if (!(values as readonly string[]).includes(v)) { problems.push(`${k}: expected one of ${values.join(', ')}, got "${v}"`); return def }
    return v as T
  }
  const list = (k: string, def: string[]) => str(k)?.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean) ?? def

  const mode = oneOf<Mode>('BRIEFING_MODE', ['off', 'mock', 'live'], 'off')
  const days = parseDays(str('BRIEFING_DAYS') ?? '1-6')
  if (!days) problems.push('BRIEFING_DAYS: expected ISO weekdays such as "1-6" or "1,2,3,4,5"')

  const model = str('BRIEFING_OPENAI_MODEL')
  const models = Object.fromEntries(
    (['triage', 'research', 'verify', 'write', 'validate'] as Stage[]).map((s) => [s, str(`BRIEFING_OPENAI_MODEL_${s.toUpperCase()}`) ?? model]),
  ) as Record<Stage, string | undefined>
  const prices: Record<string, Prices> = { ...LIST_PRICES }
  const extra = str('BRIEFING_OPENAI_PRICES')
  if (extra) {
    try {
      const parsed = JSON.parse(extra) as Record<string, Partial<Prices>>
      for (const [id, p] of Object.entries(parsed)) {
        if (![p?.input, p?.output].every((x) => typeof x === 'number' && x >= 0)) throw new Error(id)
        prices[id] = { input: p.input!, output: p.output!, cached: typeof p.cached === 'number' ? p.cached : p.input! }
      }
    } catch { problems.push('BRIEFING_OPENAI_PRICES: expected JSON such as {"model-id":{"input":2,"cached":0.1,"output":10}} (USD per 1M tokens)') }
  }
  const effort = str('BRIEFING_OPENAI_REASONING_EFFORT')
  if (effort && !EFFORTS.includes(effort as Effort)) problems.push(`BRIEFING_OPENAI_REASONING_EFFORT: expected one of ${EFFORTS.join(', ')}`)

  const mark = problems.length
  const pack: BriefingConfig['pack'] = {
    enabled: oneOf('BRIEFING_PACK', ['on', 'off'] as const, 'on') === 'on',
    at: time('BRIEFING_PACK_AT', '07:45'),
    problems: [],
  }
  const packAt = minutesOf(pack.at)
  if (packAt < 3 * 60 || packAt > 12 * 60) problems.push('BRIEFING_PACK_AT must be from 03:00 to 12:00 (the pack is made in the morning)')
  pack.problems = problems.splice(mark)

  const rate = str('BRIEFING_TTS_SPEAKING_RATE')
  const speakingRate = rate === undefined ? undefined : num('BRIEFING_TTS_SPEAKING_RATE', 1, 0.25, 2)

  const config: BriefingConfig = {
    mode,
    approval: oneOf<Approval>('BRIEFING_APPROVAL', ['auto', 'manual'], 'auto'),
    days: days ?? [1, 2, 3, 4, 5, 6],
    windowStart: time('BRIEFING_WINDOW_START', '19:00'),
    windowEnd: time('BRIEFING_WINDOW_END', '07:00'),
    cutoff: time('BRIEFING_CUTOFF', '06:00'),
    publishAt: time('BRIEFING_PUBLISH_AT', '07:45'),
    deadline: time('BRIEFING_DEADLINE', '10:00'),
    targetSeconds: num('BRIEFING_TARGET_SECONDS', 180, 60, 900),
    wordsPerMinute: num('BRIEFING_WORDS_PER_MINUTE', 140, 90, 220),
    maxCandidates: num('BRIEFING_MAX_CANDIDATES', 50, 10, 120),
    maxResearch: num('BRIEFING_MAX_RESEARCH', 10, 3, 20),
    maxStories: num('BRIEFING_MAX_STORIES', 8, 2, 15),
    minStories: num('BRIEFING_MIN_STORIES', 3, 1, 10),
    // Not Seeking Alpha: its feed has no descriptions, and after the US close it floods the list with one-line items (results,
    // estimates) that say too little to check. BRIEFING_SOURCES can add it (and MacroNext's announcements are not news)
    sources: str('BRIEFING_SOURCES')?.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean)
      ?? ['WALTER', 'STOOQ', 'ESPI', 'GPW', 'PAP'],
    openai: {
      apiKey: str('OPENAI_API_KEY'),
      models,
      effort: effort && EFFORTS.includes(effort as Effort) ? effort as Effort : undefined,
      prices,
      webSearchPer1000: num('BRIEFING_WEB_SEARCH_PRICE_PER_1000', WEB_SEARCH_PER_1000, 0, 1000),
      timeoutMs: num('BRIEFING_OPENAI_TIMEOUT_S', 240, 10, 840) * 1000,
      baseUrl: 'https://api.openai.com/v1',
    },
    search: {
      provider: oneOf<SearchProviderName>('BRIEFING_SEARCH_PROVIDER', ['openai', 'tavily', 'mock'], mode === 'mock' ? 'mock' : 'openai'),
      tavilyKey: str('TAVILY_API_KEY'),
      maxResults: num('BRIEFING_SEARCH_MAX_RESULTS', 6, 2, 10),
      contextSize: oneOf('BRIEFING_SEARCH_CONTEXT_SIZE', ['low', 'medium', 'high'] as const, 'low'),
    },
    web: {
      maxPagesPerStory: num('BRIEFING_MAX_PAGES_PER_STORY', 5, 2, 8),
      timeoutMs: 10_000,
      maxBytes: 1_500_000,
      blockedDomains: [...DEFAULT_BLOCKED, ...list('BRIEFING_BLOCKED_DOMAINS', [])],
      userAgent: 'Mozilla/5.0 (compatible; SzczekaczkaBot/1.0; +https://github.com/dankostecki/szczekaczka)',
      ownHosts: ['szczekaczka.dancoder2025.workers.dev', 'dankostecki.github.io'],
    },
    verify: {
      minSources: num('BRIEFING_MIN_SOURCES', 2, 2, 4),
      primaryFor: (str('BRIEFING_PRIMARY_FOR')?.split(',').map((s) => s.trim()) ?? ['figure', 'official', 'quote', 'event'])
        .filter((k): k is ClaimKind => (CLAIM_KINDS as string[]).includes(k)),
      staleHours: num('BRIEFING_STALE_HOURS', 36, 12, 168),
    },
    tts: {
      apiKey: str('GOOGLE_TTS_API_KEY'),
      serviceAccountJson: str('GOOGLE_SERVICE_ACCOUNT_JSON'),
      voice: str('BRIEFING_TTS_VOICE') ?? 'pl-PL-Chirp3-HD-Aoede',
      languageCode: 'pl-PL',
      speakingRate,
      endpoint: oneOf('BRIEFING_TTS_ENDPOINT', ['https://texttospeech.googleapis.com', 'https://eu-texttospeech.googleapis.com'] as const,
        'https://texttospeech.googleapis.com'),
      // The API takes at most 5000 bytes of text; smaller parts keep each step light (a part is one alarm of the Durable Object)
      maxChunkBytes: num('BRIEFING_TTS_MAX_CHUNK_BYTES', 1800, 400, 4800),
      perMillionChars: num('BRIEFING_TTS_PRICE_PER_MILLION_CHARS', TTS_PER_MILLION_CHARS, 0, 1000),
      freeCharsPerMonth: num('BRIEFING_TTS_FREE_CHARS_PER_MONTH', TTS_FREE_CHARS_PER_MONTH, 0, 1e9),
      timeoutMs: 60_000,
    },
    limits: {
      maxCostPerEditionUsd: num('BRIEFING_MAX_COST_USD', 2, 0.01, 100),
      maxCostPerMonthUsd: num('BRIEFING_MAX_MONTHLY_COST_USD', 40, 0.01, 2000),
      maxStepAttempts: num('BRIEFING_MAX_STEP_ATTEMPTS', 4, 1, 10),
      retryBaseMs: 60_000,
      maxWriteAttempts: 3,
    },
    retentionDays: num('BRIEFING_RETENTION_DAYS', 30, 3, 365),
    adminToken: str('BRIEFING_ADMIN_TOKEN'),
    pack,
  }

  const [start, end, cut, pub, dead] = [config.windowStart, config.windowEnd, config.cutoff, config.publishAt, config.deadline].map(minutesOf)
  if (cut >= end) problems.push('BRIEFING_CUTOFF must be before BRIEFING_WINDOW_END')
  if (cut < 3 * 60) problems.push('BRIEFING_CUTOFF must be 03:00 or later (the edition is prepared in the morning)')
  if (end > 12 * 60) problems.push('BRIEFING_WINDOW_END must be at 12:00 or earlier')
  if (start < 12 * 60) problems.push('BRIEFING_WINDOW_START must be in the afternoon or evening of the day before (12:00 or later)')
  if (pub < cut) problems.push('BRIEFING_PUBLISH_AT must not be before BRIEFING_CUTOFF')
  if (dead <= pub) problems.push('BRIEFING_DEADLINE must be after BRIEFING_PUBLISH_AT')
  if (config.minStories > config.maxStories) problems.push('BRIEFING_MIN_STORIES must not be above BRIEFING_MAX_STORIES')
  if (config.maxStories > config.maxResearch) problems.push('BRIEFING_MAX_STORIES must not be above BRIEFING_MAX_RESEARCH')
  return { config, problems }
}

// What a live edition needs and does not have. Empty: it may run.
export function missingForLive(c: BriefingConfig): string[] {
  const missing: string[] = []
  if (!c.openai.apiKey) missing.push('OPENAI_API_KEY (secret)')
  for (const s of STAGES) {
    const id = c.openai.models[s]
    if (!id) { missing.push(`BRIEFING_OPENAI_MODEL (or BRIEFING_OPENAI_MODEL_${s.toUpperCase()})`); break }
  }
  for (const id of new Set(Object.values(c.openai.models).filter(Boolean) as string[])) {
    if (!c.openai.prices[id]) missing.push(`prices of ${id} in BRIEFING_OPENAI_PRICES (needed for the cost caps)`)
  }
  if (c.search.provider === 'tavily' && !c.search.tavilyKey) missing.push('TAVILY_API_KEY (secret)')
  if (c.search.provider === 'mock') missing.push('BRIEFING_SEARCH_PROVIDER=mock is for tests only: set openai or tavily')
  if (!c.tts.apiKey && !c.tts.serviceAccountJson) missing.push('GOOGLE_TTS_API_KEY or GOOGLE_SERVICE_ACCOUNT_JSON (secret)')
  if (c.tts.serviceAccountJson) {
    try {
      const sa = JSON.parse(c.tts.serviceAccountJson)
      if (typeof sa.client_email !== 'string' || typeof sa.private_key !== 'string') throw new Error()
    } catch { missing.push('GOOGLE_SERVICE_ACCOUNT_JSON: not a service account key (needs client_email and private_key)') }
  }
  return missing
}

// The model each stage uses; checked by missingForLive before anything runs
export const modelOf = (c: BriefingConfig, s: Stage): string => c.openai.models[s] ?? ''

export const targetWords = (c: BriefingConfig) => Math.round((c.targetSeconds / 60) * c.wordsPerMinute)
