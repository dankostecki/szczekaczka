// The briefing's addresses:
//   GET /api/briefing                                     today's state and the list of editions (the page)
//   GET /api/briefing/editions/2026-10-28                 one published edition (the page)
//   GET /api/briefing/audio/2026-10-28-<hash>.mp3         its audio, with Range (iOS Safari asks for parts)
//   GET /api/briefing/pack.md                             the pack for ChatGPT of the latest day (pack.ts): one address, its text changes every morning
//   /api/briefing/admin/…                                 for the operator, with "Authorization: Bearer <BRIEFING_ADMIN_TOKEN>";
//                                                         they do not exist while that secret is not set
//     GET  status · GET editions/<date> · POST run[?date=…&force=1] · POST approve/<date> · POST reject/<date>[?reason=…]
import { isEditionId } from '../../src/lib/briefing'
import type { Env } from '../env'

export const briefing = (env: Env) => env.BRIEFING.get(env.BRIEFING.idFromName('briefing'))

const AUDIO = /^\/api\/briefing\/audio\/(\d{4}-\d{2}-\d{2})-([0-9a-f]{12})\.mp3$/
const EDITION = /^\/api\/briefing\/editions\/(\d{4}-\d{2}-\d{2})$/

// The last audio files asked for, in this isolate, for a few minutes: a player asks for the same file in many parts
// (a withdrawn edition is gone from here within that time too)
const KEEP_MS = 5 * 60_000
const recent = new Map<string, { bytes: Uint8Array; at: number }>()
function remember(key: string, bytes: Uint8Array, at: number) {
  recent.delete(key)
  recent.set(key, { bytes, at })
  while (recent.size > 2) recent.delete(recent.keys().next().value!)
}

async function sameSecret(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder()
  const [x, y] = await Promise.all([crypto.subtle.digest('SHA-256', enc.encode(a)), crypto.subtle.digest('SHA-256', enc.encode(b))])
  const p = new Uint8Array(x), q = new Uint8Array(y)
  let diff = 0
  for (let i = 0; i < p.length; i++) diff |= p[i] ^ q[i]
  return diff === 0
}

const json = (body: unknown, status: number, headers: Record<string, string>) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers } })

// One range of "Range: bytes=…" (a player asks for one); null: not satisfiable
export function byteRange(header: string | null, size: number): { start: number; end: number } | 'all' | null {
  if (!header) return 'all'
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim())
  if (!m || (!m[1] && !m[2])) return 'all' // not a single byte range: the whole file
  if (!m[1]) { const n = Number(m[2]); return n > 0 ? { start: Math.max(0, size - n), end: size - 1 } : null }
  const start = Number(m[1]), end = m[2] ? Math.min(Number(m[2]), size - 1) : size - 1
  return start < size && start <= end ? { start, end } : null
}

export async function briefingApi(req: Request, env: Env, url: URL, publicHeaders: Record<string, string>): Promise<Response> {
  const path = url.pathname.replace(/\/$/, '')
  const get = req.method === 'GET' || req.method === 'HEAD'

  if (path.startsWith('/api/briefing/admin')) {
    const token = (env as unknown as Record<string, unknown>).BRIEFING_ADMIN_TOKEN
    if (typeof token !== 'string' || token.length < 24) return new Response('Not found', { status: 404 })
    const given = /^Bearer\s+(.+)$/i.exec(req.headers.get('Authorization') ?? '')?.[1] ?? ''
    if (!(await sameSecret(given, token))) return new Response('Unauthorized', { status: 401, headers: { 'WWW-Authenticate': 'Bearer' } })
    const headers = { 'Cache-Control': 'no-store' }
    const rest = path.slice('/api/briefing/admin'.length).split('/').filter(Boolean)
    const op = rest[0] ?? 'status'
    const date = rest[1] ?? url.searchParams.get('date') ?? ''
    if (date && !isEditionId(date)) return json({ error: 'expected a date YYYY-MM-DD' }, 400, headers)
    const reads = op === 'status' || op === 'editions'
    if (reads ? !get : req.method !== 'POST') return json({ error: reads ? 'use GET' : 'use POST' }, 405, headers)
    const r = await briefing(env).admin(op === 'editions' ? 'edition' : op, date, url.searchParams.get('force') === '1', (url.searchParams.get('reason') ?? '').slice(0, 300))
    return new Response(r.json, { status: r.status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers } })
  }

  if (!get) return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, HEAD' } })
  const headers = { ...publicHeaders, 'Cache-Control': 'no-cache', 'X-Robots-Tag': 'noindex, nofollow, noarchive' }

  if (path === '/api/briefing') return json(await briefing(env).index(), 200, headers)

  if (path === '/api/briefing/pack.md') {
    const p = await briefing(env).pack()
    const text = { ...headers, 'Content-Type': 'text/markdown; charset=utf-8' }
    if (!p) return new Response('Materiał na dziś jeszcze nie jest gotowy.\n', { status: 404, headers: text })
    return new Response(req.method === 'HEAD' ? null : p.text, { headers: { ...text, 'Last-Modified': new Date(p.builtAt).toUTCString() } })
  }

  const edition = EDITION.exec(path)
  if (edition) {
    const e = await briefing(env).edition(edition[1])
    return e ? json(e, 200, headers) : json({ error: 'not found' }, 404, headers)
  }

  const audio = AUDIO.exec(path)
  if (audio) {
    const [, id, hash] = audio
    const key = `${id}-${hash}`
    const kept = recent.get(key)
    let bytes = kept && Date.now() - kept.at < KEEP_MS ? kept.bytes : undefined
    if (!bytes) {
      const got = await briefing(env).audio(id, hash)
      if (!got) return new Response('Not found', { status: 404, headers })
      bytes = got
      remember(key, bytes, Date.now())
    }
    const etag = `"${hash}"`
    // The address names the content (its hash), so it never changes: browsers may keep it
    const base: Record<string, string> = { ...publicHeaders, 'Content-Type': 'audio/mpeg', 'Accept-Ranges': 'bytes', ETag: etag,
      'Cache-Control': 'public, max-age=31536000, immutable', 'X-Robots-Tag': 'noindex' }
    if (req.headers.get('If-None-Match') === etag) return new Response(null, { status: 304, headers: base })
    const range = byteRange(req.headers.get('Range'), bytes.length)
    if (range === null) return new Response(null, { status: 416, headers: { ...base, 'Content-Range': `bytes */${bytes.length}` } })
    const body = range === 'all' ? bytes : bytes.subarray(range.start, range.end + 1)
    const h = { ...base, 'Content-Length': String(body.length), ...(range === 'all' ? {} : { 'Content-Range': `bytes ${range.start}-${range.end}/${bytes.length}` }) }
    return new Response(req.method === 'HEAD' ? null : body, { status: range === 'all' ? 200 : 206, headers: h })
  }

  return json({ error: 'not found' }, 404, headers)
}
