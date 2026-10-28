// Google Text-to-Speech: the request, the two ways to sign in (the key never in the address; the service account's JWT
// signed and traded at Google's endpoint only), the voice check, the limits
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readConfig } from '../../worker/briefing/config'
import { ProviderError } from '../../worker/briefing/llm'
import { silentMp3 } from '../../worker/briefing/mp3'
import { fromBase64, googleTts, serviceAccountJwt } from '../../worker/briefing/tts'

const b64 = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64')
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

function fake(routes: (url: string, init: RequestInit) => Response) {
  const sent: { url: string; init: RequestInit; body: unknown }[] = []
  const fetchFn = (async (url: string, init: RequestInit = {}) => {
    const body = typeof init.body === 'string' ? (init.body.startsWith('{') ? JSON.parse(init.body) : init.body) : undefined
    sent.push({ url, init, body })
    return routes(url, init)
  }) as typeof fetch
  return { fetchFn, sent }
}

test('with an API key: the key in a header, never in the address; the request as the API documents it', async () => {
  const { config } = readConfig({ GOOGLE_TTS_API_KEY: 'AIza-test' })
  const mp3 = silentMp3(1)
  const f = fake(() => json({ audioContent: b64(mp3) }))
  const tts = googleTts(config.tts, f.fetchFn)
  const audio = await tts.synthesize('Dzień dobry. Zażółć gęślą jaźń.')
  assert.deepEqual([...audio], [...mp3])
  const { url, init, body } = f.sent[0]
  assert.equal(url, 'https://texttospeech.googleapis.com/v1/text:synthesize')
  assert.ok(!url.includes('AIza'))
  assert.equal(new Headers(init.headers).get('x-goog-api-key'), 'AIza-test')
  assert.deepEqual(body, { input: { text: 'Dzień dobry. Zażółć gęślą jaźń.' }, voice: { languageCode: 'pl-PL', name: 'pl-PL-Chirp3-HD-Aoede' }, audioConfig: { audioEncoding: 'MP3' } })
  // a speaking rate only when set
  const fast = googleTts(readConfig({ GOOGLE_TTS_API_KEY: 'k', BRIEFING_TTS_SPEAKING_RATE: '1.1', BRIEFING_TTS_VOICE: 'pl-PL-Chirp3-HD-Charon' }).config.tts, f.fetchFn)
  await fast.synthesize('Tekst.')
  assert.deepEqual(f.sent[1].body, { input: { text: 'Tekst.' }, voice: { languageCode: 'pl-PL', name: 'pl-PL-Chirp3-HD-Charon' }, audioConfig: { audioEncoding: 'MP3', speakingRate: 1.1 } })
})

test('more than 5000 bytes is never sent; errors are sorted into retryable and fatal', async () => {
  const { config } = readConfig({ GOOGLE_TTS_API_KEY: 'k' })
  const f = fake(() => json({}))
  await assert.rejects(googleTts(config.tts, f.fetchFn).synthesize('ż'.repeat(2501)), /over 5000 bytes/)
  assert.equal(f.sent.length, 0)
  for (const [status, kind] of [[429, 'retryable'], [503, 'retryable'], [403, 'fatal'], [400, 'fatal']] as const) {
    const e = fake(() => json({ error: { code: status, message: 'x', status: 'X' } }, status))
    await assert.rejects(googleTts(config.tts, e.fetchFn).synthesize('Tekst.'), (err: unknown) => err instanceof ProviderError && err.kind === kind)
  }
  await assert.rejects(googleTts(config.tts, fake(() => json({})).fetchFn).synthesize('Tekst.'), /no audio/)
})

test('the voice is checked in the list of pl-PL voices; a missing one names the Chirp 3 HD voices there are', async () => {
  const { config } = readConfig({ GOOGLE_TTS_API_KEY: 'k', BRIEFING_TTS_VOICE: 'pl-PL-Chirp3-HD-Nobody' })
  const f = fake(() => json({ voices: [{ name: 'pl-PL-Chirp3-HD-Aoede' }, { name: 'pl-PL-Chirp3-HD-Charon' }, { name: 'pl-PL-Wavenet-A' }] }))
  await assert.rejects(googleTts(config.tts, f.fetchFn).checkVoice(), (e: unknown) => e instanceof ProviderError && e.kind === 'fatal' && /Aoede, pl-PL-Chirp3-HD-Charon/.test(e.message))
  assert.equal(f.sent[0].url, 'https://texttospeech.googleapis.com/v1/voices?languageCode=pl-PL')
  await googleTts(readConfig({ GOOGLE_TTS_API_KEY: 'k' }).config.tts, f.fetchFn).checkVoice()
})

async function serviceAccount() {
  const keys = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']) as CryptoKeyPair
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey('pkcs8', keys.privateKey) as ArrayBuffer)
  const pem = `-----BEGIN PRIVATE KEY-----\n${b64(pkcs8).replace(/(.{64})/g, '$1\n')}\n-----END PRIVATE KEY-----\n`
  return { keys, sa: { type: 'service_account', client_email: 'tts@project.iam.gserviceaccount.com', private_key: pem, private_key_id: 'kid1', token_uri: 'https://evil.example.com/token' } }
}

test('a service account: an RS256 JWT for Google\'s token endpoint, verified with the public key', async () => {
  const { keys, sa } = await serviceAccount()
  const jwt = await serviceAccountJwt(sa, 1_800_000_000)
  const [h, c, sig] = jwt.split('.')
  const dec = (s: string) => JSON.parse(Buffer.from(s, 'base64url').toString())
  assert.deepEqual(dec(h), { alg: 'RS256', typ: 'JWT', kid: 'kid1' })
  assert.deepEqual(dec(c), { iss: sa.client_email, scope: 'https://www.googleapis.com/auth/cloud-platform', aud: 'https://oauth2.googleapis.com/token', iat: 1_800_000_000, exp: 1_800_003_600 })
  assert.ok(await crypto.subtle.verify('RSASSA-PKCS1-v1_5', keys.publicKey, Buffer.from(sig, 'base64url'), new TextEncoder().encode(`${h}.${c}`)))
})

test('a service account: the token is fetched from Google only (not the file\'s token_uri), used, and reused until it expires', async () => {
  const { sa } = await serviceAccount()
  const { config } = readConfig({ GOOGLE_SERVICE_ACCOUNT_JSON: JSON.stringify(sa) })
  let now = 1_800_000_000_000
  const f = fake((url) => url.startsWith('https://oauth2.googleapis.com/') ? json({ access_token: `ya29.token${f.sent.length}`, expires_in: 3600 }) : json({ audioContent: b64(silentMp3(0.5)) }))
  const tts = googleTts(config.tts, f.fetchFn, () => now)
  await tts.synthesize('Raz.')
  await tts.synthesize('Dwa.')
  const tokenCalls = f.sent.filter((x) => x.url.includes('oauth2'))
  assert.equal(tokenCalls.length, 1)
  assert.ok(!f.sent.some((x) => x.url.includes('evil')))
  assert.equal(tokenCalls[0].url, 'https://oauth2.googleapis.com/token')
  assert.match(String(tokenCalls[0].body), /^grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=ey/)
  assert.equal(new Headers(f.sent[1].init.headers).get('authorization'), 'Bearer ya29.token1')
  now += 3600_000
  await tts.synthesize('Trzy.')
  assert.equal(f.sent.filter((x) => x.url.includes('oauth2')).length, 2, 'a new token after an hour')
  const bad = readConfig({ GOOGLE_SERVICE_ACCOUNT_JSON: JSON.stringify({ ...sa, private_key: 'not a key' }) }).config
  await assert.rejects(googleTts(bad.tts, f.fetchFn).synthesize('x'), (e: unknown) => e instanceof ProviderError && e.kind === 'fatal' && /private key/.test(e.message))
})

test('base64 decoding', () => {
  assert.deepEqual([...fromBase64('AAEC/w==')], [0, 1, 2, 255])
})
