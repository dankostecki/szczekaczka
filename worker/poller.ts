// One object for the whole site: checks the feeds one at a time and sends changes to the hubs.
// Checking one feed per call keeps each call far below the 10 ms of CPU of the free plan.
import { DurableObject } from 'cloudflare:workers'
import { FEEDS, feedKey, CHECK_SECONDS, QUIET_CHECK_SECONDS, HUBS, HEARTBEAT_SECONDS, type FeedConfig } from '../src/lib/sources'
import { marketHours } from '../src/lib/schedule'
import { HEARTBEAT, type Delta, type Snapshot } from '../src/lib/protocol'
import { checkFeed, type FeedState } from './feeds'
import { type Env, hub } from './env'

const MIN_GAP_MS = 2000 // never wake up more often than this
const RETRY_SECONDS = 60 // after a failed check: try again in 1, 2, 4… minutes (never later than usual)

export class Poller extends DurableObject<Env> {
  private feeds = new Map<string, FeedState>()
  private v = 0
  private snapshotJson: string | null = null
  private lastPublish = 0
  // Sockets per hub as last reported; hubs with none are not sent anything. Unknown after a
  // restart, so every hub gets the first message.
  private sockets: number[] = Array(HUBS).fill(1)

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    ctx.blockConcurrencyWhile(async () => {
      const sql = ctx.storage.sql
      sql.exec('CREATE TABLE IF NOT EXISTS feeds (key TEXT PRIMARY KEY, state TEXT NOT NULL)')
      sql.exec('CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v INTEGER NOT NULL)')
      const known = new Set(FEEDS.map((f) => feedKey(f.source, f.label)))
      const removed: string[] = []
      for (const row of sql.exec<{ key: string; state: string }>('SELECT key, state FROM feeds')) {
        if (known.has(row.key)) this.feeds.set(row.key, JSON.parse(row.state))
        else removed.push(row.key)
      }
      this.v = sql.exec<{ v: number }>("SELECT v FROM meta WHERE k = 'v'").toArray()[0]?.v ?? 0
      // A channel taken out of sources.ts: forget it, and move the version on so that
      // open pages fetch the list again (without its news)
      if (removed.length) {
        for (const key of removed) sql.exec('DELETE FROM feeds WHERE key = ?', key)
        this.v++
        sql.exec("INSERT OR REPLACE INTO meta (k, v) VALUES ('v', ?)", this.v)
        console.log(`removed channels: ${removed.join(', ')} (v${this.v})`)
      }
    })
  }

  // ── Called by the Worker ──
  async snapshot(): Promise<string> {
    await this.ensureAlarm()
    if (!this.snapshotJson) {
      const snap: Snapshot = {
        v: this.v,
        feeds: FEEDS.map((f) => {
          const s = this.feeds.get(feedKey(f.source, f.label))
          return { key: feedKey(f.source, f.label), items: s?.items ?? [], error: s?.error ?? null }
        }),
      }
      this.snapshotJson = JSON.stringify(snap)
    }
    return this.snapshotJson
  }

  async kick(): Promise<void> { await this.ensureAlarm() }

  // A hub got its first browser: send it the next messages again. Returns the current
  // version, which the hub passes on to the browser.
  async joined(i: number): Promise<number> {
    this.sockets[i] = Math.max(1, this.sockets[i] ?? 0)
    await this.ensureAlarm()
    return this.v
  }

  private async ensureAlarm() {
    if ((await this.ctx.storage.getAlarm()) == null) await this.ctx.storage.setAlarm(Date.now() + 500)
  }

  // ── The loop ──
  async alarm() {
    try {
      const feed = this.mostOverdue(Date.now())
      if (feed) await this.check(feed)
      if (Date.now() - this.lastPublish >= HEARTBEAT_SECONDS * 1000) await this.publish(HEARTBEAT)
    } catch (e) {
      console.error('poller tick failed', e)
    } finally {
      await this.ctx.storage.setAlarm(this.nextWake())
    }
  }

  private interval(feed: FeedConfig, now: number): number {
    const usual = (feed.minAge ?? (marketHours(new Date(now)) ? CHECK_SECONDS : QUIET_CHECK_SECONDS)) * 1000
    const failures = this.feeds.get(feedKey(feed.source, feed.label))?.failures ?? 0
    return failures ? Math.min(usual, RETRY_SECONDS * 1000 * 2 ** (failures - 1)) : usual
  }

  private dueAt(feed: FeedConfig, now: number): number {
    const s = this.feeds.get(feedKey(feed.source, feed.label))
    return s ? s.checkedAt + this.interval(feed, now) : 0
  }

  private mostOverdue(now: number): FeedConfig | undefined {
    let best: FeedConfig | undefined, bestDue = Infinity
    for (const f of FEEDS) {
      const due = this.dueAt(f, now)
      if (due <= now && due < bestDue) { best = f; bestDue = due }
    }
    return best
  }

  private nextWake(): number {
    const now = Date.now()
    let next = this.lastPublish + HEARTBEAT_SECONDS * 1000
    for (const f of FEEDS) next = Math.min(next, this.dueAt(f, now))
    return Math.max(next, now + MIN_GAP_MS)
  }

  private async check(feed: FeedConfig) {
    const key = feedKey(feed.source, feed.label)
    const url = this.env.FEED_ORIGIN ? `${this.env.FEED_ORIGIN}/${feed.url.replace(/^https?:\/\//, '')}` : feed.url
    const prev = this.feeds.get(key)
    const r = await checkFeed(feed, prev, url)
    this.feeds.set(key, r.state)
    if (r.state.failures) console.log(`feed ${key}: failed check ${r.state.failures} in a row`)
    // The count of failures must survive the object being evicted from memory, or the
    // error would never be shown; it changes only around failures, so this is rare
    const sql = this.ctx.storage.sql
    const save = () => sql.exec('INSERT OR REPLACE INTO feeds (key, state) VALUES (?, ?)', key, JSON.stringify(r.state))
    if (!r.changed) {
      if ((prev?.failures ?? 0) !== (r.state.failures ?? 0)) save()
      return
    }

    this.v++
    save()
    sql.exec("INSERT OR REPLACE INTO meta (k, v) VALUES ('v', ?)", this.v)
    this.snapshotJson = null
    const delta: Delta = { t: 'd', v: this.v, key, add: r.add, remove: r.remove, error: r.state.error }
    console.log(`feed ${key}: +${r.add.length} -${r.remove.length}${r.state.error ? ` error: ${r.state.error}` : ''} (v${this.v})`)
    await this.publish(JSON.stringify(delta))
  }

  private async publish(message: string) {
    this.lastPublish = Date.now()
    await Promise.all(this.sockets.map(async (n, i) => {
      if (n === 0) return
      try { this.sockets[i] = await hub(this.env, i).publish(message, this.v) } catch (e) { console.error(`hub ${i}`, e) }
    }))
  }
}
