// A source with a broad channel (FeedConfig.broad: investingLive's general feed has the posts of its central bank and crypto feeds too):
// a post is shown in the narrower channel only. The broad channel leaves out the links the narrower ones hold (checkFeed's `skip`),
// and when a narrower channel gets a post the broad one already shows, that one is taken out of the broad channel.
import type { FeedConfig } from '../src/lib/sources'
import { feedKey } from '../src/lib/sources'
import { bareLink, type FeedState } from './feeds'

// The bare links of the posts the narrower channels of `feed`'s source hold now (what a broad channel must not add)
export function heldLinks(feed: FeedConfig, feeds: readonly FeedConfig[], states: ReadonlyMap<string, FeedState>): Set<string> {
  const held = new Set<string>()
  if (!feed.broad) return held
  for (const f of feeds) {
    if (f.source !== feed.source || f.broad) continue
    for (const i of states.get(feedKey(f.source, f.label))?.items ?? []) if (i.link) held.add(bareLink(i.link))
  }
  return held
}

// A narrower channel has just got `added`: the posts of the source's broad channels with the same links are taken out of them (their
// states are replaced in `states`). The ids taken out, by channel: the poller saves and sends them.
export function dropDuplicates(feed: FeedConfig, feeds: readonly FeedConfig[], states: Map<string, FeedState>, added: readonly { link: string }[]): Map<string, string[]> {
  const out = new Map<string, string[]>()
  const links = new Set(added.filter((i) => i.link).map((i) => bareLink(i.link)))
  if (feed.broad || links.size === 0) return out
  for (const f of feeds) {
    if (f.source !== feed.source || !f.broad) continue
    const key = feedKey(f.source, f.label)
    const state = states.get(key)
    const ids = new Set((state?.items ?? []).filter((i) => i.link && links.has(bareLink(i.link))).map((i) => i.id))
    if (!state || ids.size === 0) continue
    states.set(key, { ...state, items: state.items.filter((i) => !ids.has(i.id)) })
    out.set(key, [...ids])
  }
  return out
}
