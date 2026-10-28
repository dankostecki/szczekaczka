// MP3 parts joined into one file. Google's text-to-speech answers each request with a whole MP3 (32 kbps); joined
// frame by frame they play as one, provided that every part has the same sample rate and channels, and that the
// things that describe a whole file are taken out of each part: an ID3 tag at the start, an ID3v1 tag at the end, and
// a Xing/Info/VBRI frame (a first, silent frame that states the length of its own part, which a player would believe).
// The duration is counted from the frames, so the page shows the real length and a short or broken part is noticed.

export interface Mp3Info {
  frames: number
  seconds: number
  sampleRate: number
  channels: 1 | 2
  version: 1 | 2 | 2.5
  start: number // offset of the first audio frame (after the tags and the info frame)
  end: number   // offset after the last whole frame
}

const BITRATES: Record<string, number[]> = {
  // Layer III, kbps by bitrate index
  v1: [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320],
  v2: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
}
const RATES: Record<number, number[]> = { 1: [44100, 48000, 32000], 2: [22050, 24000, 16000], 2.5: [11025, 12000, 8000] }

interface Frame { length: number; samples: number; sampleRate: number; channels: 1 | 2; version: 1 | 2 | 2.5 }

export function frameAt(b: Uint8Array, i: number): Frame | null {
  if (i + 4 > b.length || b[i] !== 0xff || (b[i + 1] & 0xe0) !== 0xe0) return null
  const v = (b[i + 1] >> 3) & 3, layer = (b[i + 1] >> 1) & 3
  if (v === 1 || layer !== 1) return null // reserved version, or not Layer III
  const version = v === 3 ? 1 : v === 2 ? 2 : 2.5
  const bi = b[i + 2] >> 4, si = (b[i + 2] >> 2) & 3, pad = (b[i + 2] >> 1) & 1
  if (bi === 0 || bi === 15 || si === 3) return null
  const kbps = BITRATES[version === 1 ? 'v1' : 'v2'][bi]
  const sampleRate = RATES[version][si]
  const length = Math.floor(((version === 1 ? 144 : 72) * kbps * 1000) / sampleRate) + pad
  const channels = ((b[i + 3] >> 6) & 3) === 3 ? 1 : 2
  return { length, samples: version === 1 ? 1152 : 576, sampleRate, channels, version }
}

function id3Size(b: Uint8Array): number {
  if (b.length < 10 || b[0] !== 0x49 || b[1] !== 0x44 || b[2] !== 0x33) return 0 // "ID3"
  const size = ((b[6] & 0x7f) << 21) | ((b[7] & 0x7f) << 14) | ((b[8] & 0x7f) << 7) | (b[9] & 0x7f)
  return 10 + size + (b[5] & 0x10 ? 10 : 0)
}

// Is this frame the Xing/Info/VBRI header of a file rather than sound?
function isInfoFrame(b: Uint8Array, i: number, f: Frame): boolean {
  const side = f.version === 1 ? (f.channels === 1 ? 17 : 32) : (f.channels === 1 ? 9 : 17)
  const tag = (at: number) => String.fromCharCode(...b.subarray(at, at + 4))
  const xing = tag(i + 4 + side)
  return xing === 'Xing' || xing === 'Info' || tag(i + 36) === 'VBRI'
}

export function inspect(b: Uint8Array): Mp3Info {
  let i = id3Size(b)
  let end = b.length
  if (end - 128 >= i && b[end - 128] === 0x54 && b[end - 127] === 0x41 && b[end - 126] === 0x47) end -= 128 // "TAG"
  let first = frameAt(b, i)
  // Some encoders leave a few bytes before the first frame: look a little further, never far
  for (let skip = 0; !first && skip < 2048 && i < end; skip++) first = frameAt(b, ++i)
  if (!first) throw new Error('not an MP3 (no audio frame)')
  if (isInfoFrame(b, i, first)) i += first.length
  const start = i
  let frames = 0, seconds = 0
  while (i < end) {
    const f = frameAt(b, i)
    if (!f || i + f.length > end) break
    if (f.sampleRate !== first.sampleRate || f.channels !== first.channels) throw new Error('the MP3 changes its sample rate or channels')
    frames++
    seconds += f.samples / f.sampleRate
    i += f.length
  }
  if (!frames) throw new Error('an MP3 without audio frames')
  // What is left after the frames must be next to nothing (a cut-off last frame at most)
  if (end - i > 2048) throw new Error(`the MP3 has ${end - i} bytes that are not audio frames`)
  return { frames, seconds, sampleRate: first.sampleRate, channels: first.channels, version: first.version, start, end: i }
}

// The parts as one file: only their audio frames, in order. All parts must match the first one.
export function joinMp3(parts: Uint8Array[]): { bytes: Uint8Array; info: Mp3Info } {
  if (!parts.length) throw new Error('no audio')
  const infos = parts.map(inspect)
  const [a] = infos
  for (const x of infos) {
    if (x.sampleRate !== a.sampleRate || x.channels !== a.channels || x.version !== a.version) throw new Error('the audio parts differ in format and cannot be joined')
  }
  const size = infos.reduce((n, x) => n + (x.end - x.start), 0)
  const bytes = new Uint8Array(size)
  let at = 0
  parts.forEach((p, k) => { bytes.set(p.subarray(infos[k].start, infos[k].end), at); at += infos[k].end - infos[k].start })
  return {
    bytes,
    info: { ...a, frames: infos.reduce((n, x) => n + x.frames, 0), seconds: infos.reduce((n, x) => n + x.seconds, 0), start: 0, end: size },
  }
}

// Silence as real MP3 frames (MPEG-2 Layer III, 24 kHz, 32 kbps, mono: 96 bytes and 24 ms a frame), for the mock voice and
// the tests: valid frames that any player plays, with an optional ID3 tag and info frame, as an encoder writes them
export function silentMp3(seconds: number, opts: { id3?: boolean; infoFrame?: boolean } = {}): Uint8Array {
  const frame = new Uint8Array(96)
  frame.set([0xff, 0xf3, 0x44, 0xc4])
  const n = Math.max(1, Math.round(seconds / 0.024))
  const head = opts.id3 ? new Uint8Array([0x49, 0x44, 0x33, 4, 0, 0, 0, 0, 0, 20, ...new Array(20).fill(0)]) : new Uint8Array(0)
  const info = opts.infoFrame ? (() => { const f = frame.slice(); f.set([0x49, 0x6e, 0x66, 0x6f], 4 + 9); return f })() : new Uint8Array(0)
  const out = new Uint8Array(head.length + info.length + n * 96)
  out.set(head, 0)
  out.set(info, head.length)
  for (let k = 0; k < n; k++) out.set(frame, head.length + info.length + k * 96)
  return out
}
