import type { Poller } from './poller'
import type { Hub } from './hub'
import type { Briefing } from './briefing/do'

export interface Env {
  POLLER: DurableObjectNamespace<Poller>
  HUB: DurableObjectNamespace<Hub>
  // The morning briefing (worker/briefing): its settings are BRIEFING_* variables and secrets, read by briefing/config.ts
  BRIEFING: DurableObjectNamespace<Briefing>
  ASSETS: Fetcher
  // Workers AI, for the translations (worker/translate.ts); without it (local tests) nothing is translated
  AI?: Ai
  // Other sites whose pages may use /api/news and /ws, comma-separated (the GitHub Pages copy)
  ALLOWED_ORIGINS?: string
  // Local tests only: fetch feeds from this origin instead of the real sites
  FEED_ORIGIN?: string
}

export const poller = (env: Env) => env.POLLER.get(env.POLLER.idFromName('poller'))
export const hub = (env: Env, i: number) => env.HUB.get(env.HUB.idFromName(`hub-${i}`))
