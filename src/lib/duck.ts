// The logo: a barking duck, drawn in canvas 2D. The drawing is 1000 × 1000 and scaled to `size`;
// a state says how far the beak is open, the blink, the sound waves and the "HAU!". The images in
// public (logo.png, icon.png, icon-192.png, apple-touch-icon.png) are POSE drawn at their sizes.

export interface Wave { r: number; a: number; w: number }
export interface Shout { s: number; rot: number; a: number; str: string }
export interface DuckState {
  open: number; blink: number; bob: number; t: number; tag: number
  waves: Wave[]; text: Shout | null
}

const INK = '#1D1316'
const YELLOW = '#FFC83A', YELLOW_SH = '#F0A91C'
const ORANGE = '#FF9A1F', ORANGE_DK = '#F4800F', ORANGE_HI = '#FFBD5C'
const MOUTH = '#6B1829', TONGUE = '#FF7A8C'
const COLLAR = '#5B4FE0', COLLAR_HI = '#8F87F4', TAG = '#FFD24D'

// The duck's shapes in its own frame (head upright, beak to the right); made on first use, in the browser
let shapes: Record<string, Path2D> | null = null
function getShapes() {
  if (shapes) return shapes
  const s: Record<string, Path2D> = {
    body: new Path2D('M10 1400C14 1060 70 800 220 705C246 690 256 660 250 625C190 580 170 480 190 395C205 270 300 168 415 168C510 168 585 225 612 305L618 440C600 500 575 530 570 575C568 625 610 660 665 700C770 775 850 900 860 1400Z'),
    tuftA: new Path2D('M368 200C344 134 376 80 452 76C424 100 430 134 458 186Z'),
    tuftB: new Path2D('M424 180C444 124 496 102 542 120C508 130 494 154 490 194Z'),
    wing: new Path2D('M372 868C300 812 170 826 128 918C100 984 118 1060 156 1112C250 1080 360 1000 372 868Z'),
    collar: new Path2D('M190 640C300 722 540 748 712 664L742 748C566 834 300 806 168 724Z'),
    upper: new Path2D('M612 300C690 286 792 292 868 328C906 346 914 388 880 406C800 432 712 444 618 448'),
    lower: new Path2D('M596 448C690 454 772 452 828 442C860 438 870 474 842 492C772 524 680 530 596 506'),
    lowerTop: new Path2D('M596 448C690 454 772 452 828 442'),
    tongue: new Path2D('M646 454C666 410 760 396 812 436C806 450 794 456 780 458L646 460Z'),
  }
  const closed = (p: Path2D) => { const c = new Path2D(p); c.closePath(); return c }
  s.upperFill = closed(s.upper)
  s.lowerFill = closed(s.lower)
  return (shapes = s)
}

const HINGE = { x: 612, y: 448 } // the beak's hinge
const PIVOT = { x: 380, y: 800 } // the head leans back around this point
const PLACE = { s: 0.84, x: -88, y: 76 }

function roundedSquare(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

export function drawDuck(ctx: CanvasRenderingContext2D, size: number, st: DuckState, font = 'Impact') {
  const S = getShapes()
  const open = st.open
  const ink = (w: number) => { ctx.strokeStyle = INK; ctx.lineWidth = w; ctx.lineJoin = 'round'; ctx.lineCap = 'round' }
  const fillStroke = (path: Path2D, fill: string, w: number) => { ctx.fillStyle = fill; ctx.fill(path); ink(w); ctx.stroke(path) }

  ctx.save()
  ctx.scale(size / 1000, size / 1000)
  roundedSquare(ctx, 0, 0, 1000, 1000, 230)
  ctx.clip()

  const g = ctx.createRadialGradient(320, 230, 40, 450, 450, 900)
  g.addColorStop(0, '#F26B75')
  g.addColorStop(1, '#E24753')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 1000, 1000)

  // The head leans back when it barks
  const ang = -0.05 - 0.13 * open
  const rec = { x: -14 * open, y: 5 * open }
  const PY = PLACE.y + st.bob
  const toCanvas = (x: number, y: number) => {
    const px = x - PIVOT.x, py = y - PIVOT.y, c = Math.cos(ang), s = Math.sin(ang)
    return {
      x: PLACE.x + (px * c - py * s + PIVOT.x + rec.x) * PLACE.s,
      y: PY + (px * s + py * c + PIVOT.y + rec.y) * PLACE.s,
    }
  }

  ctx.save()
  ctx.translate(PLACE.x, PY)
  ctx.scale(PLACE.s, PLACE.s)
  ctx.translate(rec.x, rec.y)
  ctx.translate(PIVOT.x, PIVOT.y)
  ctx.rotate(ang)
  ctx.translate(-PIVOT.x, -PIVOT.y)

  const lowerAng = 0.03 + 0.56 * open
  const upperAng = -0.09 * open
  const around = (a: number) => { ctx.translate(HINGE.x, HINGE.y); ctx.rotate(a); ctx.translate(-HINGE.x, -HINGE.y) }

  // The lower beak is behind the head: its start hides under the cheek
  ctx.save()
  around(lowerAng)
  fillStroke(S.lowerFill, ORANGE_DK, 14)
  ctx.restore()

  // Tufts on top of the head, they flick up with a bark
  ctx.save()
  ctx.translate(420, 190)
  ctx.rotate(-0.14 * open + Math.sin(st.t * 2.6) * 0.025)
  ctx.translate(-420, -190)
  fillStroke(S.tuftA, YELLOW, 14)
  fillStroke(S.tuftB, YELLOW, 14)
  ctx.restore()

  // Head, neck and chest in one shape
  ctx.fillStyle = YELLOW
  ctx.fill(S.body)
  ctx.save()
  ctx.clip(S.body)

  fillStroke(S.wing, YELLOW_SH, 12)
  ink(9)
  ctx.beginPath()
  ctx.moveTo(236, 856); ctx.bezierCurveTo(262, 930, 240, 1020, 176, 1084)
  ctx.moveTo(306, 886); ctx.bezierCurveTo(326, 956, 296, 1030, 236, 1090)
  ctx.stroke()

  const shade = ctx.createLinearGradient(0, 540, 0, 720)
  shade.addColorStop(0, 'rgba(200,120,0,0)')
  shade.addColorStop(1, 'rgba(200,120,0,.38)')
  ctx.fillStyle = shade
  ctx.fillRect(100, 540, 700, 180)

  fillStroke(S.collar, COLLAR, 12)
  ctx.strokeStyle = COLLAR_HI; ctx.lineWidth = 9; ctx.lineCap = 'round'
  ctx.beginPath(); ctx.moveTo(222, 686); ctx.bezierCurveTo(320, 752, 540, 774, 702, 704); ctx.stroke()

  ctx.strokeStyle = 'rgba(255,244,176,.95)'; ctx.lineWidth = 18; ctx.lineCap = 'round'
  ctx.beginPath(); ctx.arc(405, 372, 170, Math.PI * 1.08, Math.PI * 1.36); ctx.stroke()
  ctx.strokeStyle = 'rgba(200,120,0,.28)'; ctx.lineWidth = 26
  ctx.beginPath(); ctx.arc(405, 372, 186, -0.05 * Math.PI, 0.42 * Math.PI); ctx.stroke()
  ctx.restore()

  ink(16)
  ctx.stroke(S.body)

  // Cheek
  ctx.fillStyle = 'rgba(255,100,118,.55)'
  ctx.beginPath(); ctx.ellipse(466, 442, 40, 30, 0, 0, Math.PI * 2); ctx.fill()

  // Inside of the open beak, the tongue and the edge of the lower beak
  if (open > 0.02) {
    ctx.save()
    ctx.beginPath()
    ctx.save(); around(upperAng)
    ctx.moveTo(618, 448); ctx.bezierCurveTo(712, 444, 800, 432, 880, 406)
    ctx.restore()
    ctx.save(); around(lowerAng)
    ctx.lineTo(828, 442); ctx.bezierCurveTo(772, 452, 690, 454, 596, 448)
    ctx.restore()
    ctx.closePath()
    ctx.fillStyle = MOUTH
    ctx.fill()
    ctx.restore()

    ctx.save()
    around(lowerAng)
    fillStroke(S.tongue, TONGUE, 8)
    ctx.strokeStyle = '#E0566C'; ctx.lineWidth = 6; ctx.lineCap = 'round'
    ctx.beginPath(); ctx.moveTo(672, 438); ctx.bezierCurveTo(710, 422, 756, 422, 790, 440); ctx.stroke()
    ink(14)
    ctx.stroke(S.lowerTop)
    ctx.restore()
  }

  // Upper beak
  ctx.save()
  around(upperAng)
  ctx.fillStyle = ORANGE; ctx.fill(S.upperFill)
  ink(14); ctx.stroke(S.upper)
  ctx.strokeStyle = ORANGE_HI; ctx.lineWidth = 14; ctx.lineCap = 'round'
  ctx.beginPath(); ctx.moveTo(654, 318); ctx.bezierCurveTo(720, 308, 800, 314, 852, 340); ctx.stroke()
  ctx.fillStyle = INK
  ctx.beginPath(); ctx.ellipse(742, 340, 16, 9, 0.22, 0, Math.PI * 2); ctx.fill()
  ctx.restore()

  // Corner of the beak
  ink(10)
  ctx.beginPath(); ctx.moveTo(606, 452); ctx.bezierCurveTo(584, 454, 566, 446, 556, 430); ctx.stroke()

  // Eye: narrows when it barks, and blinks
  const sy = Math.max(0.1, (1 - 0.5 * open) * (1 - st.blink))
  ctx.save()
  ctx.translate(498, 322)
  if (sy < 0.2) {
    ink(14)
    ctx.beginPath(); ctx.moveTo(-44, 0); ctx.quadraticCurveTo(0, 20, 44, 0); ctx.stroke()
  } else {
    ctx.scale(1, sy)
    ctx.fillStyle = '#FFFFFF'
    ctx.beginPath(); ctx.arc(0, 0, 50, 0, Math.PI * 2); ctx.fill()
    ink(12); ctx.stroke()
    ctx.fillStyle = INK
    ctx.beginPath(); ctx.arc(12, 4, 26, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = '#FFFFFF'
    ctx.beginPath(); ctx.arc(4, -7, 8, 0, Math.PI * 2); ctx.fill()
  }
  ctx.restore()

  // Brow: from friendly to fierce
  const lerp = (a: number, b: number, k: number) => a + (b - a) * k
  ink(20)
  ctx.beginPath()
  ctx.moveTo(lerp(440, 432, open), lerp(262, 246, open))
  ctx.lineTo(lerp(552, 560, open), lerp(256, 292, open))
  ctx.stroke()

  // Tag on the collar, with a dollar sign
  ctx.save()
  ctx.translate(560, 798)
  ctx.rotate(st.tag)
  ink(8)
  ctx.beginPath(); ctx.arc(0, 8, 9, 0, Math.PI * 2); ctx.stroke()
  ctx.fillStyle = TAG
  ctx.beginPath(); ctx.arc(0, 52, 40, 0, Math.PI * 2); ctx.fill()
  ink(10); ctx.stroke()
  ctx.translate(0, 52)
  ctx.scale(1.15, 1.15)
  ink(7.5)
  ctx.beginPath()
  ctx.moveTo(11, -9)
  ctx.bezierCurveTo(11, -15, -12, -16, -12, -8)
  ctx.bezierCurveTo(-12, 0, 12, -1, 12, 8)
  ctx.bezierCurveTo(12, 17, -11, 16, -11, 9)
  ctx.moveTo(0, -19); ctx.lineTo(0, 19)
  ctx.stroke()
  ctx.restore()

  ctx.restore() // the duck's frame

  // Sound waves out of the beak
  const m = toCanvas(842 + 20 * open, 436 + 40 * open)
  const dir = ang + 0.12 * open
  ctx.lineCap = 'round'
  for (const w of st.waves) {
    const a = Math.max(0, Math.min(1, w.a))
    ctx.globalAlpha = a * 0.9
    ctx.strokeStyle = INK; ctx.lineWidth = w.w + 14
    ctx.beginPath(); ctx.arc(m.x, m.y, w.r, dir - 0.5, dir + 0.5); ctx.stroke()
    ctx.globalAlpha = a
    ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = w.w
    ctx.beginPath(); ctx.arc(m.x, m.y, w.r, dir - 0.5, dir + 0.5); ctx.stroke()
  }
  ctx.globalAlpha = 1

  // "HAU!"
  if (st.text) {
    const tx = st.text
    ctx.save()
    ctx.font = `140px ${font}, Impact, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.lineJoin = 'round'
    if ('letterSpacing' in ctx) ctx.letterSpacing = '3px'
    // Always inside the frame, also before the font is in
    const fit = Math.min(1, 300 / Math.max(1, ctx.measureText(tx.str).width))
    ctx.translate(772, 142)
    ctx.rotate(tx.rot)
    ctx.scale(tx.s * fit, tx.s * fit)
    ctx.globalAlpha = Math.max(0, Math.min(1, tx.a))
    ctx.strokeStyle = INK; ctx.lineWidth = 26
    ctx.strokeText(tx.str, 6, 9)
    ctx.fillStyle = INK; ctx.fillText(tx.str, 6, 9)
    ctx.strokeText(tx.str, 0, 0)
    ctx.fillStyle = '#FFFFFF'; ctx.fillText(tx.str, 0, 0)
    ctx.restore()
  }

  ctx.restore()
}

// Mid-bark, for the still logo
export const POSE: DuckState = {
  open: 1, blink: 0, bob: 0, t: 0, tag: -0.3,
  waves: [{ r: 140, a: 1, w: 30 }, { r: 215, a: 1, w: 27 }, { r: 290, a: 0.9, w: 24 }],
  text: { s: 1, rot: -0.12, a: 1, str: 'HAU!' },
}

const easeOut = (k: number) => 1 - Math.pow(1 - k, 3)
const easeInOut = (k: number) => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2)
// How far the beak is open, `age` seconds into a bark
function barkEnvelope(age: number) {
  if (age < 0 || age > 0.5) return 0
  if (age < 0.07) return easeOut(age / 0.07)
  if (age < 0.26) return 1
  return 1 - easeInOut((age - 0.26) / 0.24)
}

// The state at `t` seconds, with barks starting at the given times
export function stateAt(t: number, barks: number[]): DuckState {
  const st: DuckState = { open: 0, blink: 0, bob: Math.sin(t * 2.1) * 3, t, tag: Math.sin(t * 3) * 0.07, waves: [], text: null }
  const phase = ((t % 3.7) + 3.7) % 3.7
  if (phase < 0.14) st.blink = Math.sin((phase / 0.14) * Math.PI)
  let newest: number | null = null
  for (const start of barks) {
    const age = t - start
    if (age < 0) continue
    st.open = Math.max(st.open, barkEnvelope(age))
    for (let i = 0; i < 3; i++) {
      const wa = age - i * 0.09
      if (wa > 0 && wa < 0.95) {
        const p = wa / 0.95
        st.waves.push({ r: 120 + 190 * easeOut(p), a: Math.pow(1 - p, 1.3), w: 30 - 14 * p })
      }
    }
    if (age < 0.9 && (newest === null || age < newest)) newest = age
  }
  if (newest !== null) {
    const a = newest
    const s = a < 0.14 ? 0.4 + 0.85 * easeOut(a / 0.14) : a < 0.28 ? 1.25 - 0.25 * easeInOut((a - 0.14) / 0.14) : 1
    st.text = {
      s,
      rot: -0.12 + 0.05 * Math.sin(a * 70) * Math.max(0, 1 - a / 0.5),
      a: a < 0.55 ? 1 : 1 - (a - 0.55) / 0.35,
      str: 'HAU!',
    }
  }
  return st
}
