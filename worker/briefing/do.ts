// One Durable Object for the morning briefing: its own SQLite (editions, steps, audio, usage, the pack for ChatGPT) and its own
// alarm, which runs the pipeline one step at a time (pipeline.ts), and the pack's steps (pack.ts) at their time. The Worker's
// cron (every 10 minutes) only makes sure the alarm is set.
import { DurableObject } from 'cloudflare:workers'
import type { BriefingIndex, BriefingPointer, PublicEdition } from '../../src/lib/briefing'
import { type Env, poller } from '../env'
import { readConfig } from './config'
import { openAiLlm } from './llm'
import { mockLlm, mockPage, mockSearch, mockTts } from './mock'
import { packOf, packStatus, packTick, packWake } from './pack'
import { adminEdition, adminStatus, approve, audioOf, publicEdition, publicIndex, reject, startByHand, tick, type Deps } from './pipeline'
import { openAiSearch, tavilySearch } from './search'
import { sqliteStore } from './sqlite'
import type { Store } from './store'
import { editionIdAt } from './time'
import { googleTts, type Tts } from './tts'
import { fetchPage, type RobotsCache } from './web'

export class Briefing extends DurableObject<Env> {
  private store: Store
  private robots: RobotsCache = new Map()
  private robotsDay = ''
  // The voice client lives as long as the object, so a service account's access token (an hour) serves every part of the audio
  private voice: { key: string; tts: Tts } | null = null

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    this.store = sqliteStore(ctx.storage.sql)
  }

  private deps(): Deps {
    const { config, problems } = readConfig(this.env as unknown as Record<string, unknown>)
    const mock = config.mode === 'mock', live = config.mode === 'live'
    const day = editionIdAt(Date.now())
    if (day !== this.robotsDay) { this.robots = new Map(); this.robotsDay = day } // robots.txt read anew every day
    const web = { ...config.web }
    return {
      store: this.store, config, problems, now: () => Date.now(),
      llm: mock ? mockLlm() : live && config.openai.apiKey ? openAiLlm({ apiKey: config.openai.apiKey, baseUrl: config.openai.baseUrl, timeoutMs: config.openai.timeoutMs }) : null,
      search: mock ? () => mockSearch()
        : config.search.provider === 'tavily' && config.search.tavilyKey ? () => tavilySearch(config)
        : config.search.provider === 'openai' ? (llm) => openAiSearch(llm, config) : null,
      tts: mock ? mockTts() : live && (config.tts.apiKey || config.tts.serviceAccountJson) ? this.voiceFor(config.tts) : null,
      fetchPage: mock ? mockPage() : (url, about) => fetchPage(url, about, web, this.robots),
      pollerItems: (from, to) => poller(this.env).briefingItems(from, to),
      onPublished: (p: BriefingPointer | null) => poller(this.env).setBriefing(p),
      log: (m) => console.log(m),
    }
  }

  private voiceFor(c: Parameters<typeof googleTts>[0]): Tts {
    const key = JSON.stringify(c)
    if (this.voice?.key !== key) this.voice = { key, tts: googleTts(c) }
    return this.voice.tts
  }

  async alarm() {
    const d = this.deps()
    const run = async (what: string, step: () => Promise<number | null>) => {
      try { return await step() } catch (e) { console.error(`briefing ${what} failed`, e); return Date.now() + 60_000 }
    }
    const next = [await run('tick', () => tick(d)), await run('pack', () => packTick({ ...d, fetch: (input, init) => fetch(input, init) }))]
      .filter((t): t is number => t !== null)
    if (next.length) await this.ctx.storage.setAlarm(Math.max(Math.min(...next), Date.now() + 200))
  }

  // From the cron: an alarm, if there is none and the briefing or its pack is on
  async kick(): Promise<void> {
    const { config } = readConfig(this.env as unknown as Record<string, unknown>)
    if (config.mode === 'off' && !config.pack.enabled) return
    const alarm = await this.ctx.storage.getAlarm()
    const pack = packWake(this.store, config, Date.now())
    if (alarm == null) await this.ctx.storage.setAlarm(Date.now() + 1000)
    else if (pack !== null && pack < alarm) await this.ctx.storage.setAlarm(Math.max(Date.now() + 1000, pack))
  }

  async index(): Promise<BriefingIndex> { return publicIndex(this.deps()) }
  async edition(id: string): Promise<PublicEdition | null> { return publicEdition(this.deps(), id) }
  async audio(id: string, hash: string): Promise<Uint8Array | null> { return audioOf(this.deps(), id, hash) }
  async pack(): Promise<{ id: string; builtAt: number; text: string } | null> { return packOf(this.store) }

  // The answer as JSON text (the operator's endpoints only pass it on)
  async admin(op: string, arg = '', force = false, reason = ''): Promise<{ status: number; json: string }> {
    const r = await this.adminOp(op, arg, force, reason)
    return { status: r.status, json: JSON.stringify(r.body) }
  }

  private async adminOp(op: string, arg: string, force: boolean, reason: string): Promise<{ status: number; body: unknown }> {
    const d = this.deps()
    switch (op) {
      case 'status': return { status: 200, body: { ...adminStatus(d), pack: packStatus(d) } }
      case 'edition': { const e = adminEdition(d, arg); return e ? { status: 200, body: e } : { status: 404, body: { error: 'no such edition' } } }
      case 'run': {
        const r = startByHand(d, arg || editionIdAt(Date.now()), force)
        if (r.ok) await this.ctx.storage.setAlarm(Date.now() + 200)
        return { status: r.ok ? 202 : 409, body: r }
      }
      case 'approve': { const r = await approve(d, arg); if (r.ok) await this.ctx.storage.setAlarm(Date.now() + 200); return { status: r.ok ? 200 : 409, body: r } }
      case 'reject': { const r = await reject(d, arg, reason || 'no reason given'); return { status: r.ok ? 200 : 409, body: r } }
      default: return { status: 404, body: { error: 'unknown operation' } }
    }
  }
}
