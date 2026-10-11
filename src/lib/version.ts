// Whether a newer version of the page is out than the one that is open. An installed app can stay open (or be kept
// in memory by the phone) for days, so it asks the server: when the page loads, when the app comes back to the screen,
// when the network returns and every 10 minutes. What it finds is acted on in the way that costs the person least:
// coming back to the app it loads the new version at once (nothing is in use), unless the voice is reading, and
// otherwise it offers a button.
import { useCallback, useEffect, useRef, useState } from 'react'
import { BASE_PATH } from './site'

export const BUILD_ID = process.env.NEXT_PUBLIC_BUILD_ID ?? ''
const CHECK_MS = 10 * 60_000
const LOOP_KEY = 'szczekaczka:updated'
const LOOP_MS = 60_000 // a page that is loaded again for an update does not do it a second time within this

async function deployed(): Promise<string | null> {
  try {
    const res = await fetch(`${BASE_PATH}/version.json`, { cache: 'no-store' })
    return res.ok ? ((await res.json()).id ?? null) : null
  } catch {
    return null
  }
}

export function useNewVersion(busy: boolean) {
  const [newer, setNewer] = useState(false)
  const busyNow = useRef(busy)
  useEffect(() => { busyNow.current = busy }, [busy])

  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !BUILD_ID) return
    document.documentElement.dataset.build = BUILD_ID
    const check = async (resumed: boolean) => {
      const id = await deployed()
      if (!id || id === BUILD_ID) return
      let recent = false
      try { recent = Date.now() - Number(sessionStorage.getItem(LOOP_KEY) ?? 0) < LOOP_MS } catch {}
      if (resumed && !busyNow.current && !recent) {
        try { sessionStorage.setItem(LOOP_KEY, String(Date.now())) } catch {}
        location.reload()
      } else setNewer(true)
    }
    const onVisible = () => { if (document.visibilityState === 'visible') void check(true) }
    const onOnline = () => void check(false)
    const timer = setInterval(() => { if (document.visibilityState === 'visible') void check(false) }, CHECK_MS)
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('online', onOnline)
    void check(false)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('online', onOnline)
    }
  }, [])

  const reload = useCallback(() => location.reload(), [])
  return { newer, reload }
}
