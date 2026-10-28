// MP3 parts: read frame by frame, their tags and info frames left out, joined into one file whose length is right
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { inspect, joinMp3, silentMp3 } from '../../worker/briefing/mp3'

test('frames, duration and format of a part', () => {
  const a = silentMp3(1.2)
  const info = inspect(a)
  assert.equal(info.frames, 50)
  assert.ok(Math.abs(info.seconds - 1.2) < 1e-9)
  assert.equal(info.sampleRate, 24000)
  assert.equal(info.channels, 1)
  assert.equal(info.version, 2)
})

test('an ID3 tag and the Xing/Info frame of a part are not audio', () => {
  const plain = inspect(silentMp3(1))
  const tagged = inspect(silentMp3(1, { id3: true, infoFrame: true }))
  assert.equal(tagged.frames, plain.frames)
  assert.equal(tagged.start, 30 + 96)
  const withV1 = new Uint8Array([...silentMp3(1), ...new TextEncoder().encode('TAG'), ...new Uint8Array(125)])
  assert.equal(inspect(withV1).frames, plain.frames)
})

test('parts joined: only their frames, in order; the sum of their lengths; no tag left inside', () => {
  const parts = [silentMp3(1, { id3: true, infoFrame: true }), silentMp3(2.4, { id3: true, infoFrame: true }), silentMp3(0.6, { id3: true })]
  const { bytes, info } = joinMp3(parts)
  const each = parts.map(inspect)
  assert.equal(info.frames, each.reduce((n, x) => n + x.frames, 0))
  assert.equal(info.frames, 42 + 100 + 25) // 24 ms a frame
  assert.ok(Math.abs(info.seconds - each.reduce((n, x) => n + x.seconds, 0)) < 1e-9)
  assert.equal(bytes.length, info.frames * 96)
  assert.deepEqual(inspect(bytes).frames, info.frames, 'the joined file reads as one')
  const text = new TextDecoder('latin1').decode(bytes)
  assert.ok(!text.includes('ID3') && !text.includes('Info'))
})

test('parts of different formats are not joined; something that is not an MP3 is refused', () => {
  const stereo = silentMp3(1)
  stereo.forEach((_, i) => { if (i % 96 === 3) stereo[i] = 0x04 }) // the same frames, in stereo
  assert.equal(inspect(stereo).channels, 2)
  assert.throws(() => joinMp3([silentMp3(1), stereo]), /differ in format/)
  const mixed = new Uint8Array([...silentMp3(0.5), ...stereo])
  assert.throws(() => inspect(mixed), /changes its sample rate or channels/)
  assert.throws(() => inspect(new TextEncoder().encode('<html>error</html>'.repeat(10))), /not an MP3/)
  assert.throws(() => joinMp3([]), /no audio/)
  const broken = new Uint8Array([...silentMp3(0.5), ...new Uint8Array(5000).fill(7)])
  assert.throws(() => inspect(broken), /not audio frames/)
})
