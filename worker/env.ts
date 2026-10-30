import type { Poller } from './poller'
import type { Hub } from './hub'
import type { Briefing } from './briefing/do'

export interface Env {
  POLLER: DurableObjectNamespace<Poller>
  HUB: DurableObjectNamespace<Hub>
  // The morning briefing (worker/briefing): its settings are BRIEFING_* variables and secrets, read by briefing/config.ts
  BRIEFING: DurableObjectNamespace<Briefing>
  ASSETS: Fetcher
  // Workers AI, for the translations (worker/translate.ts) and the ratings of importance (worker/rate.ts); without it (local tests)
  // nothing is translated or rated
  AI?: Ai
  // The ratings of the news' importance (worker/rate.ts, the page's "Top" tab): on (the default) or off; the model; the languages of the
  // channels rated ("en,pl", or "en"); the ratings a day for one channel
  NEWS_AI_RANK?: string
  NEWS_AI_RANK_MODEL?: string
  NEWS_AI_RANK_LANGS?: string
  NEWS_AI_RANK_PER_DAY?: string
  // Other sites whose pages may use /api/news and /ws, comma-separated (the GitHub Pages copy)
  ALLOWED_ORIGINS?: string
  // Local tests only: fetch feeds from this origin instead of the real sites
  FEED_ORIGIN?: string
}

export const poller = (env: Env) => env.POLLER.get(env.POLLER.idFromName('poller'))
export const hub = (env: Env, i: number) => env.HUB.get(env.HUB.idFromName(`hub-${i}`))
