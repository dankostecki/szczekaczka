'use client'

import { useEffect, type RefObject } from 'react'

// A panel over the page that is not a sheet (the settings): focus goes into it and stays there, the page behind does not scroll, Esc closes
// it, and focus goes back to the button that opened it. The reading and chart windows have their own (useSheet); the two are never open together
export function useModal(panel: RefObject<HTMLElement | null>, onClose: () => void) {
  useEffect(() => {
    const el = panel.current
    const opener = document.activeElement
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    // a Tab past the last control, or a click on the page behind: back into the panel
    const back = (e: FocusEvent) => { if (el && e.target instanceof Node && !el.contains(e.target)) el.focus({ preventScroll: true }) }
    window.addEventListener('keydown', onKey)
    document.addEventListener('focusin', back)
    document.body.style.setProperty('--scrollbar', `${window.innerWidth - document.documentElement.clientWidth}px`)
    document.body.classList.add('reading')
    el?.focus({ preventScroll: true })
    return () => {
      window.removeEventListener('keydown', onKey)
      document.removeEventListener('focusin', back)
      document.body.classList.remove('reading')
      document.body.style.removeProperty('--scrollbar')
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus({ preventScroll: true })
    }
  }, [panel, onClose])
}
