import type { Poller } from './poller'
import type { Hub } from './hub'

export interface Env {
  POLLER: DurableObjectNamespace<Poller>
  HUB: DurableObjectNamespace<Hub>
  ASSETS: Fetcher
  // Other sites whose pages may use /api/news and /ws, comma-separated (the GitHub Pages copy)
  ALLOWED_ORIGINS?: string
  // Local tests only: fetch feeds from this origin instead of the real sites
  FEED_ORIGIN?: string
}

export const poller = (env: Env) => env.POLLER.get(env.POLLER.idFromName('poller'))
export const hub = (env: Env, i: number) => env.HUB.get(env.HUB.idFromName(`hub-${i}`))
