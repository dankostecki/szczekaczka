// Where the briefing keeps everything: the editions, the result of every step (so a step that is done is never run, nor
// paid for, again), the audio, and the usage of the paid services. One interface, two places: the Durable Object's
// SQLite (sqliteStore) and memory (memoryStore, for the tests). Audio is kept in pieces under 2 MB, the most one row holds.
import type { EditionRecord } from './pipeline'

export interface StepRecord<T = unknown> {
  status: 'done' | 'failed' | 'skipped'
  attempts: number
  output?: T
  error?: string
  startedAt: number
  finishedAt?: number
  retryAt?: number
}

export interface UsageRow {
  edition: string
  at: number
  provider: 'openai' | 'tavily' | 'google-tts'
  stage: string
  model: string
  inputTokens: number
  cachedTokens: number
  outputTokens: number
  reasoningTokens: number
  webSearches: number
  characters: number
  costUsd: number   // estimated: tokens or characters × the configured prices
  requestId: string | null
  ok: boolean
}

export type AudioKind = 'part' | 'file'

export interface Store {
  getEdition(id: string): EditionRecord | null
  putEdition(e: EditionRecord): void
  listEditions(limit: number): EditionRecord[] // newest first
  deleteEdition(id: string): void              // with its steps and audio
  getStep<T>(edition: string, key: string): StepRecord<T> | null
  putStep(edition: string, key: string, r: StepRecord): void
  steps(edition: string): [string, StepRecord][]
  deleteSteps(edition: string): void
  putAudio(edition: string, kind: AudioKind, part: number, bytes: Uint8Array): void
  getAudio(edition: string, kind: AudioKind, part: number): Uint8Array | null
  audioParts(edition: string, kind: AudioKind): number
  deleteAudio(edition: string, kind?: AudioKind): void
  addUsage(u: UsageRow): void
  usage(edition: string): UsageRow[]
  costSince(at: number): number
  ttsCharsSince(at: number): number
}

export const AUDIO_SLICE = 1_000_000

export function memoryStore(): Store {
  const editions = new Map<string, EditionRecord>()
  const steps = new Map<string, Map<string, StepRecord>>()
  const audio = new Map<string, Uint8Array>()
  const usage: UsageRow[] = []
  const copy = <T>(x: T): T => structuredClone(x)
  return {
    getEdition: (id) => (editions.has(id) ? copy(editions.get(id)!) : null),
    putEdition: (e) => { editions.set(e.id, copy(e)) },
    listEditions: (limit) => [...editions.values()].sort((a, b) => (a.id < b.id ? 1 : -1)).slice(0, limit).map(copy),
    deleteEdition: (id) => { editions.delete(id); steps.delete(id); for (const k of [...audio.keys()]) if (k.startsWith(`${id}|`)) audio.delete(k) },
    getStep: <T>(e: string, k: string) => (steps.get(e)?.has(k) ? copy(steps.get(e)!.get(k)!) as StepRecord<T> : null),
    putStep: (e, k, r) => { let m = steps.get(e); if (!m) steps.set(e, (m = new Map())); m.set(k, copy(r)) },
    steps: (e) => [...(steps.get(e)?.entries() ?? [])].map(([k, v]) => [k, copy(v)]),
    deleteSteps: (e) => { steps.delete(e) },
    putAudio: (e, kind, p, b) => { audio.set(`${e}|${kind}|${p}`, b.slice()) },
    getAudio: (e, kind, p) => audio.get(`${e}|${kind}|${p}`)?.slice() ?? null,
    audioParts: (e, kind) => [...audio.keys()].filter((k) => k.startsWith(`${e}|${kind}|`)).length,
    deleteAudio: (e, kind) => { for (const k of [...audio.keys()]) if (k.startsWith(kind ? `${e}|${kind}|` : `${e}|`)) audio.delete(k) },
    addUsage: (u) => { usage.push(copy(u)) },
    usage: (e) => usage.filter((u) => u.edition === e).map(copy),
    costSince: (at) => usage.filter((u) => u.at >= at).reduce((n, u) => n + u.costUsd, 0),
    ttsCharsSince: (at) => usage.filter((u) => u.at >= at && u.provider === 'google-tts').reduce((n, u) => n + u.characters, 0),
  }
}
