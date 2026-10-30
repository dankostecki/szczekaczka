// The importance of every news of the list, rated once as it comes in by a decision model of Workers AI (Clef-flash by default) and kept
// with it (NewsItem.ai, 0 to 10): the page's "Top" tab sorts the news of the last hours by it (lib/top.ts), and the morning briefing
// takes it instead of asking again (briefing/importance.ts). The rating is of the news as published (an English post before its
// translation). NEWS_AI_RANK=off stops it, and the page then has no "Top" tab; NEWS_AI_RANK_LANGS=en rates the channels in English only.
// The free plan's 10,000 neurons a day are shared with the translations: one news costs under one neuron, and each channel has a day's limit.
import type { NewsItem } from '../src/lib/parse'
import type { FeedConfig, Lang } from '../src/lib/sources'
import type { TopMeta } from '../src/lib/protocol'
import { inTurns, PAUSE_MS } from './translate'
import { headlineOf, isDecisionModel, rateHeadlines } from './briefing/importance'
import type { CheckResult } from './feeds'

export const NEWS_MODEL = '@cf/cloudflare/clef-flash'
export const PER_DAY = 600  // ratings a day for one channel: more than ESPI publishes (Seeking Alpha's evening flood may reach it)
const PER_CALL = 40         // questions in one request (the model takes up to 64)
const DAY_MS = 24 * 3600_000
const PER_CHECK = 2         // requests at one check: what is left goes at the next one (right after a deploy every channel has a day of news to rate)

export interface RateConfig { enabled: boolean; model: string; langs: Lang[]; perDay: number; problems: string[] }

// From the Worker's variables; a wrong value only falls back to the default (said in the logs)
export function rateConfig(env: Record<string, unknown>): RateConfig {
  const str = (k: string) => (typeof env[k] === 'string' && (env[k] as string).trim() ? (env[k] as string).trim() : undefined)
  const problems: string[] = []
  const on = str('NEWS_AI_RANK') ?? 'on'
  if (on !== 'on' && on !== 'off') problems.push(`NEWS_AI_RANK: expected on or off, got "${on}"`)
  const model = str('NEWS_AI_RANK_MODEL') ?? NEWS_MODEL
  if (!isDecisionModel(model)) problems.push(`NEWS_AI_RANK_MODEL: expected a decision model (@cf/cloudflare/clef, clef-flash…), got "${model}"`)
  const langs = (str('NEWS_AI_RANK_LANGS') ?? 'en,pl').split(',').map((l) => l.trim().toLowerCase()).filter(Boolean)
  const known = langs.filter((l): l is Lang => l === 'en' || l === 'pl')
  if (!known.length || known.length !== langs.length) problems.push(`NEWS_AI_RANK_LANGS: expected en, pl or en,pl, got "${str('NEWS_AI_RANK_LANGS')}"`)
  const perDay = Number(str('NEWS_AI_RANK_PER_DAY') ?? PER_DAY)
  const perDayOk = Number.isInteger(perDay) && perDay >= 0 && perDay <= 5000
  if (!perDayOk) problems.push(`NEWS_AI_RANK_PER_DAY: expected a whole number from 0 to 5000, got "${str('NEWS_AI_RANK_PER_DAY')}"`)
  return {
    enabled: on !== 'off', model: isDecisionModel(model) ? model : NEWS_MODEL, langs: known.length ? [...new Set(known)] : ['en', 'pl'],
    perDay: perDayOk ? perDay : PER_DAY, problems,
  }
}

// The channels rated: every news channel in the languages asked for (MacroNext's announcements are the site's own, not news)
export const ratedFeed = (feed: FeedConfig, c: RateConfig) => c.enabled && feed.source !== 'MACRONEXT' && c.langs.includes(feed.lang ?? 'pl')

// What the page is told (the snapshot): there are ratings, of these languages; null, no "Top" tab
export const topMeta = (c: RateConfig, hasAi: boolean): TopMeta | null => (c.enabled && hasAi ? { langs: c.langs } : null)

// Rates the news of the channel that have no rating yet, newest first, and adds them to the check's result (as the translations are): a news
// rated later goes out again with its rating. A news the model gave no answer for is left unrated for good (null); after a failure of the
// service (no capacity, the day's allocation used up) no ratings for a while. Returns a line for the logs, or nothing when there was nothing to do.
export async function rateNew(ai: Ai, r: CheckResult, now: number, c: RateConfig): Promise<string | undefined> {
  const s = r.state
  if ((s.rate?.retryAt ?? 0) > now) return undefined
  const day = new Date(now).toISOString().slice(0, 10)
  const used = s.rate?.day === day ? s.rate.n : 0
  // Only the news of the last day: a feed keeps entries of months ago while they are in it (GPW's), and the "Top" tab looks a day back at most
  const waiting = s.items.filter((i) => i.ai === undefined && i.pubDate && now - Date.parse(i.pubDate) < DAY_MS)
  const todo = waiting.slice(0, Math.max(0, Math.min(PER_CALL * PER_CHECK, c.perDay - used)))
  if (todo.length === 0) return used >= c.perDay && waiting.length ? `ratings: the limit of ${c.perDay} a day is reached` : undefined

  const batches: NewsItem[][] = []
  for (let i = 0; i < todo.length; i += PER_CALL) batches.push(todo.slice(i, i + PER_CALL))
  const answers = await inTurns(batches, 1, (b) => rateHeadlines(ai, c.model, b.map((it, k) => [`n${k + 1}`, headlineOf(it.title, it.description, [it.source])]), 'rate'),
    (a) => a.error !== undefined && a.scores.size === 0)
  const done = new Map<string, NewsItem>()
  let asked = 0, failed = 0, tokensIn = 0
  let error: string | undefined
  answers.forEach((a, k) => {
    if (!a) return // not asked: the service had failed
    tokensIn += a.tokensIn
    if (a.error && a.scores.size === 0) { failed++; error ??= a.error; return }
    asked += batches[k].length
    batches[k].forEach((it, i) => { done.set(it.id, { ...it, ai: a.scores.get(`n${i + 1}`) ?? null }) })
  })

  s.items = s.items.map((i) => done.get(i.id) ?? i)
  const added = new Set(r.add.map((i) => i.id))
  r.add = [...r.add.map((i) => done.get(i.id) ?? i), ...[...done.values()].filter((i) => !added.has(i.id))]
  s.rate = { day, n: used + asked, ...(failed ? { retryAt: now + PAUSE_MS } : {}) }
  if (done.size) r.changed = true
  else r.dirty = true // only the count and the pause changed: saved, nothing sent
  const rated = [...done.values()].filter((i) => typeof i.ai === 'number').length
  return `rated ${rated}/${asked} (${tokensIn} tokens; ${s.rate.n} today)` + (failed ? `, failed: paused ${PAUSE_MS / 60_000} min | ${error}` : '')
}

