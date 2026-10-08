import { createHash } from 'node:crypto'
import { fetchNews } from '@/lib/fetchNews'
import { CACHE_SECONDS, STALE_SECONDS } from '@/lib/sources'

export const dynamic = 'force-dynamic'
export const maxDuration = 15 // feeds time out after 8 s; never let a stuck call run on

// One shared copy of the list for everybody, so the RSS sources and the function
// are hit at most about once per CACHE_SECONDS, however many people have the page open:
// - Vercel's CDN keeps the response (Vercel-CDN-Cache-Control) and answers repeat
//   requests itself, without running this function;
// - inside a running instance, the last result and a fetch already under way are
//   reused (several requests arriving at once start one round of RSS fetches).
interface Snapshot { body: string; etag: string; at: number; timing: string }
let cached: Snapshot | null = null
let pending: Promise<Snapshot> | null = null

async function load(): Promise<Snapshot> {
  if (cached && Date.now() - cached.at < CACHE_SECONDS * 1000) return cached
  pending ??= (async () => {
    const cpu0 = process.cpuUsage()
    const t0 = performance.now()
    const { items, errors, stats } = await fetchNews()
    const body = JSON.stringify({ items, errors })
    const etag = `"${createHash('sha1').update(body).digest('base64url').slice(0, 22)}"`
    const cpu = process.cpuUsage(cpu0)
    // Visible in the browser's network panel and in Vercel's logs: what one refresh cost
    const timing = [
      `total;dur=${(performance.now() - t0).toFixed(0)}`,
      `cpu;dur=${((cpu.user + cpu.system) / 1000).toFixed(0)}`,
      `feeds;desc="fetched ${stats.fetched}, parsed ${stats.parsed}, unchanged ${stats.unchanged}, skipped ${stats.skipped}"`,
    ].join(', ')
    console.log(`news refresh: ${timing}, items ${items.length}, errors ${errors.length}`)
    cached = { body, etag, at: Date.now(), timing }
    return cached
  })().finally(() => { pending = null })
  return pending
}

export async function GET(req: Request) {
  const { body, etag, timing, at } = await load()
  // The copy may already be a few seconds old: the CDN keeps it only for what is left
  const ttl = Math.max(1, CACHE_SECONDS - Math.floor((Date.now() - at) / 1000))
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    ETag: etag,
    'Server-Timing': timing,
    // Browsers: keep a copy but always ask; an unchanged list comes back as a tiny 304
    'Cache-Control': 'public, max-age=0, must-revalidate',
    // Vercel's CDN only
    'Vercel-CDN-Cache-Control': `max-age=${ttl}, stale-while-revalidate=${STALE_SECONDS}`,
  }
  if (req.headers.get('if-none-match') === etag) return new Response(null, { status: 304, headers })
  return new Response(body, { headers })
}
