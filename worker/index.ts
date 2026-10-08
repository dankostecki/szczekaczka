// Cloudflare Worker: the page itself is static files (served by Cloudflare without running
// this code); only /api/news and /ws come here.
import { HUBS } from '../src/lib/sources'
import { type Env, poller, hub } from './env'

export { Poller } from './poller'
export { Hub } from './hub'

// Only pages of this site may connect (a browser always sends Origin)
function sameSite(req: Request, url: URL): boolean {
  const origin = req.headers.get('Origin')
  if (!origin) return true
  try { return new URL(origin).host === url.host } catch { return false }
}

async function news(req: Request, env: Env): Promise<Response> {
  const body = await poller(env).snapshot()
  const v = body.match(/^\{"v":(\d+)/)?.[1] ?? '0'
  const etag = `"v${v}"`
  const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-cache', ETag: etag }
  if (req.headers.get('If-None-Match') === etag) return new Response(null, { status: 304, headers })
  return new Response(body, { headers })
}

function connect(req: Request, env: Env, url: URL): Promise<Response> | Response {
  if (req.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return new Response('Expected a WebSocket', { status: 426 })
  if (!sameSite(req, url)) return new Response('Forbidden', { status: 403 })
  const shard = Math.floor(Math.random() * HUBS)
  return hub(env, shard).fetch(new Request(`https://hub/ws?shard=${shard}`, req))
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url)
    if (url.pathname === '/ws') return connect(req, env, url)
    if (url.pathname === '/api/news') return news(req, env)
    return env.ASSETS.fetch(req)
  },
  // Every 10 minutes: make sure the poller's loop is running (it starts itself on the
  // first visit; this restarts it if anything ever stopped it)
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(poller(env).kick())
  },
} satisfies ExportedHandler<Env>
