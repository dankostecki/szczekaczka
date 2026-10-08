// Reading headlines aloud with the browser's Web Speech API. Nothing goes to a
// server; the available voices depend on the system and the browser.
import type { Item } from './news'
import type { Prefs } from './prefs'

export const speechSupported = () =>
  typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window

const isPolish = (v: SpeechSynthesisVoice) => v.lang.toLowerCase().replace('_', '-').startsWith('pl')

// Natural/online voices first (Edge: Zofia, Marek), then Google (Chrome), then the rest
// (Windows Paulina, Apple Zosia / Krzysztof, Android, eSpeak)
const rank = (v: SpeechSynthesisVoice) =>
  (/natural|online|neural|enhanced|premium/i.test(v.name) ? 4 : 0) + (/google/i.test(v.name) ? 2 : 0) + (v.default ? 0.5 : 0)

// Every Polish voice the browser and system offer, best first
export function polishVoices(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice[] {
  const seen = new Set<string>()
  return voices
    .filter((v) => isPolish(v) && !seen.has(v.voiceURI) && seen.add(v.voiceURI))
    .sort((a, b) => rank(b) - rank(a) || a.name.localeCompare(b.name))
}

// The chosen voice if this browser has it, else the best Polish one. Undefined when
// there is none: then the browser uses its default voice for pl-PL.
export const pickVoice = (voices: SpeechSynthesisVoice[], uri: string) => {
  const pl = polishVoices(voices)
  return (uri && pl.find((v) => v.voiceURI === uri)) || pl[0]
}

const FEMALE = /\b(paulina|zofia|zosia|agnieszka|ewa|maja|anna|ola|aleksandra|natalia|google polski)\b/i
const MALE = /\b(marek|krzysztof|adam|jacek|jan|kuba|jakub|piotr|tomasz)\b/i

// "Microsoft Zofia Online (Natural) - Polish (Poland)" -> "Zofia · kobieta · naturalny · Microsoft"
export function voiceLabel(v: SpeechSynthesisVoice): string {
  const vendor = /microsoft/i.test(v.name) ? 'Microsoft' : /google/i.test(v.name) ? 'Google' : ''
  const natural = /natural|online|neural|enhanced|premium/i.test(v.name)
  const name = v.name
    .replace(/\s*[-–]\s*Polish.*$/i, '')
    .replace(/\((natural|enhanced|premium)\)|\b(microsoft|online|desktop)\b/gi, '')
    .replace(/\s+/g, ' ').trim() || v.name
  const gender = FEMALE.test(v.name) ? 'kobieta' : MALE.test(v.name) ? 'mężczyzna' : ''
  return [name, gender, natural && 'naturalny', vendor && !name.toLowerCase().includes(vendor.toLowerCase()) && vendor]
    .filter(Boolean).join(' · ')
}

// Chrome's Google voices stop after about 15 seconds of speech, so longer text
// goes out as several short utterances, cut at sentence or clause ends.
export function chunks(text: string, max = 180): string[] {
  const out: string[] = []
  let rest = text.replace(/\s+/g, ' ').trim()
  while (rest.length > max) {
    const part = rest.slice(0, max)
    const cut = Math.max(part.lastIndexOf('. '), part.lastIndexOf('! '), part.lastIndexOf('? '), part.lastIndexOf('; '))
    const at = cut > max / 3 ? cut + 1 : Math.max(part.lastIndexOf(', '), part.lastIndexOf(' '))
    const end = at > 0 ? at : max
    out.push(rest.slice(0, end).trim())
    rest = rest.slice(end).trim()
  }
  if (rest) out.push(rest)
  return out
}

// onEnd: called once the text has been read, or when it was stopped (cancel ends it with an error)
export function speak(text: string, prefs: Prefs, voices: SpeechSynthesisVoice[], onEnd?: () => void) {
  if (!speechSupported()) return
  const voice = pickVoice(voices, prefs.voiceURI)
  const parts = chunks(text)
  parts.forEach((part, i) => {
    const u = new SpeechSynthesisUtterance(part)
    if (voice) u.voice = voice
    u.lang = voice?.lang ?? 'pl-PL'
    u.rate = prefs.rate
    if (onEnd && i === parts.length - 1) { u.onend = onEnd; u.onerror = onEnd }
    window.speechSynthesis.speak(u) // the browser queues utterances itself
  })
}

export function stopSpeaking() {
  if (speechSupported()) window.speechSynthesis.cancel()
}

// The lead as it should sound: without a "8.10.2026, Warszawa (PAP) -" dateline, only whole
// sentences (feeds often cut the text mid-word with "..."), at most about 400 characters.
export function spokenLead(description: string, title: string): string {
  const text = description
    .replace(/^\s*\d{1,2}\.\d{1,2}\.\d{4}\s*(?:r\.)?,?\s*[^-–—(]{0,40}\(([^)]{1,30})\)\s*[-–—]\s*/, '')
    .trim()
  if (!text || title.includes(text) || text.startsWith(title)) return ''
  // A sentence ends at . ! ? before a capital letter, so "S.A." or "8.10.2026" stay whole
  const sentences = text.split(/(?<=[.!?…])\s+(?=[A-ZĄĆĘŁŃÓŚŹŻ„"(])/).map((s) => s.trim()).filter(Boolean)
  const whole = sentences.filter((s) => /[.!?]$/.test(s) && !/(\.\.\.|…)$/.test(s))
  let lead = ''
  for (const s of whole) {
    if (lead && lead.length + s.length > 400) break
    lead = lead ? `${lead} ${s}` : s
  }
  return lead
}

// What is read for one headline. Stooq, ESPI and PAP: the title alone, GPW optionally with
// its name in front; then the lead when that is switched on.
export function spokenParts(it: Item, prefs: Prefs): string[] {
  const title = it.source === 'GPW' && prefs.sayGpw ? `GPW: ${it.title}` : it.title
  const lead = prefs.readLead ? spokenLead(it.description, it.title) : ''
  return lead ? [title, lead] : [title]
}

export function speakItem(it: Item, prefs: Prefs, voices: SpeechSynthesisVoice[], onEnd?: () => void) {
  const parts = spokenParts(it, prefs)
  parts.forEach((part, i) => speak(part, prefs, voices, i === parts.length - 1 ? onEnd : undefined))
}

// `fresh` is oldest first. Over the limit: read the newest ones, sum up the rest.
export function announce(fresh: Item[], prefs: Prefs, voices: SpeechSynthesisVoice[]) {
  const head = fresh.slice(-prefs.maxPerRefresh)
  for (const it of head) speakItem(it, prefs, voices)
  const rest = fresh.length - head.length
  if (rest > 0) speak(`I jeszcze ${rest} ${plural(rest)}.`, prefs, voices)
}

export function plural(n: number): string {
  const d = n % 10, t = n % 100
  if (n === 1) return 'nowy news'
  if (d >= 2 && d <= 4 && (t < 12 || t > 14)) return 'nowe newsy'
  return 'nowych newsów'
}
