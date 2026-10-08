'use client'

import { useEffect, useState } from 'react'

// Keep the screen (and the computer) awake while the page is visible, using the
// Screen Wake Lock API. The browser releases the lock by itself when the tab is
// hidden, so it is requested again whenever the page becomes visible.

export type AwakeState = 'unsupported' | 'off' | 'waiting' | 'active' | 'blocked'

interface Sentinel extends EventTarget { released: boolean; release(): Promise<void> }
interface WakeLockApi { request(type: 'screen'): Promise<Sentinel> }

export const wakeLockSupported = (): boolean =>
  typeof navigator !== 'undefined' && 'wakeLock' in navigator

// enabled: the user's switch. Returns what is actually going on:
//  active  - lock held right now
//  waiting - enabled, page hidden (will be requested when it is visible again)
//  blocked - the browser refused (power saver, low battery, policy); retried on the next visibility change
export function useWakeLock(enabled: boolean): AwakeState {
  const [state, setState] = useState<AwakeState>('off')

  useEffect(() => {
    if (!wakeLockSupported()) { setState('unsupported'); return }
    if (!enabled) { setState('off'); return }

    let sentinel: Sentinel | null = null
    let cancelled = false
    const api = (navigator as unknown as { wakeLock: WakeLockApi }).wakeLock

    const acquire = async () => {
      if (cancelled || document.visibilityState !== 'visible' || (sentinel && !sentinel.released)) return
      try {
        const s = await api.request('screen')
        if (cancelled) { s.release().catch(() => {}); return }
        sentinel = s
        setState('active')
        s.addEventListener('release', () => {
          if (sentinel === s) sentinel = null
          if (!cancelled) setState(document.visibilityState === 'visible' ? 'blocked' : 'waiting')
        })
      } catch {
        if (!cancelled) setState('blocked')
      }
    }

    const onVisibility = () => {
      if (document.visibilityState === 'visible') acquire()
      else if (!cancelled) setState('waiting')
    }

    setState('waiting')
    acquire()
    document.addEventListener('visibilitychange', onVisibility)
    // Some browsers let the lock go on focus changes without a visibility change
    window.addEventListener('focus', acquire)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('focus', acquire)
      sentinel?.release().catch(() => {})
      sentinel = null
    }
  }, [enabled])

  return state
}
