// Reading headlines aloud with the browser's Web Speech API. Nothing goes to a
// server; the available voices depend on the system and the browser.
import type { Item } from './news'
import type { Prefs } from './prefs'

export const speechSupported = () =>
  typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window

export const polishVoices = (voices: SpeechSynthesisVoice[]) =>
  voices.filter((v) => v.lang.toLowerCase().replace('_', '-').startsWith('pl'))

// Prefer natural/online voices (Edge "Natural", Chrome "Google"), then the system default
function autoVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | undefined {
  const rank = (v: SpeechSynthesisVoice) =>
    (/natural|online/i.test(v.name) ? 4 : 0) + (/google/i.test(v.name) ? 2 : 0) + (v.default ? 0.5 : 0)
  return [...polishVoices(voices)].sort((a, b) => rank(b) - rank(a))[0]
}

export const pickVoice = (voices: SpeechSynthesisVoice[], uri: string) =>
  (uri && voices.find((v) => v.voiceURI === uri)) || autoVoice(voices)

export function speak(text: string, prefs: Prefs, voices: SpeechSynthesisVoice[]) {
  if (!speechSupported()) return
  const u = new SpeechSynthesisUtterance(text)
  const voice = pickVoice(voices, prefs.voiceURI)
  if (voice) u.voice = voice
  u.lang = voice?.lang ?? 'pl-PL'
  u.rate = prefs.rate
  window.speechSynthesis.speak(u) // the browser queues utterances itself
}

export function stopSpeaking() {
  if (speechSupported()) window.speechSynthesis.cancel()
}

// ESPI and Stooq titles already say what it is about; GPW gets its name in front
export const spokenText = (it: Item) => (it.source === 'GPW' ? `GPW: ${it.title}` : it.title)

// `fresh` is oldest first. Over the limit: read the newest ones, sum up the rest.
export function announce(fresh: Item[], prefs: Prefs, voices: SpeechSynthesisVoice[]) {
  const head = fresh.slice(-prefs.maxPerRefresh)
  for (const it of head) speak(spokenText(it), prefs, voices)
  const rest = fresh.length - head.length
  if (rest > 0) speak(`I jeszcze ${rest} ${plural(rest)}.`, prefs, voices)
}

export function plural(n: number): string {
  const d = n % 10, t = n % 100
  if (n === 1) return 'nowy news'
  if (d >= 2 && d <= 4 && (t < 12 || t > 14)) return 'nowe newsy'
  return 'nowych newsów'
}
