import { createHash } from 'node:crypto'
import { fetchNews } from '@/lib/fetchNews'
import { CACHE_SECONDS } from '@/lib/sources'

export const dynamic = 'force-dynamic'

// One shared copy of the list for everybody, so the RSS sources and the function
// are hit at most once per CACHE_SECONDS, however many people have the page open:
// - Vercel's CDN keeps the response (Vercel-CDN-Cache-Control) and answers repeat
//   requests itself, without running this function;
// - inside a running instance, the last result and a fetch already under way are
//   reused (several requests arriving at once start one round of RSS fetches).
let cached: { body: string; etag: string; at: number } | null = null
let pending: Promise<{ body: string; etag: string; at: number }> | null = null

async function load() {
  if (cached && Date.now() - cached.at < CACHE_SECONDS * 1000) return cached
  pending ??= fetchNews()
    .then(({ items, errors }) => {
      const body = JSON.stringify({ items, errors })
      const etag = `"${createHash('sha1').update(body).digest('base64url').slice(0, 22)}"`
      cached = { body, etag, at: Date.now() }
      return cached
    })
    .finally(() => { pending = null })
  return pending
}

export async function GET(req: Request) {
  const { body, etag } = await load()
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    ETag: etag,
    // Browsers: keep a copy but always ask; an unchanged list comes back as a tiny 304
    'Cache-Control': 'public, max-age=0, must-revalidate',
    // Vercel's CDN only
    'Vercel-CDN-Cache-Control': `max-age=${CACHE_SECONDS}, stale-while-revalidate=${CACHE_SECONDS * 2}`,
  }
  if (req.headers.get('if-none-match') === etag) return new Response(null, { status: 304, headers })
  return new Response(body, { headers })
}
