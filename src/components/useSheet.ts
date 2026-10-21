'use client'

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent, type RefObject } from 'react'

// How long a window takes to leave (globals.css, reader-out); it is unmounted after that
const EXIT_MS = 200
const FOCUSABLE = 'a[href], button:not(:disabled)'
// The windows open now, the last one on top (the chart window over the news it was opened from): only the top one answers Esc and keeps
// the focus, and the page behind scrolls again when the last one closes
const open: object[] = []
const onTop = (me: object) => open[open.length - 1] === me

// A window over the page (the reading window, the chart window): closed with the X, Esc, a click outside, and on a phone by pulling it down.
// While it is open the page behind does not scroll and focus stays inside; it grows out of `origin` (where it was opened from).
// `scroller`: the part that scrolls (a pull from there closes the window only when it is at its top). A window can open over another one.
export function useSheet(panel: RefObject<HTMLDivElement | null>, scroller: RefObject<HTMLDivElement | null> | null,
  origin: { x: number; y: number } | null, onClose: () => void) {
  const [closing, setClosing] = useState(false)
  const [opener] = useState(() => document.activeElement)
  const timer = useRef<number | undefined>(undefined)
  const pressedOutside = useRef(false) // a click outside counts only if it also began outside (not the end of selecting text)
  const [me] = useState(() => ({}))

  const close = useCallback(() => {
    if (timer.current !== undefined) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { onClose(); return }
    setClosing(true)
    timer.current = window.setTimeout(onClose, EXIT_MS)
  }, [onClose])
  useEffect(() => () => window.clearTimeout(timer.current), [])

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => { if (e.key === 'Escape' && onTop(me)) { e.preventDefault(); close() } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [close, me])

  // On a phone the window is pulled down to close it, as a sheet usually is: from the bar and the buttons, or from the text when it is at its top. It follows the
  // finger, leaves when it is pulled far or fast enough, and comes back otherwise. The X, Esc and a click outside stay.
  useEffect(() => {
    const el = panel.current, overlay = el?.parentElement
    if (!el || !overlay) return
    const phone = window.matchMedia('(max-width: 560px)')
    let start: { x: number; y: number; t: number; fromText: boolean } | null = null
    let dragging = false, dy = 0
    const onStart = (e: TouchEvent) => {
      const t = e.touches[0]
      start = phone.matches && e.touches.length === 1 && timer.current === undefined
        ? { x: t.clientX, y: t.clientY, t: e.timeStamp, fromText: !!scroller?.current?.contains(e.target as Node) } : null
      dragging = false; dy = 0
    }
    const onMove = (e: TouchEvent) => {
      if (!start) return
      const t = e.touches[0]
      const down = t.clientY - start.y
      if (!dragging) {
        if (down < -8 || (start.fromText && (scroller?.current?.scrollTop ?? 0) > 0)) { start = null; return } // the text scrolls
        if (down <= 0 || (Math.abs(t.clientX - start.x) > down && down < 10)) return
        dragging = true
        el.classList.add('touched')
        el.style.transition = 'none'
      }
      e.preventDefault()
      dy = Math.max(0, down)
      el.style.transform = `translateY(${dy}px)`
      overlay.style.setProperty('--drag', String(Math.min(1, dy / el.offsetHeight)))
    }
    const onEnd = (e: TouchEvent) => {
      const s = start
      start = null
      if (!s || !dragging) return
      dragging = false
      if (dy > 110 || (dy > 30 && dy / Math.max(1, e.timeStamp - s.t) > 0.5)) { close(); return } // goes on from where it is (reader-sheet-out)
      el.style.transition = 'transform 0.32s cubic-bezier(0.2, 0.9, 0.3, 1)'
      el.style.transform = ''
      overlay.style.setProperty('--drag', '0')
    }
    el.addEventListener('touchstart', onStart, { passive: true })
    el.addEventListener('touchmove', onMove, { passive: false })
    el.addEventListener('touchend', onEnd)
    el.addEventListener('touchcancel', onEnd)
    return () => {
      el.removeEventListener('touchstart', onStart)
      el.removeEventListener('touchmove', onMove)
      el.removeEventListener('touchend', onEnd)
      el.removeEventListener('touchcancel', onEnd)
    }
  }, [close, panel, scroller])

  // Focus does not leave the window (a click outside the text, a Tab from the page behind it)
  useEffect(() => {
    const back = (e: FocusEvent) => {
      if (onTop(me) && panel.current && e.target instanceof Node && !panel.current.contains(e.target)) panel.current.focus({ preventScroll: true })
    }
    document.addEventListener('focusin', back)
    return () => document.removeEventListener('focusin', back)
  }, [panel, me])

  // The page behind does not scroll (and does not jump where the scrollbar goes); focus goes in, and back to the button when it closes
  useEffect(() => {
    if (!open.length) document.body.style.setProperty('--scrollbar', `${window.innerWidth - document.documentElement.clientWidth}px`)
    document.body.classList.add('reading')
    open.push(me)
    panel.current?.focus({ preventScroll: true })
    return () => {
      open.splice(open.indexOf(me), 1)
      if (!open.length) {
        document.body.classList.remove('reading')
        document.body.style.removeProperty('--scrollbar')
      }
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus({ preventScroll: true })
    }
  }, [opener, panel, me])

  // The window grows out of where it was clicked: that point in the window's own coordinates
  useLayoutEffect(() => {
    const el = panel.current
    if (!el || !origin) return
    el.style.setProperty('--ox', `${origin.x - el.offsetLeft}px`)
    el.style.setProperty('--oy', `${origin.y - el.offsetTop}px`)
  }, [origin, panel])

  // Tab stays inside the window
  const trap = (e: KeyboardEvent) => {
    if (e.key !== 'Tab' || !panel.current) return
    const list = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)]
    if (!list.length) return
    const active = document.activeElement
    if (e.shiftKey ? active === list[0] || active === panel.current : active === list[list.length - 1]) {
      e.preventDefault()
      list[e.shiftKey ? list.length - 1 : 0].focus()
    }
  }

  // The dark area around the window
  const overlay = {
    'data-closing': closing || undefined,
    onPointerDown: (e: PointerEvent<HTMLDivElement>) => { pressedOutside.current = e.target === e.currentTarget },
    onClick: (e: MouseEvent<HTMLDivElement>) => { if (e.target === e.currentTarget && pressedOutside.current) close() },
  }
  return { close, trap, overlay }
}
