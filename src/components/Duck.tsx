'use client'

import { useEffect, useRef } from 'react'
import localFont from 'next/font/local'
import { drawDuck, POSE, stateAt } from '@/lib/duck'

// "HAU!" in Bangers (only these letters), © The Bangers Project Authors, SIL Open Font License 1.1
const shout = localFont({ src: '../app/fonts/bangers-hau.woff2', display: 'block', preload: false })

// The logo drawn live: with `bark` it barks twice once it is in, then every few seconds and when
// tapped; still for those who turned motion off
export default function Duck({ size, bark = false, label }: { size: number; bark?: boolean; label: string }) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const px = Math.round(size * Math.min(window.devicePixelRatio || 1, 3))
    canvas.width = px; canvas.height = px
    const font = shout.style.fontFamily
    const still = !bark || matchMedia('(prefers-reduced-motion: reduce)').matches
    const draw = (st: typeof POSE) => { ctx.clearRect(0, 0, px, px); drawDuck(ctx, px, st, font) }

    const t0 = performance.now()
    const clock = () => (performance.now() - t0) / 1000
    let barks = [0.45, 1]
    let next = 3.4
    let raf = 0
    const frame = () => {
      const now = clock()
      if (now >= next) { barks.push(next, next + 0.55); next += 2.7 }
      barks = barks.filter((b) => now - b < 3)
      draw(stateAt(now, barks))
      raf = requestAnimationFrame(frame)
    }
    if (still) draw(POSE)
    else frame()
    // The letters' font comes a moment later
    document.fonts?.load(`140px ${font}`, 'HAU!').then(() => { if (still) draw(POSE) }).catch(() => {})

    const tap = () => { if (!still) barks.push(clock()) }
    canvas.addEventListener('click', tap)
    return () => { cancelAnimationFrame(raf); canvas.removeEventListener('click', tap) }
  }, [size, bark])

  return <canvas ref={ref} className="duck" style={{ ['--size' as string]: `${size}px` }} role="img" aria-label={label} />
}
