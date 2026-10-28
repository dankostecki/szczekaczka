// The briefing's store in the Durable Object's SQLite (store.ts has the interface). Synchronous calls: a read and the
// write after it are not interleaved with anything else in the object.
import type { Store, UsageRow } from './store'

export function sqliteStore(sql: SqlStorage): Store {
  sql.exec('CREATE TABLE IF NOT EXISTS editions (id TEXT PRIMARY KEY, data TEXT NOT NULL)')
  sql.exec('CREATE TABLE IF NOT EXISTS steps (edition TEXT NOT NULL, key TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY (edition, key))')
  sql.exec('CREATE TABLE IF NOT EXISTS audio (edition TEXT NOT NULL, kind TEXT NOT NULL, part INTEGER NOT NULL, bytes BLOB NOT NULL, PRIMARY KEY (edition, kind, part))')
  sql.exec(`CREATE TABLE IF NOT EXISTS usage (id INTEGER PRIMARY KEY AUTOINCREMENT, edition TEXT NOT NULL, at INTEGER NOT NULL, provider TEXT NOT NULL,
    stage TEXT NOT NULL, model TEXT NOT NULL, input_tokens INTEGER, cached_tokens INTEGER, output_tokens INTEGER, reasoning_tokens INTEGER,
    web_searches INTEGER, characters INTEGER, cost_usd REAL NOT NULL, request_id TEXT, ok INTEGER NOT NULL)`)
  sql.exec('CREATE INDEX IF NOT EXISTS usage_at ON usage (at)')
  sql.exec('CREATE TABLE IF NOT EXISTS pack (slot TEXT PRIMARY KEY, data TEXT NOT NULL)')
  const one = <T>(cursor: SqlStorageCursor<Record<string, SqlStorageValue>>) => cursor.toArray()[0] as T | undefined
  return {
    getEdition: (id) => { const r = one<{ data: string }>(sql.exec('SELECT data FROM editions WHERE id = ?', id)); return r ? JSON.parse(r.data) : null },
    putEdition: (e) => { sql.exec('INSERT OR REPLACE INTO editions (id, data) VALUES (?, ?)', e.id, JSON.stringify(e)) },
    listEditions: (limit) => sql.exec<{ data: string }>('SELECT data FROM editions ORDER BY id DESC LIMIT ?', limit).toArray().map((r) => JSON.parse(r.data)),
    deleteEdition: (id) => {
      sql.exec('DELETE FROM editions WHERE id = ?', id)
      sql.exec('DELETE FROM steps WHERE edition = ?', id)
      sql.exec('DELETE FROM audio WHERE edition = ?', id)
    },
    getStep: (e, k) => { const r = one<{ data: string }>(sql.exec('SELECT data FROM steps WHERE edition = ? AND key = ?', e, k)); return r ? JSON.parse(r.data) : null },
    putStep: (e, k, r) => { sql.exec('INSERT OR REPLACE INTO steps (edition, key, data) VALUES (?, ?, ?)', e, k, JSON.stringify(r)) },
    steps: (e) => sql.exec<{ key: string; data: string }>('SELECT key, data FROM steps WHERE edition = ?', e).toArray().map((r) => [r.key, JSON.parse(r.data)]),
    deleteSteps: (e) => { sql.exec('DELETE FROM steps WHERE edition = ?', e) },
    putAudio: (e, kind, p, b) => { sql.exec('INSERT OR REPLACE INTO audio (edition, kind, part, bytes) VALUES (?, ?, ?, ?)', e, kind, p, b) },
    getAudio: (e, kind, p) => {
      const r = one<{ bytes: ArrayBuffer }>(sql.exec('SELECT bytes FROM audio WHERE edition = ? AND kind = ? AND part = ?', e, kind, p))
      return r ? new Uint8Array(r.bytes) : null
    },
    audioParts: (e, kind) => one<{ n: number }>(sql.exec('SELECT COUNT(*) AS n FROM audio WHERE edition = ? AND kind = ?', e, kind))?.n ?? 0,
    deleteAudio: (e, kind) => { if (kind) sql.exec('DELETE FROM audio WHERE edition = ? AND kind = ?', e, kind); else sql.exec('DELETE FROM audio WHERE edition = ?', e) },
    addUsage: (u) => {
      sql.exec(`INSERT INTO usage (edition, at, provider, stage, model, input_tokens, cached_tokens, output_tokens, reasoning_tokens, web_searches, characters,
        cost_usd, request_id, ok) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, u.edition, u.at, u.provider, u.stage, u.model, u.inputTokens, u.cachedTokens,
        u.outputTokens, u.reasoningTokens, u.webSearches, u.characters, u.costUsd, u.requestId, u.ok ? 1 : 0)
    },
    usage: (e) => sql.exec<Record<string, SqlStorageValue>>('SELECT * FROM usage WHERE edition = ? ORDER BY id', e).toArray().map((r) => ({
      edition: String(r.edition), at: Number(r.at), provider: r.provider as UsageRow['provider'], stage: String(r.stage), model: String(r.model),
      inputTokens: Number(r.input_tokens), cachedTokens: Number(r.cached_tokens), outputTokens: Number(r.output_tokens), reasoningTokens: Number(r.reasoning_tokens),
      webSearches: Number(r.web_searches), characters: Number(r.characters), costUsd: Number(r.cost_usd), requestId: r.request_id === null ? null : String(r.request_id), ok: r.ok === 1,
    })),
    costSince: (at) => one<{ n: number | null }>(sql.exec('SELECT SUM(cost_usd) AS n FROM usage WHERE at >= ?', at))?.n ?? 0,
    ttsCharsSince: (at) => one<{ n: number | null }>(sql.exec("SELECT SUM(characters) AS n FROM usage WHERE at >= ? AND provider = 'google-tts'", at))?.n ?? 0,
    getPack: (slot) => { const r = one<{ data: string }>(sql.exec('SELECT data FROM pack WHERE slot = ?', slot)); return r ? JSON.parse(r.data) : null },
    putPack: (slot, p) => {
      if (p) sql.exec('INSERT OR REPLACE INTO pack (slot, data) VALUES (?, ?)', slot, JSON.stringify(p))
      else sql.exec('DELETE FROM pack WHERE slot = ?', slot)
    },
  }
}
