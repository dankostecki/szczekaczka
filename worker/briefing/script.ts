// The script: a greeting and a sign-off made here (the date and the hours said in words, so they are always right), the
// segments the model wrote, the checks in code that come before the final model's check, and the parts for the voice.
import { numbersBacked } from './verify'
import { minutesOf } from './config'

export interface Segment { storyId: string; headline: string; text: string; claimIds: string[] }
export interface Script { intro: string; segments: Segment[]; outro: string }

const MONTHS = ['stycznia', 'lutego', 'marca', 'kwietnia', 'maja', 'czerwca', 'lipca', 'sierpnia', 'września', 'października', 'listopada', 'grudnia']
const WEEKDAYS = ['poniedziałek', 'wtorek', 'środa', 'czwartek', 'piątek', 'sobota', 'niedziela']
const ORD_UNITS = ['', 'pierwszy', 'drugi', 'trzeci', 'czwarty', 'piąty', 'szósty', 'siódmy', 'ósmy', 'dziewiąty']
const ORD_TEENS = ['dziesiąty', 'jedenasty', 'dwunasty', 'trzynasty', 'czternasty', 'piętnasty', 'szesnasty', 'siedemnasty', 'osiemnasty', 'dziewiętnasty']
// Feminine genitive ordinals of the hours ("do szóstej", "od dziewiętnastej")
const HOURS = ['dwudziestej czwartej', 'pierwszej', 'drugiej', 'trzeciej', 'czwartej', 'piątej', 'szóstej', 'siódmej', 'ósmej', 'dziewiątej', 'dziesiątej',
  'jedenastej', 'dwunastej', 'trzynastej', 'czternastej', 'piętnastej', 'szesnastej', 'siedemnastej', 'osiemnastej', 'dziewiętnastej', 'dwudziestej',
  'dwudziestej pierwszej', 'dwudziestej drugiej', 'dwudziestej trzeciej']
const UNITS = ['zero', 'jeden', 'dwa', 'trzy', 'cztery', 'pięć', 'sześć', 'siedem', 'osiem', 'dziewięć', 'dziesięć', 'jedenaście', 'dwanaście', 'trzynaście',
  'czternaście', 'piętnaście', 'szesnaście', 'siedemnaście', 'osiemnaście', 'dziewiętnaście']
const TENS = ['', '', 'dwadzieścia', 'trzydzieści', 'czterdzieści', 'pięćdziesiąt']

export function dayOrdinal(d: number): string {
  if (d < 10) return ORD_UNITS[d]
  if (d < 20) return ORD_TEENS[d - 10]
  const tens = d < 30 ? 'dwudziesty' : 'trzydziesty'
  return d % 10 ? `${tens} ${ORD_UNITS[d % 10]}` : tens
}

// "szóstej", "szóstej trzydzieści", "dziewiętnastej piętnaście"
export function hourWords(hhmm: string): string {
  const m = minutesOf(hhmm)
  const h = HOURS[Math.floor(m / 60) % 24], min = m % 60
  if (!min) return h
  const words = min < 20 ? UNITS[min] : `${TENS[Math.floor(min / 10)]}${min % 10 ? ` ${UNITS[min % 10]}` : ''}`
  return `${h} ${min < 10 ? `zero ${words}` : words}`
}

export function greeting(editionId: string, windowStart: string, cutoff: string): string {
  const [y, m, d] = editionId.split('-').map(Number)
  const weekday = WEEKDAYS[(new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7]
  return `Dzień dobry. Jest ${weekday}, ${dayOrdinal(d)} ${MONTHS[m - 1]}. Oto poranny przegląd rynków: najważniejsze wiadomości od wczoraj, od godziny ${hourWords(windowStart)}, do dziś do godziny ${hourWords(cutoff)}.`
}

export const SIGN_OFF = 'To wszystko w porannym przeglądzie rynków. Tekst przygotowano automatycznie na podstawie sprawdzonych źródeł, a głos wygenerowała sztuczna inteligencja. Źródła każdej informacji są na stronie przeglądu.'

export const scriptText = (s: Script) => [s.intro, ...s.segments.map((x) => x.text), s.outro].map((p) => p.trim()).join('\n\n')
export const wordCount = (text: string) => (text.match(/[\p{L}\p{N}]+(?:[-'’][\p{L}\p{N}]+)*/gu) ?? []).length

// ── Checks in code ──
// Things a speech voice reads badly, or that do not belong in a spoken text
const FORBIDDEN: [RegExp, string][] = [
  [/https?:\/\/|www\.|\.(?:com|pl|org)\b/i, 'an address'],
  [/[*#_`[\]{}<>|\\]/, 'formatting characters'],
  [/\p{Extended_Pictographic}/u, 'an emoji'],
  [/[%$€£¥]/, 'a symbol to write in words (procent, dolarów, euro, funtów, jenów)'],
  [/(?<![\p{L}])(?:mld|mln|tys|proc|pkt|zł|ok|np|tzw|godz|ws|wg|ub|br)\.?(?![\p{L}])/iu, 'an abbreviation'],
  [/(?<![\p{L}])(?:r\/r|k\/k|m\/m|p\.p\.|b\.p\.|bps|yoy|qoq)(?![\p{L}])/iu, 'an abbreviation'],
  [/\b(?:USD|EUR|PLN|GBP|CHF|JPY|CNY|EPS|YTD)\b/, 'a code to say in words'],
  [/\b[A-Z]{2,8}:[A-Z][A-Z.]{0,6}\b|\$[A-Z]{1,5}\b/, 'a ticker'],
  [/[()]/, 'brackets'],
]
const SENTENCE_MAX = 300

export function splitSentences(text: string): string[] {
  return text.split(/(?<=[.!?…])["”»]?\s+(?=["„«(]?[\p{Lu}\d])/u).map((s) => s.trim()).filter(Boolean)
}

export interface LintContext {
  storyIds: string[]                              // the selected stories, in order
  claims: Map<string, Map<string, string>>        // story → kept claim id → verified text
  minWords: number
  maxWords: number
  years: number[]
}

export function lintScript(s: Script, ctx: LintContext): string[] {
  const issues: string[] = []
  const seen = new Set<string>()
  for (const seg of s.segments) {
    const where = `segment ${seg.storyId}`
    if (!ctx.claims.has(seg.storyId)) { issues.push(`${where}: not one of the selected stories`); continue }
    if (seen.has(seg.storyId)) issues.push(`${where}: twice`)
    seen.add(seg.storyId)
    const kept = ctx.claims.get(seg.storyId)!
    const bad = seg.claimIds.filter((id) => !kept.has(id))
    if (bad.length) issues.push(`${where}: cites claims that were not verified (${bad.join(', ')})`)
    const cited = seg.claimIds.filter((id) => kept.has(id)).map((id) => kept.get(id)!)
    if (!cited.length) issues.push(`${where}: cites no verified claim`)
    for (const [field, text] of [['headline', seg.headline], ['text', seg.text]] as const) {
      for (const [re, what] of FORBIDDEN) { const m = text.match(re); if (m) issues.push(`${where} ${field}: ${what} („${m[0]}”)`) }
      const numbers = numbersBacked(text, cited, ctx.years)
      if (!numbers.ok) issues.push(`${where} ${field}: numbers not in its verified claims (${numbers.missing.join(', ')})`)
    }
    for (const sentence of splitSentences(seg.text)) if (sentence.length > SENTENCE_MAX) issues.push(`${where}: a sentence over ${SENTENCE_MAX} characters`)
  }
  for (const id of ctx.storyIds) if (!seen.has(id)) issues.push(`story ${id}: no segment`)
  const words = wordCount(scriptText(s))
  if (words < ctx.minWords) issues.push(`the script has ${words} words, at least ${ctx.minWords} wanted`)
  if (words > ctx.maxWords) issues.push(`the script has ${words} words, at most ${ctx.maxWords} wanted`)
  return issues
}

// ── Parts for the voice: whole sentences, paragraphs kept together where they fit, each at most `maxBytes` of UTF-8 ──
const bytes = (s: string) => new TextEncoder().encode(s).length

// A sentence too long for one part: at commas, then at spaces, never inside a character
function splitLong(sentence: string, maxBytes: number): string[] {
  const out: string[] = []
  let rest = sentence
  while (bytes(rest) > maxBytes) {
    let cut = 0, used = 0, lastComma = -1, lastSpace = -1
    for (const ch of rest) {
      const n = bytes(ch)
      if (used + n > maxBytes) break
      used += n
      cut += ch.length
      if (/[,;:–—]/.test(ch)) lastComma = cut
      else if (ch === ' ') lastSpace = cut
    }
    const at = lastComma > cut / 2 ? lastComma : lastSpace > 0 ? lastSpace : cut
    out.push(rest.slice(0, at).trim())
    rest = rest.slice(at).trim()
  }
  if (rest) out.push(rest)
  return out
}

export function chunkText(text: string, maxBytes: number): string[] {
  const chunks: string[] = []
  let current = ''
  const add = (piece: string, sep: string) => {
    const next = current ? `${current}${sep}${piece}` : piece
    if (bytes(next) <= maxBytes) { current = next; return }
    if (current) chunks.push(current)
    current = piece
  }
  for (const para of text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean)) {
    let sep = '\n\n'
    for (const sentence of splitSentences(para)) {
      for (const piece of bytes(sentence) > maxBytes ? splitLong(sentence, maxBytes) : [sentence]) { add(piece, sep); sep = ' ' }
    }
  }
  if (current) chunks.push(current)
  return chunks
}
