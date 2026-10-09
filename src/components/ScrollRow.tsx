'use client'

import { Children, useCallback, useEffect, useRef, useState, type ReactNode } from 'react'

// A row of chips that may be wider than the screen and scrolls sideways. So that it is plain there
// is more, the side it goes on fades out and shows an arrow (a tap on it scrolls further), and the
// chosen chip is brought into view.
export default function ScrollRow({ className, outer = '', active, role, children }: {
  className: string; outer?: string; active?: string | null; role?: string; children: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [more, setMore] = useState({ left: false, right: false })
  const count = Children.count(children)

  const update = useCallback(() => {
    const el = ref.current
    if (!el) return
    const left = el.scrollLeft > 2
    const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 2
    setMore((m) => (m.left === left && m.right === right ? m : { left, right }))
  }, [])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.addEventListener('scroll', update, { passive: true })
    const resized = new ResizeObserver(update)
    resized.observe(el)
    document.fonts?.ready.then(update).catch(() => {}) // chips get wider once the font is in
    return () => { el.removeEventListener('scroll', update); resized.disconnect() }
  }, [update])
  useEffect(update, [update, count])

  // The chosen chip in view, with a bit of the next one showing
  useEffect(() => {
    const el = ref.current
    const on = el?.querySelector<HTMLElement>('.chip.on')
    if (!el || !on) return
    const pad = 40
    const from = on.offsetLeft - el.offsetLeft, to = from + on.offsetWidth
    if (from - pad < el.scrollLeft) el.scrollTo({ left: Math.max(0, from - pad), behavior: 'smooth' })
    else if (to + pad > el.scrollLeft + el.clientWidth) el.scrollTo({ left: to + pad - el.clientWidth, behavior: 'smooth' })
  }, [active])

  const scroll = (dir: 1 | -1) => ref.current?.scrollBy({ left: dir * ref.current.clientWidth * 0.7, behavior: 'smooth' })
  const arrow = (side: 'left' | 'right') => (
    <button className={`scroll-more ${side}`} tabIndex={-1} aria-hidden="true" onClick={() => scroll(side === 'left' ? -1 : 1)}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        <path d={side === 'left' ? 'm15 6-6 6 6 6' : 'm9 6 6 6-6 6'} />
      </svg>
    </button>
  )
  return (
    <div className={`scroll-row${outer ? ` ${outer}` : ''}${more.left ? ' more-left' : ''}${more.right ? ' more-right' : ''}`}>
      <div ref={ref} className={className} role={role}>{children}</div>
      {more.left && arrow('left')}
      {more.right && arrow('right')}
    </div>
  )
}
