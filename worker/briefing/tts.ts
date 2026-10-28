// Google Cloud Text-to-Speech, a Chirp 3: HD voice (pl-PL-Chirp3-HD-Aoede unless BRIEFING_TTS_VOICE says otherwise), MP3.
// REST v1 as Google's discovery document describes it: POST /v1/text:synthesize with input.text (at most 5000 bytes),
// voice.languageCode and voice.name, audioConfig.audioEncoding "MP3"; the answer is { audioContent: base64 }.
// GET /v1/voices?languageCode=pl-PL lists the voices: the configured one is checked there before an edition starts.
//
// Two ways to sign in, both from the Worker's secrets:
// - GOOGLE_TTS_API_KEY: an API key restricted to the Text-to-Speech API (sent in the x-goog-api-key header, not in the address);
// - GOOGLE_SERVICE_ACCOUNT_JSON: a service account key; the Worker signs a JWT with it (RS256, WebCrypto) and trades it at
//   https://oauth2.googleapis.com/token for an access token that lasts an hour.
// docs/poranny-przeglad.md says which to choose and how to rotate them.
import type { BriefingConfig } from './config'
import { ProviderError, httpError } from './llm'

export interface Tts {
  checkVoice(): Promise<void>
  synthesize(text: string): Promise<Uint8Array>
}

type Fetch = typeof fetch
type TtsConfig = BriefingConfig['tts']

const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const b64urlText = (s: string) => b64url(new TextEncoder().encode(s))

export function fromBase64(s: string): Uint8Array {
  const native = (Uint8Array as unknown as { fromBase64?: (s: string) => Uint8Array }).fromBase64
  if (native) return native(s)
  const bin = atob(s)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

const TOKEN_URL = 'https://oauth2.googleapis.com/token'

// A signed JWT for the token endpoint (Google's service-account flow)
export async function serviceAccountJwt(sa: { client_email: string; private_key: string; private_key_id?: string }, nowS: number): Promise<string> {
  const pem = sa.private_key.replace(/-----(BEGIN|END) PRIVATE KEY-----/g, '').replace(/\s+/g, '')
  const der = fromBase64(pem)
  const key = await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign'])
  const header = b64urlText(JSON.stringify({ alg: 'RS256', typ: 'JWT', ...(sa.private_key_id ? { kid: sa.private_key_id } : {}) }))
  const claims = b64urlText(JSON.stringify({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/cloud-platform', aud: TOKEN_URL, iat: nowS, exp: nowS + 3600 }))
  const signature = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(`${header}.${claims}`)))
  return `${header}.${claims}.${b64url(signature)}`
}

export function googleTts(c: TtsConfig, fetchFn: Fetch = fetch, clock = () => Date.now()): Tts {
  let token: { value: string; until: number } | null = null

  async function auth(): Promise<Record<string, string>> {
    if (c.apiKey) return { 'x-goog-api-key': c.apiKey }
    if (!c.serviceAccountJson) throw new ProviderError('Text-to-Speech: no credentials', 'fatal')
    if (token && token.until > clock() + 60_000) return { Authorization: `Bearer ${token.value}` }
    let sa: { client_email: string; private_key: string; private_key_id?: string }
    try { sa = JSON.parse(c.serviceAccountJson) } catch { throw new ProviderError('GOOGLE_SERVICE_ACCOUNT_JSON is not JSON', 'fatal') }
    let jwt: string
    try { jwt = await serviceAccountJwt(sa, Math.floor(clock() / 1000)) } catch { throw new ProviderError('GOOGLE_SERVICE_ACCOUNT_JSON: the private key could not be read', 'fatal') }
    let res: Response
    try {
      // Always Google's own endpoint: the key file's token_uri is not trusted with the signed assertion
      res = await fetchFn(TOKEN_URL, {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }).toString(),
        signal: AbortSignal.timeout(20_000),
      })
    } catch { throw new ProviderError('Google sign-in: no connection', 'retryable') }
    if (!res.ok) throw await httpError(res, 'Google sign-in')
    const body = await res.json() as { access_token?: string; expires_in?: number }
    if (!body.access_token) throw new ProviderError('Google sign-in: no access token in the answer', 'retryable')
    token = { value: body.access_token, until: clock() + (body.expires_in ?? 3600) * 1000 }
    return { Authorization: `Bearer ${token.value}` }
  }

  return {
    async checkVoice() {
      let res: Response
      try {
        res = await fetchFn(`${c.endpoint}/v1/voices?languageCode=${encodeURIComponent(c.languageCode)}`, { headers: await auth(), signal: AbortSignal.timeout(20_000) })
      } catch (e) { if (e instanceof ProviderError) throw e; throw new ProviderError('Text-to-Speech: no connection', 'retryable') }
      if (!res.ok) throw await httpError(res, 'Text-to-Speech voices')
      const body = await res.json() as { voices?: { name?: string }[] }
      const names = (body.voices ?? []).map((v) => v.name ?? '')
      if (!names.includes(c.voice)) {
        const hd = names.filter((n) => n.includes('Chirp3-HD')).slice(0, 12).join(', ')
        throw new ProviderError(`Text-to-Speech: no voice "${c.voice}" for ${c.languageCode}${hd ? ` (Chirp 3 HD voices: ${hd})` : ''}`, 'fatal')
      }
    },

    async synthesize(text) {
      if (new TextEncoder().encode(text).length > 5000) throw new ProviderError('Text-to-Speech: a part over 5000 bytes', 'fatal')
      let res: Response
      try {
        res = await fetchFn(`${c.endpoint}/v1/text:synthesize`, {
          method: 'POST',
          headers: { ...(await auth()), 'Content-Type': 'application/json' },
          body: JSON.stringify({
            input: { text },
            voice: { languageCode: c.languageCode, name: c.voice },
            audioConfig: { audioEncoding: 'MP3', ...(c.speakingRate !== undefined ? { speakingRate: c.speakingRate } : {}) },
          }),
          signal: AbortSignal.timeout(c.timeoutMs),
        })
      } catch (e) { if (e instanceof ProviderError) throw e; throw new ProviderError('Text-to-Speech: no connection or no answer in time', 'retryable') }
      if (!res.ok) throw await httpError(res, 'Text-to-Speech')
      const body = await res.json() as { audioContent?: string }
      if (!body.audioContent) throw new ProviderError('Text-to-Speech: no audio in the answer', 'retryable')
      return fromBase64(body.audioContent)
    },
  }
}
