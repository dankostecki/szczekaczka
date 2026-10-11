'use client'

import { useEffect } from 'react'
import { API_ORIGIN, BASE_PATH } from '@/lib/site'
import { watchInstall } from '@/lib/install'

// Starts the service worker (public/sw.js) once the page has loaded, and the watch for "install this app"
export default function ServiceWorker() {
  useEffect(() => {
    watchInstall()
    if (!('serviceWorker' in navigator) || process.env.NODE_ENV !== 'production') return
    const start = async () => {
      try {
        await navigator.serviceWorker.register(`${BASE_PATH}/sw.js`, { scope: `${BASE_PATH}/` })
        const worker = (await navigator.serviceWorker.ready).active
        // Hand over what this page loaded and the list, for the first start without a network
        const list = new URL(`${API_ORIGIN}/api/news`, location.href).href
        const loaded = performance.getEntriesByType('resource').map((e) => e.name)
        worker?.postMessage({ type: 'precache', urls: [...new Set([location.origin + location.pathname, list, ...loaded])] })
      } catch { /* no service worker (private window, blocked): the page works as before */ }
    }
    if (document.readyState === 'complete') void start()
    else window.addEventListener('load', () => void start(), { once: true })
  }, [])
  return null
}
