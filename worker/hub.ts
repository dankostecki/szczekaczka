// Holds the browsers' WebSocket connections and passes on what the poller sends.
// Uses the hibernation API: between messages the object is evicted from memory and costs
// nothing, while the connections stay open.
import { DurableObject } from 'cloudflare:workers'
import type { Hello } from '../src/lib/protocol'
import { type Env, poller } from './env'

export class Hub extends DurableObject<Env> {
  // Version of the list in the last message from the poller. Kept in storage too, because
  // memory is lost whenever the hub hibernates.
  private v: number | undefined

  async fetch(req: Request): Promise<Response> {
    const shard = Number(new URL(req.url).searchParams.get('shard') ?? 0)
    const { 0: client, 1: server } = new WebSocketPair()
    this.ctx.acceptWebSocket(server)
    // First browser here: the poller may have stopped sending to this hub, so what it
    // remembers may be old. The poller resumes sending and says the current version.
    if (this.ctx.getWebSockets().length === 1) {
      try { await this.remember(await poller(this.env).joined(shard)) } catch (e) { console.error('joined', e) }
    }
    server.send(JSON.stringify({ t: 'v', v: await this.version() } satisfies Hello))
    return new Response(null, { status: 101, webSocket: client })
  }

  // From the poller; returns how many browsers got it
  async publish(message: string, v: number): Promise<number> {
    await this.remember(v)
    const sockets = this.ctx.getWebSockets()
    for (const ws of sockets) {
      try { ws.send(message) } catch { /* closing */ }
    }
    return sockets.length
  }

  private async version(): Promise<number> {
    this.v ??= (await this.ctx.storage.get<number>('v')) ?? -1
    return this.v
  }

  // Written only when the list changed, not on every heartbeat
  private async remember(v: number) {
    if (v === (await this.version())) return
    this.v = v
    await this.ctx.storage.put('v', v)
  }

  // Browsers do not send anything that needs an answer
  async webSocketMessage() {}

  async webSocketClose(ws: WebSocket, code: number, reason: string) {
    try { ws.close(code === 1005 ? 1000 : code, reason) } catch { /* already closed */ }
  }

  async webSocketError(ws: WebSocket) {
    try { ws.close(1011, 'error') } catch { /* already closed */ }
  }
}
