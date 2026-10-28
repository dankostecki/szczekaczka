// The briefing's addresses: the page's JSON, the audio with Range (iOS Safari), the operator's endpoints behind a token
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { briefingApi, byteRange } from '../../worker/briefing/api'
import type { Env } from '../../worker/env'

const AUDIO = new Uint8Array(Array.from({ length: 1000 }, (_, i) => i % 256))
function env(token?: string) {
  const calls: unknown[][] = []
  const stub = {
    index: async () => ({ today: { id: '2026-10-28', state: 'published', publishAt: '2026-10-28T06:00:00.000Z' }, schedule: { days: [1, 2, 3, 4, 5, 6], seconds: 180 }, editions: [] }),
    edition: async (id: string) => (id === '2026-10-28' ? { id } : null),
    audio: async (id: string, hash: string) => (id === '2026-10-28' && hash === 'abcdef012345' ? AUDIO : null),
    admin: async (...args: unknown[]) => { calls.push(args); return { status: 200, json: '{"ok":true}' } },
  }
  const e = { BRIEFING: { idFromName: () => 'id', get: () => stub }, ...(token ? { BRIEFING_ADMIN_TOKEN: token } : {}) } as unknown as Env
  return { e, calls }
}
const call = (e: Env, path: string, init: RequestInit = {}) => briefingApi(new Request(`https://szczekaczka.example${path}`, init), e, new URL(`https://szczekaczka.example${path}`), { Vary: 'Origin', 'Access-Control-Allow-Origin': 'https://dankostecki.github.io' })

test('Range: one range, a suffix, an open end; out of the file is 416', () => {
  assert.equal(byteRange(null, 1000), 'all')
  assert.deepEqual(byteRange('bytes=0-1', 1000), { start: 0, end: 1 })
  assert.deepEqual(byteRange('bytes=900-', 1000), { start: 900, end: 999 })
  assert.deepEqual(byteRange('bytes=-100', 1000), { start: 900, end: 999 })
  assert.deepEqual(byteRange('bytes=500-5000', 1000), { start: 500, end: 999 })
  assert.equal(byteRange('bytes=1000-', 1000), null)
  assert.equal(byteRange('bytes=0-1,5-6', 1000), 'all', 'several ranges: the whole file')
})

test('the page\'s JSON: no-cache, CORS for the allowed site, not indexed; an unknown edition is 404', async () => {
  const { e } = env()
  const r = await call(e, '/api/briefing')
  assert.equal(r.status, 200)
  assert.equal(r.headers.get('cache-control'), 'no-cache')
  assert.equal(r.headers.get('access-control-allow-origin'), 'https://dankostecki.github.io')
  assert.match(r.headers.get('x-robots-tag')!, /noindex/)
  assert.equal((await r.json() as { today: { state: string } }).today.state, 'published')
  assert.equal((await call(e, '/api/briefing/editions/2026-10-28')).status, 200)
  assert.equal((await call(e, '/api/briefing/editions/2026-10-27')).status, 404)
  assert.equal((await call(e, '/api/briefing/editions/../../etc')).status, 404)
  assert.equal((await call(e, '/api/briefing', { method: 'POST' })).status, 405)
})

test('the audio: whole, in parts (206 with Content-Range), HEAD, If-None-Match, a wrong hash', async () => {
  const { e } = env()
  const path = '/api/briefing/audio/2026-10-28-abcdef012345.mp3'
  const all = await call(e, path)
  assert.equal(all.status, 200)
  assert.equal(all.headers.get('content-type'), 'audio/mpeg')
  assert.equal(all.headers.get('accept-ranges'), 'bytes')
  assert.equal(all.headers.get('content-length'), '1000')
  assert.match(all.headers.get('cache-control')!, /immutable/)
  assert.equal((await all.arrayBuffer()).byteLength, 1000)
  const part = await call(e, path, { headers: { Range: 'bytes=0-1' } })
  assert.equal(part.status, 206)
  assert.equal(part.headers.get('content-range'), 'bytes 0-1/1000')
  assert.deepEqual([...new Uint8Array(await part.arrayBuffer())], [0, 1])
  const tail = await call(e, path, { headers: { Range: 'bytes=990-' } })
  assert.equal(tail.headers.get('content-range'), 'bytes 990-999/1000')
  assert.equal((await call(e, path, { headers: { Range: 'bytes=5000-' } })).status, 416)
  const head = await call(e, path, { method: 'HEAD' })
  assert.equal(head.status, 200)
  assert.equal(head.headers.get('content-length'), '1000')
  assert.equal((await call(e, path, { headers: { 'If-None-Match': '"abcdef012345"' } })).status, 304)
  assert.equal((await call(e, '/api/briefing/audio/2026-10-28-000000000000.mp3')).status, 404)
})

test('the operator\'s endpoints: not there without a token, 401 with a wrong one, the right methods', async () => {
  assert.equal((await call(env().e, '/api/briefing/admin/status')).status, 404)
  assert.equal((await call(env('short').e, '/api/briefing/admin/status', { headers: { Authorization: 'Bearer short' } })).status, 404, 'a token too short to be safe counts as none')
  const token = 'x'.repeat(40)
  const { e, calls } = env(token)
  assert.equal((await call(e, '/api/briefing/admin/status')).status, 401)
  assert.equal((await call(e, '/api/briefing/admin/status', { headers: { Authorization: `Bearer ${'y'.repeat(40)}` } })).status, 401)
  const ok = await call(e, '/api/briefing/admin/status', { headers: { Authorization: `Bearer ${token}` } })
  assert.equal(ok.status, 200)
  assert.equal(ok.headers.get('cache-control'), 'no-store')
  assert.equal(ok.headers.get('access-control-allow-origin'), null, 'no CORS for the operator')
  const auth = { Authorization: `Bearer ${token}` }
  assert.equal((await call(e, '/api/briefing/admin/run?date=2026-10-28&force=1', { headers: auth })).status, 405, 'run is a POST')
  assert.equal((await call(e, '/api/briefing/admin/run?date=2026-10-28&force=1', { method: 'POST', headers: auth })).status, 200)
  assert.deepEqual(calls.at(-1), ['run', '2026-10-28', true, ''])
  assert.equal((await call(e, '/api/briefing/admin/approve/28-10-2026', { method: 'POST', headers: auth })).status, 400)
  await call(e, '/api/briefing/admin/reject/2026-10-28?reason=a%20mistake', { method: 'POST', headers: auth })
  assert.deepEqual(calls.at(-1), ['reject', '2026-10-28', false, 'a mistake'])
})
