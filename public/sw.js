// Service worker. It lets the page start without a network and show the last list of news when the connection is gone,
// and it shows the notifications (Android Chrome allows them only from here). It keeps nothing but copies of what the
// page and the list already are; "Usuń wszystkie dane" in the settings removes them.
//
// - files of the page whose names carry a hash (/_next/static/): from the copy, fetched once
// - every other page, picture or file of the site, and the list of news (/api/news): from the network, and the last
//   copy when there is no network (or it is slow: 5 s)
// - /version.json (is a newer version out?) and everything else (other sites, the WebSocket, POST) is not touched
const CACHE = 'szczekaczka-v1'
const BASE = new URL(self.registration.scope).pathname // "/" on Cloudflare, "/szczekaczka/" on GitHub Pages
const SLOW_MS = 5000
const MAX_STATIC = 120 // every release brings files with new names; the oldest of those copies go first

self.addEventListener('install', () => self.skipWaiting())

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key.startsWith('szczekaczka-') && key !== CACHE) await caches.delete(key)
    await self.clients.claim()
  })())
})

const isApi = (url) => url.pathname === '/api/news'

async function remember(cache, request, response) {
  if (!response.ok || response.type === 'opaque') return
  await cache.put(request, response.clone())
  const hashed = (await cache.keys()).filter((key) => new URL(key.url).pathname.startsWith(`${BASE}_next/static/`))
  for (const key of hashed.slice(0, Math.max(0, hashed.length - MAX_STATIC))) await cache.delete(key)
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE)
  const hit = await cache.match(request, { ignoreVary: true })
  if (hit) return hit
  const response = await fetch(request)
  await remember(cache, request, response)
  return response
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE)
  // "no-cache": the browser's own copy (GitHub Pages lets pages stay in it for 10 minutes) is asked about, not trusted
  const network = fetch(request, { cache: 'no-cache' }).then(async (response) => { await remember(cache, request, response); return response })
  network.catch(() => {}) // when the copy is used instead, a late failure is of no interest
  try {
    return await Promise.race([network, new Promise((_, reject) => setTimeout(reject, SLOW_MS))])
  } catch {
    const copy = await cache.match(request, { ignoreVary: true })
      ?? (request.mode === 'navigate' ? await cache.match(BASE, { ignoreVary: true }) : undefined)
    return copy ?? network // no copy: wait for the network (offline: the browser's own error)
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.pathname.endsWith('/version.json')) return
  if (isApi(url)) return event.respondWith(networkFirst(request))
  if (url.origin !== self.location.origin || !url.pathname.startsWith(BASE)) return
  if (url.pathname.startsWith(`${BASE}_next/static/`)) return event.respondWith(cacheFirst(request))
  event.respondWith(networkFirst(request))
})

// The page, right after it has loaded for the first time, hands over what it loaded (and the list), so the very first
// start without a network works too
self.addEventListener('message', (event) => {
  if (event.data?.type !== 'precache' || !Array.isArray(event.data.urls)) return
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE)
    await Promise.all(event.data.urls.map(async (address) => {
      try {
        const url = new URL(address)
        const api = isApi(url)
        if (!api && (url.origin !== self.location.origin || !url.pathname.startsWith(BASE))) return
        if (!api && await cache.match(address, { ignoreVary: true })) return
        const hashed = url.pathname.startsWith(`${BASE}_next/static/`)
        await remember(cache, new Request(address), await fetch(address, { cache: hashed ? 'default' : 'no-cache' }))
      } catch { /* a copy that is missing is fetched the next time */ }
    }))
  })())
})

// A tap on a notification: back to the page, and the news itself when it has an address
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const link = event.notification.data?.url
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    if (windows[0]) await windows[0].focus().catch(() => {})
    try {
      if (typeof link === 'string' && /^https?:\/\//.test(link)) await self.clients.openWindow(link)
      else if (!windows[0]) await self.clients.openWindow(BASE)
    } catch { /* the browser did not allow a new window */ }
  })())
})
