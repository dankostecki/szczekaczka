// The sound before the voice: a short, soft chime ahead of new headlines read aloud, so a voice does not start out of nothing. It is made here (two soft
// bell notes, a fifth apart, no file to load, so it works offline too) and kept low, round and slow in the attack, to be heard all day: no high overtones, no
// click at the start, a tail that dies away. It plays only where the voice has been silent, and it can be turned off in the settings (Prefs.chime).

// The notes: A4, then the E5 above it a moment later
const NOTES = [{ hz: 440, at: 0, decay: 0.24 }, { hz: 659.26, at: 0.17, decay: 0.3 }]
export const CHIME_SECONDS = 1.5
// The loudest point, well below a voice (which is near 0.5 and above), so it stays in the background
export const CHIME_PEAK = 0.14
// How long after the start the voice may begin: while the tail of the chime is still dying away
export const CHIME_LEAD_MS = 900
const ATTACK = 0.014 // seconds up to full volume: a rounded start, no click
const FADE_OUT = 0.2 // seconds at the end that bring it to nothing

// The chime as samples at a rate: each note is a sine with a quieter octave above it and a trace of the twelfth, falling off at their own pace (the higher ones
// sooner), which is what makes it a soft bell and not a beep
export function chimeSamples(rate: number): Float32Array {
  const out = new Float32Array(Math.round(rate * CHIME_SECONDS))
  for (const { hz, at, decay } of NOTES) {
    for (let i = Math.floor(at * rate); i < out.length; i++) {
      const t = i / rate - at
      const attack = t < ATTACK ? 0.5 - 0.5 * Math.cos((Math.PI * t) / ATTACK) : 1
      const w = 2 * Math.PI * hz * t
      out[i] += attack * (Math.exp(-t / decay) * Math.sin(w) + 0.18 * Math.exp(-t / (decay * 0.5)) * Math.sin(2 * w) + 0.04 * Math.exp(-t / (decay * 0.3)) * Math.sin(3 * w))
    }
  }
  let peak = 0
  for (const s of out) peak = Math.max(peak, Math.abs(s))
  const fadeFrom = out.length - Math.round(rate * FADE_OUT)
  for (let i = 0; i < out.length; i++) out[i] *= (CHIME_PEAK / peak) * (i < fadeFrom ? 1 : 0.5 + 0.5 * Math.cos((Math.PI * (i - fadeFrom)) / (out.length - fadeFrom)))
  return out
}

type AudioContextConstructor = typeof AudioContext
const contextClass = (): AudioContextConstructor | undefined =>
  typeof window === 'undefined' ? undefined : window.AudioContext ?? (window as unknown as { webkitAudioContext?: AudioContextConstructor }).webkitAudioContext

export const chimeSupported = () => !!contextClass()

let context: AudioContext | undefined
let buffer: AudioBuffer | undefined
function audio(): AudioContext | undefined {
  if (context) return context
  const Context = contextClass()
  if (!Context) return undefined
  try { context = new Context() } catch { return undefined }
  return context
}

// Inside a tap or a click: a browser lets a page make sound only after one
export function unlockChime() {
  try { void audio()?.resume() } catch {}
}

// Plays the chime and resolves when the voice may begin (not when the tail is over). Where it cannot play (no sound allowed yet, no support) it resolves at once,
// so the voice never waits for a sound that does not come.
export function playChime(): Promise<void> {
  return new Promise((resolve) => {
    const ctx = audio()
    if (!ctx) { resolve(); return }
    let gaveUp = false
    const start = () => {
      if (gaveUp) return
      try {
        if (!buffer) {
          buffer = ctx.createBuffer(1, Math.round(ctx.sampleRate * CHIME_SECONDS), ctx.sampleRate)
          buffer.getChannelData(0).set(chimeSamples(ctx.sampleRate))
        }
        const source = ctx.createBufferSource()
        source.buffer = buffer
        source.connect(ctx.destination)
        source.start()
        setTimeout(resolve, CHIME_LEAD_MS)
      } catch { resolve() }
    }
    if (ctx.state === 'running') { start(); return }
    // The context was not started yet (or the phone stopped it): asked once, and the voice does not wait long for the answer
    const timer = setTimeout(() => { gaveUp = true; resolve() }, 300)
    ctx.resume().then(() => { clearTimeout(timer); if (ctx.state === 'running') start(); else resolve() }, () => { clearTimeout(timer); resolve() })
  })
}
