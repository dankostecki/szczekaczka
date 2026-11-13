'use client'

import { useEffect, useState } from 'react'

// The bar at the top on a phone or a tablet, as in X or the other news apps: it slides away when the list is scrolled down (more room for
// the news) and comes back at once when it is scrolled up, near the top of the page, or when something in it gets the focus. On a computer
// (a mouse, a wide screen) it stays. Small moves do not count: a jitter of the finger neither hides nor shows it
const TOUCH = '(max-width: 1024px), (hover: none) and (pointer: coarse)'
const STEP = 10   // px of scrolling in one direction before the bar moves
const NEAR_TOP = 120

export function useHideOnScroll(enabled: boolean): boolean {
  const [hidden, setHidden] = useState(false)
  useEffect(() => {
    if (!enabled) { setHidden(false); return }
    const mq = window.matchMedia(TOUCH)
    let last = Math.max(0, window.scrollY), frame = 0
    const update = () => {
      frame = 0
      const y = Math.max(0, window.scrollY) // iOS pulls past the top
      if (!mq.matches || y < NEAR_TOP || document.body.classList.contains('reading')) { setHidden(false); last = y; return }
      if (y - last > STEP) { setHidden(true); last = y }
      else if (last - y > STEP) { setHidden(false); last = y }
    }
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(update) }
    // the keyboard on the bar (the search, a tab): it is shown
    const onFocus = (e: FocusEvent) => { if ((e.target as Element | null)?.closest?.('header.top')) setHidden(false) }
    window.addEventListener('scroll', onScroll, { passive: true })
    document.addEventListener('focusin', onFocus)
    mq.addEventListener('change', update)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('scroll', onScroll)
      document.removeEventListener('focusin', onFocus)
      mq.removeEventListener('change', update)
    }
  }, [enabled])
  return hidden && enabled
}
