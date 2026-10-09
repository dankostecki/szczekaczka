// Cloudflare Worker: the page itself is static files (served by Cloudflare without running
// this code); only /api/news and /ws come here.
import { HUBS } from '../src/lib/sources'
import { type Env, poller, hub } from './env'
import { probeSources } from './probe'

export { Poller } from './poller'
export { Hub } from './hub'

// Pages of another site that may use the API: the GitHub Pages copy (ALLOWED_ORIGINS)
function otherSite(req: Request, url: URL, env: Env): string | null {
  const origin = req.headers.get('Origin')
  if (!origin || origin === url.origin) return null
  return (env.ALLOWED_ORIGINS ?? '').split(',').map((o) => o.trim()).includes(origin) ? origin : null
}

// Only pages of this site and the allowed ones may connect (a browser always sends Origin)
function allowed(req: Request, url: URL, env: Env): boolean {
  const origin = req.headers.get('Origin')
  if (!origin) return true
  let host: string
  try { host = new URL(origin).host } catch { return false }
  return host === url.host || otherSite(req, url, env) !== null
}

async function news(req: Request, env: Env, url: URL): Promise<Response> {
  const body = await poller(env).snapshot()
  const v = body.match(/^\{"v":(\d+)/)?.[1] ?? '0'
  const etag = `"v${v}"`
  const headers: Record<string, string> = {
    'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-cache', ETag: etag, Vary: 'Origin',
  }
  const origin = otherSite(req, url, env)
  if (origin) headers['Access-Control-Allow-Origin'] = origin
  if (req.headers.get('If-None-Match') === etag) return new Response(null, { status: 304, headers })
  return new Response(body, { headers })
}

function connect(req: Request, env: Env, url: URL): Promise<Response> | Response {
  if (req.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return new Response('Expected a WebSocket', { status: 426 })
  if (!allowed(req, url, env)) return new Response('Forbidden', { status: 403 })
  const shard = Math.floor(Math.random() * HUBS)
  return hub(env, shard).fetch(new Request(`https://hub/ws?shard=${shard}`, req))
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url)
    if (url.pathname === '/ws') return connect(req, env, url)
    if (url.pathname === '/api/news') return news(req, env, url)
    if (url.pathname === '/api/probe-sources') return probeSources() // TEMPORARY test of market-data sources
    return env.ASSETS.fetch(req)
  },
  // Every 10 minutes: make sure the poller's loop is running (it starts itself on the
  // first visit; this restarts it if anything ever stopped it)
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(poller(env).kick())
  },
} satisfies ExportedHandler<Env>
