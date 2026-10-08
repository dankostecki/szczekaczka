// The list "live": one GET /api/news for everything, then a WebSocket (/ws) over which the
// server sends only what changed. No polling: one connection per page instead of a request
// every minute, which is what lets the free Cloudflare plan carry many users.
import { finalizeItems, type NewsItem } from './parse'
import { HEARTBEAT, type Delta, type Hello, type Snapshot } from './protocol'
import { FEEDS, feedKey } from './sources'
import { withTime, type Item, type FeedError } from './news'
import { API_ORIGIN } from './site'

export type LiveStatus = 'connecting' | 'live'

export interface LiveHandlers {
  onData: (items: Item[], errors: FeedError[]) => void
  onStatus: (status: LiveStatus) => void
  onError: (message: string) => void
}

const RETRY_MS = [1, 2, 5, 10, 30, 60].map((s) => s * 1000)
const SILENCE_MS = 130_000          // not even a heartbeat (every ~50 s) for this long: the connection is dead
const FALLBACK_POLL_MS = 3 * 60_000 // while the WebSocket is down, fetch the list this often
// The Worker: this address, or the Cloudflare one for the GitHub Pages copy
const newsUrl = `${API_ORIGIN}/api/news`
const socketUrl = () => API_ORIGIN
  ? `${API_ORIGIN.replace(/^http/, 'ws')}/ws`
  : `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`
const feedName = new Map(FEEDS.map((f) => [feedKey(f.source, f.label), `${f.source} · ${f.label}`]))

export function connectLive(h: LiveHandlers) {
  let ws: WebSocket | null = null
  let feeds = new Map<string, { items: NewsItem[]; error: string | null }>()
  let v = -1                 // version of what we have; -1 before the first snapshot
  let buffered: Delta[] = [] // changes that arrived while a snapshot was on its way
  let syncing: Promise<void> | null = null
  let attempt = 0, lastMessage = 0, stopped = false
  let retryTimer: ReturnType<typeof setTimeout> | undefined
  let pollTimer: ReturnType<typeof setInterval> | undefined

  function emit() {
    const items = finalizeItems([...feeds.values()].flatMap((f) => f.items)).map(withTime)
    const errors: FeedError[] = [...feeds.entries()]
      .filter(([, f]) => f.error)
      .map(([key, f]) => ({ feed: feedName.get(key) ?? key, message: f.error! }))
    h.onData(items, errors)
  }

  function apply(d: Delta) {
    const old = feeds.get(d.key)?.items ?? []
    const drop = new Set([...d.remove, ...d.add.map((i) => i.id)]) // "add" also carries corrected items
    feeds.set(d.key, { items: old.filter((i) => !drop.has(i.id)).concat(d.add), error: d.error })
    v = d.v
  }

  // The whole list (start, reconnect, a missed change, the refresh button)
  function sync(): Promise<void> {
    syncing ??= (async () => {
      try {
        const res = await fetch(newsUrl, { cache: 'no-cache' })
        if (!res.ok) throw new Error(`Serwer odpowiedział ${res.status}`)
        const snap: Snapshot = await res.json()
        feeds = new Map(snap.feeds.map((f) => [f.key, { items: f.items, error: f.error }]))
        v = snap.v
        for (const d of buffered.filter((d) => d.v > v).sort((a, b) => a.v - b.v)) {
          if (d.v !== v + 1) break // a gap: the next change will ask for the whole list again
          apply(d)
        }
        buffered = []
        emit()
      } catch (e) {
        h.onError(e instanceof Error ? e.message : 'Brak połączenia z serwerem')
      } finally {
        syncing = null
      }
    })()
    return syncing
  }

  // The server's version when the socket opened: fetch the list only if we are behind.
  // While a fetch is on its way, check again once it is done (it may predate the socket).
  async function onHello(hello: Hello) {
    if (syncing) await syncing
    if (v < hello.v) void sync()
  }

  function onDelta(d: Delta) {
    if (syncing || v < 0) { buffered.push(d); return }
    if (d.v <= v) return
    if (d.v !== v + 1) { void sync(); return } // missed a change
    apply(d)
    emit()
  }

  function open() {
    if (stopped || ws) return
    h.onStatus('connecting')
    try {
      ws = new WebSocket(socketUrl())
    } catch {
      ws = null; retry(); return
    }
    ws.onopen = () => {
      attempt = 0
      lastMessage = Date.now()
      clearInterval(pollTimer); pollTimer = undefined
      h.onStatus('live')
    }
    ws.onmessage = (e) => {
      lastMessage = Date.now()
      if (e.data === HEARTBEAT) return
      try {
        const msg = JSON.parse(e.data as string)
        if (msg?.t === 'd') onDelta(msg as Delta)
        else if (msg?.t === 'v') void onHello(msg as Hello)
      } catch { /* not ours */ }
    }
    ws.onclose = () => {
      ws = null
      if (stopped) return
      h.onStatus('connecting')
      pollTimer ??= setInterval(() => void sync(), FALLBACK_POLL_MS)
      retry()
    }
  }

  function retry() {
    clearTimeout(retryTimer)
    retryTimer = setTimeout(open, RETRY_MS[Math.min(attempt++, RETRY_MS.length - 1)])
  }

  function reconnectNow() {
    if (stopped || ws) return
    attempt = 0
    clearTimeout(retryTimer)
    open()
  }

  // A connection that went silent (laptop slept, network changed) is closed and opened again
  const watchdog = setInterval(() => {
    if (ws && ws.readyState === WebSocket.OPEN && Date.now() - lastMessage > SILENCE_MS) ws.close()
  }, 30_000)
  const onVisible = () => { if (document.visibilityState === 'visible') reconnectNow() }
  document.addEventListener('visibilitychange', onVisible)
  window.addEventListener('online', reconnectNow)

  void sync()
  open()

  return {
    resync: sync,
    close() {
      stopped = true
      clearTimeout(retryTimer); clearInterval(pollTimer); clearInterval(watchdog)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('online', reconnectNow)
      ws?.close()
    },
  }
}
