// The JSON the models must answer with (OpenAI's structured outputs, strict), and a check of the answer on our side: the
// model's answer is data from outside like any other, so it is validated before anything uses it. One schema serves both:
// limits OpenAI does not take in a strict schema (string lengths) are checked here only (apiSchema drops them).
import { CLAIM_KINDS } from './config'

export type Schema =
  | { type: 'object'; properties: Record<string, Schema>; required: string[]; additionalProperties: false }
  | { type: 'array'; items: Schema; maxItems?: number; minItems?: number }
  | { type: 'string'; maxLength?: number; minLength?: number; enum?: string[] }
  | { type: 'integer' | 'number'; minimum?: number; maximum?: number }
  | { type: 'boolean' }
  | { type: 'null' }
  | { anyOf: Schema[] }

export const obj = (properties: Record<string, Schema>): Schema => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false })
export const arr = (items: Schema, maxItems?: number, minItems?: number): Schema => ({ type: 'array', items, ...(maxItems ? { maxItems } : {}), ...(minItems ? { minItems } : {}) })
export const str = (maxLength?: number, minLength?: number): Schema => ({ type: 'string', ...(maxLength ? { maxLength } : {}), ...(minLength ? { minLength } : {}) })
export const oneOf = (values: readonly string[]): Schema => ({ type: 'string', enum: [...values] })
export const int = (minimum: number, maximum: number): Schema => ({ type: 'integer', minimum, maximum })
export const bool = (): Schema => ({ type: 'boolean' })
export const nullable = (s: Schema): Schema => ({ anyOf: [s, { type: 'null' }] })

// What is sent to OpenAI
export function apiSchema(s: Schema): unknown {
  if ('anyOf' in s) return { anyOf: s.anyOf.map(apiSchema) }
  if (s.type === 'object') return { ...s, properties: Object.fromEntries(Object.entries(s.properties).map(([k, v]) => [k, apiSchema(v)])) }
  if (s.type === 'array') return { ...s, items: apiSchema(s.items) }
  if (s.type === 'string') { const { maxLength: _a, minLength: _b, ...rest } = s; return rest }
  return s
}

// Problems with a value, as "stories[2].claims[0].kind: …" (empty: it fits)
export function validate(s: Schema, v: unknown, path = '$', out: string[] = []): string[] {
  if (out.length > 20) return out
  if ('anyOf' in s) {
    const results = s.anyOf.map((o) => validate(o, v, path, []))
    if (!results.some((r) => r.length === 0)) out.push(...(results.find((r) => r.length) ?? [`${path}: no match`]))
    return out
  }
  switch (s.type) {
    case 'null': if (v !== null) out.push(`${path}: expected null`); break
    case 'boolean': if (typeof v !== 'boolean') out.push(`${path}: expected a boolean`); break
    case 'integer': case 'number':
      if (typeof v !== 'number' || !Number.isFinite(v) || (s.type === 'integer' && !Number.isInteger(v))) { out.push(`${path}: expected ${s.type === 'integer' ? 'an integer' : 'a number'}`); break }
      if (s.minimum !== undefined && v < s.minimum) out.push(`${path}: below ${s.minimum}`)
      if (s.maximum !== undefined && v > s.maximum) out.push(`${path}: above ${s.maximum}`)
      break
    case 'string':
      if (typeof v !== 'string') { out.push(`${path}: expected a string`); break }
      if (s.enum && !s.enum.includes(v)) out.push(`${path}: not one of ${s.enum.join(', ')}`)
      if (s.maxLength !== undefined && v.length > s.maxLength) out.push(`${path}: longer than ${s.maxLength}`)
      if (s.minLength !== undefined && v.length < s.minLength) out.push(`${path}: shorter than ${s.minLength}`)
      break
    case 'array':
      if (!Array.isArray(v)) { out.push(`${path}: expected an array`); break }
      if (s.maxItems !== undefined && v.length > s.maxItems) out.push(`${path}: more than ${s.maxItems} items`)
      if (s.minItems !== undefined && v.length < s.minItems) out.push(`${path}: fewer than ${s.minItems} items`)
      v.forEach((x, i) => validate(s.items, x, `${path}[${i}]`, out))
      break
    case 'object': {
      if (typeof v !== 'object' || v === null || Array.isArray(v)) { out.push(`${path}: expected an object`); break }
      const o = v as Record<string, unknown>
      for (const k of s.required) if (!(k in o)) out.push(`${path}.${k}: missing`)
      for (const k of Object.keys(o)) {
        if (!(k in s.properties)) out.push(`${path}.${k}: not allowed`)
        else validate(s.properties[k], o[k], `${path}.${k}`, out)
      }
      break
    }
  }
  return out
}

export const CATEGORIES = ['markets', 'macro', 'central-banks', 'companies-us', 'companies-world', 'companies-pl', 'commodities', 'currencies',
  'crypto', 'geopolitics', 'policy', 'other'] as const
export type Category = (typeof CATEGORIES)[number]

// ── Stage 2, triage: the stories of the night, as atomic claims to check ──
export interface TriageClaim { id: string; text: string; kind: (typeof CLAIM_KINDS)[number]; eventTime: string | null; entities: string[] }
export interface TriageStory {
  id: string; candidateIds: string[]; headline: string; category: Category; importance: number
  claims: TriageClaim[]; queries: string[]; primaryDomains: string[]; whyItMatters: string
}
export interface TriageAnswer { stories: TriageStory[] }
export const triageSchema = (maxStories: number): Schema => obj({
  stories: arr(obj({
    id: str(12, 1),
    candidateIds: arr(str(8, 1), 8, 1),
    headline: str(140, 5),
    category: oneOf(CATEGORIES),
    importance: int(1, 5),
    claims: arr(obj({
      id: str(12, 1),
      text: str(320, 10),
      kind: oneOf(CLAIM_KINDS),
      eventTime: nullable(str(40)),
      entities: arr(str(80, 1), 6),
    }), 4, 1),
    queries: arr(str(160, 3), 3, 1),
    primaryDomains: arr(str(100, 3), 4),
    whyItMatters: str(300),
  }), maxStories),
})

// ── Stage 3, research with the model's web search: where to read about a story ──
export interface SearchAnswer { results: { url: string; title: string; publisher: string; primary: boolean }[] }
export const searchSchema = (max: number): Schema => obj({
  results: arr(obj({ url: str(2000, 8), title: str(300), publisher: str(120), primary: bool() }), max),
})

// ── Stage 4, verification of the claims against the pages that were read ──
export const VERDICTS = ['supported', 'contradicted', 'insufficient'] as const
export const BASES = ['close', 'live', 'indicative'] as const
export interface MarketData { instrument: string; value: string; change: string | null; session: string; observedAt: string | null; basis: (typeof BASES)[number] }
export interface VerifyClaim {
  claimId: string
  verdict: (typeof VERDICTS)[number]
  verifiedText: string | null
  supports: { sourceId: string; quote: string }[]
  contradictions: { sourceId: string; quote: string; explanation: string }[]
  eventTime: string | null
  market: MarketData | null
}
export interface VerifyAnswer { claims: VerifyClaim[]; oldNews: boolean; oldNewsReason: string | null }
export const verifySchema = (): Schema => obj({
  claims: arr(obj({
    claimId: str(12, 1),
    verdict: oneOf(VERDICTS),
    verifiedText: nullable(str(400, 10)),
    supports: arr(obj({ sourceId: str(8, 1), quote: str(500, 1) }), 4),
    contradictions: arr(obj({ sourceId: str(8, 1), quote: str(500, 1), explanation: str(300) }), 3),
    eventTime: nullable(str(40)),
    market: nullable(obj({
      instrument: str(80, 1), value: str(40, 1), change: nullable(str(40)), session: str(120, 1), observedAt: nullable(str(40)), basis: oneOf(BASES),
    })),
  }), 4),
  oldNews: bool(),
  oldNewsReason: nullable(str(300)),
})

// ── Stage 6, the script: one segment per selected story ──
export interface WriteAnswer { segments: { storyId: string; headline: string; text: string; claimIds: string[] }[] }
export const writeSchema = (maxStories: number): Schema => obj({
  segments: arr(obj({ storyId: str(12, 1), headline: str(110, 5), text: str(1400, 40), claimIds: arr(str(12, 1), 6, 1) }), maxStories, 1),
})

// ── Stage 7, the final check of the script against the verified claims ──
export const ISSUE_TYPES = ['unsupported', 'wrong_number', 'wrong_time', 'misattribution', 'misleading', 'language', 'other'] as const
export interface ValidateAnswer {
  verdict: 'pass' | 'fail'
  issues: { storyId: string; severity: 'error' | 'warning'; type: (typeof ISSUE_TYPES)[number]; excerpt: string; explanation: string }[]
}
export const validateSchema = (): Schema => obj({
  verdict: oneOf(['pass', 'fail']),
  issues: arr(obj({ storyId: str(12), severity: oneOf(['error', 'warning']), type: oneOf(ISSUE_TYPES), excerpt: str(400), explanation: str(400) }), 30),
})
