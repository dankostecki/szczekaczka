// Reading headlines aloud with the browser's Web Speech API. Nothing goes to a
// server; the available voices depend on the system and the browser.
import type { Item } from './news'
import type { Prefs } from './prefs'
import { feedKey, langOf, type Lang } from './sources'
import { sayNumbers } from './macronext'

export const speechSupported = () =>
  typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window

const LANG_TAG: Record<Lang, string> = { pl: 'pl-PL', en: 'en-US' }
const tag = (v: SpeechSynthesisVoice) => v.lang.toLowerCase().replace('_', '-')
const NATURAL = /natural|online|neural|enhanced|premium/i

// Natural/online voices first (Edge: Zofia, Marek; Aria, Jenny), then Google (Chrome), then
// the rest (Windows Paulina, Apple Zosia / Samantha, Android, eSpeak). English: US accent first,
// and a few good default voices before the alphabet (Edge alone has dozens).
const PREFERRED_EN = /\b(aria|jenny|guy|andrew|emma|ava|samantha|google us english)\b/i
const rank = (v: SpeechSynthesisVoice) =>
  (NATURAL.test(v.name) ? 4 : 0) + (/google/i.test(v.name) ? 2 : 0) + (v.default ? 0.5 : 0)
  + (tag(v).startsWith('en-us') ? 1 : 0) + (tag(v).startsWith('en') && PREFERRED_EN.test(v.name) ? 0.75 : 0)

// Every voice for a language the browser and system offer, best first
export function voicesFor(voices: SpeechSynthesisVoice[], lang: Lang): SpeechSynthesisVoice[] {
  const seen = new Set<string>()
  return voices
    .filter((v) => tag(v).startsWith(lang) && !seen.has(v.voiceURI) && seen.add(v.voiceURI))
    .sort((a, b) => rank(b) - rank(a) || a.name.localeCompare(b.name))
}
export const polishVoices = (voices: SpeechSynthesisVoice[]) => voicesFor(voices, 'pl')

// The chosen voice if this browser has it, else the best one for the language. Undefined when
// there is none: then the browser uses its default voice for the language.
export const pickVoice = (voices: SpeechSynthesisVoice[], uri: string, lang: Lang = 'pl') => {
  const list = voicesFor(voices, lang)
  return (uri && list.find((v) => v.voiceURI === uri)) || list[0]
}

const FEMALE = /\b(paulina|zofia|zosia|agnieszka|ewa|maja|anna|ola|aleksandra|natalia|google polski|aria|jenny|emma|ava|michelle|sonia|libby|maisie|natasha|clara|samantha|karen|moira|tessa|fiona|victoria|zira|susan|hazel|catherine|serena|female)\b/i
const MALE = /\b(marek|krzysztof|adam|jacek|jan|kuba|jakub|piotr|tomasz|guy|andrew|brian|christopher|eric|roger|ryan|thomas|william|daniel|alex|fred|david|mark|george|james|liam|male)\b/i
const REGION: Record<string, string> = { us: 'USA', gb: 'UK', au: 'Australia', ca: 'Kanada', ie: 'Irlandia', in: 'Indie', nz: 'Nowa Zelandia', za: 'RPA' }

// "Microsoft Zofia Online (Natural) - Polish (Poland)" -> "Zofia · kobieta · naturalny · Microsoft"
// "Microsoft Aria Online (Natural) - English (United States)" -> "Aria · kobieta · naturalny · USA · Microsoft"
export function voiceLabel(v: SpeechSynthesisVoice): string {
  const vendor = /microsoft/i.test(v.name) ? 'Microsoft' : /google/i.test(v.name) ? 'Google' : ''
  const natural = NATURAL.test(v.name)
  const name = v.name
    .replace(/\s*[-–]\s*(Polish|English)\b.*$/i, '')
    .replace(/\((natural|enhanced|premium)\)|\b(microsoft|online|desktop)\b/gi, '')
    .replace(/\s+/g, ' ').trim() || v.name
  const gender = FEMALE.test(v.name) ? 'kobieta' : MALE.test(v.name) ? 'mężczyzna' : ''
  const code = tag(v).startsWith('en') ? tag(v).split('-')[1] ?? '' : ''
  const region = code && !/\b(US|UK)\b/.test(name) ? REGION[code] ?? code.toUpperCase() : ''
  return [name, gender, natural && 'naturalny', region, vendor && !name.toLowerCase().includes(vendor.toLowerCase()) && vendor]
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
export function speak(text: string, prefs: Prefs, voices: SpeechSynthesisVoice[], onEnd?: () => void, lang: Lang = 'pl') {
  if (!speechSupported()) return
  const voice = pickVoice(voices, lang === 'en' ? prefs.voiceURIEn : prefs.voiceURI, lang)
  const parts = chunks(text)
  parts.forEach((part, i) => {
    const u = new SpeechSynthesisUtterance(part)
    if (voice) u.voice = voice
    u.lang = voice?.lang ?? LANG_TAG[lang]
    u.rate = prefs.rate
    if (onEnd && i === parts.length - 1) { u.onend = onEnd; u.onerror = onEnd }
    window.speechSynthesis.speak(u) // the browser queues utterances itself
  })
}

export function stopSpeaking() {
  if (speechSupported()) window.speechSynthesis.cancel()
}

// The lead as it should sound: without a "8.10.2026, Warszawa (PAP) -" dateline and without
// the title repeated at its start, whole sentences, at most about 400 characters. A lead the
// feed cut before the first sentence ended ("…") is read up to the cut rather than skipped.
export function spokenLead(description: string, title: string): string {
  let text = description
    .replace(/^\s*\d{1,2}\.\d{1,2}\.\d{4}\s*(?:r\.)?,?\s*[^-–—(]{0,40}\(([^)]{1,30})\)\s*[-–—]\s*/, '')
    .trim()
  if (title && text.startsWith(title)) text = text.slice(title.length).replace(/^[\s.:;,!?–—-]+/, '').trim()
  if (!text || title.includes(text)) return ''
  // A sentence ends at . ! ? before a capital letter, so "S.A." or "8.10.2026" stay whole
  const sentences = text.split(/(?<=[.!?…])\s+(?=[A-ZĄĆĘŁŃÓŚŹŻ„"(])/).map((s) => s.trim()).filter(Boolean)
  const whole = sentences.filter((s) => /[.!?]$/.test(s) && !/(\.\.\.|…)$/.test(s))
  let lead = ''
  for (const s of whole) {
    if (lead && lead.length + s.length > 400) break
    lead = lead ? `${lead} ${s}` : s
  }
  if (!lead) {
    const cut = text.replace(/\s*(\.\.\.|…)\s*$/, '')
    lead = cut.length <= 400 ? cut : cut.slice(0, cut.lastIndexOf(' ', 400))
  }
  return lead
}

// What is read for one headline: the title (GPW with its name in front), then the lead for the
// channels where it is switched on. MacroNext's announcements: their "lead" is the figures, read
// whole, with numbers and units in words.
export function spokenParts(it: Item, prefs: Prefs): string[] {
  const withLead = prefs.leadFeeds.includes(feedKey(it.source, it.label))
  if (it.source === 'MACRONEXT') return [sayNumbers(`${it.title}.`), withLead ? sayNumbers(it.description) : ''].filter(Boolean)
  const title = it.source === 'GPW' ? `GPW: ${it.title}` : it.title
  const lead = withLead ? spokenLead(it.description, it.title) : ''
  return lead ? [title, lead] : [title]
}

// English news (Reuters) is read with the English voice
export function speakItem(it: Item, prefs: Prefs, voices: SpeechSynthesisVoice[], onEnd?: () => void) {
  const parts = spokenParts(it, prefs)
  const lang = langOf(it.source, it.label)
  parts.forEach((part, i) => speak(part, prefs, voices, i === parts.length - 1 ? onEnd : undefined, lang))
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
