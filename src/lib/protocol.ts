// What the Cloudflare Worker sends to the page.
import type { NewsItem } from './parse'
import type { BriefingPointer } from './briefing'
import type { Lang } from './sources'

export interface FeedSnapshot { key: string; items: NewsItem[]; error: string | null }

// The news are rated by their importance (worker/rate.ts), those of the channels in these languages: the page has its "Top" tab
export interface TopMeta { langs: Lang[] }

// GET /api/news: everything, at version v; the latest morning briefing, when there is one; the ratings, when they are on
export interface Snapshot { v: number; feeds: FeedSnapshot[]; briefing?: BriefingPointer; top?: TopMeta }

// Over the WebSocket (/ws): what changed in one channel since version v - 1
export interface Delta { t: 'd'; v: number; key: string; add: NewsItem[]; remove: string[]; error: string | null }

// First message on every new WebSocket: the server's current version. The page fetches
// the whole list only when it is behind, so coming back to a tab usually costs nothing more.
// n: pages connected right now, when the hub knows it
export interface Hello { t: 'v'; v: number; n?: number }

// Also over the WebSocket, about every 50 s: keeps the connection from being closed as idle,
// and says how many pages are connected (n, counted at the previous heartbeat)
export interface Heartbeat { t: 'h'; n: number }
// The heartbeat before it carried the count (still understood)
export const HEARTBEAT = 'h'
