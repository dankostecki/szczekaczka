// Installing the page as an app. Chrome and Edge (also on Android) offer it through an event that has to be caught
// early and kept until the person asks; Safari on an iPhone has no such event, only "Dodaj do ekranu początkowego".
import { useSyncExternalStore } from 'react'

interface InstallEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let offered: InstallEvent | null = null
const listeners = new Set<() => void>()
const changed = () => listeners.forEach((l) => l())

// Called once when the page starts
export function watchInstall() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault() // the browser's own bar would come at a random moment; the button is in the settings
    offered = e as InstallEvent
    changed()
  })
  window.addEventListener('appinstalled', () => { offered = null; changed() })
}

export async function promptInstall() {
  const event = offered
  if (!event) return
  offered = null
  changed()
  try { await event.prompt(); await event.userChoice } catch { /* closed without a choice */ }
}

// Already opened as an app (from the home screen or the app window), not in a browser tab
export const isInstalledApp = () =>
  typeof window !== 'undefined' &&
  (window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true)

// Whether the button can be shown now
export function useCanInstall(): boolean {
  return useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => { listeners.delete(cb) } },
    () => offered !== null,
    () => false,
  )
}
