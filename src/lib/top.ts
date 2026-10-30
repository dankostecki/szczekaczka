// The "Top" tab: the most important news of the last hours, by the rating of a model of Workers AI (NewsItem.ai, worker/rate.ts). The same
// news from several channels is one story (lib/stories.ts, as in the morning briefing), under its best rated headline. The order is always the
// rating's, the most important first: of two rated the same, the one that more sources report, then the newer. (A bonus for the sources once
// put a news of a lower step above one of a higher, against what the colours show.) Worked out here, from the list the page already has: no
// request of its own, and it works without the network.
import { groupStories } from './stories'
import { langOf, type Lang } from './sources'
import { originalOf, type Item } from './news'

export const TOP_HOURS = [4, 8, 12, 24] as const
export type TopHours = (typeof TOP_HOURS)[number]
export const DEFAULT_TOP_HOURS: TopHours = 12
export const TOP_FIRST = 10 // shown at first; "Pokaż więcej" shows up to TOP_MORE
export const TOP_MORE = 25

export interface TopStory {
  item: Item        // the best rated headline of the story, as the page shows it
  others: Item[]    // the story's other headlines, best rated first
  sources: string[] // its sources, the item's first
  ai: number        // the item's rating, 0 to 10: what the order goes by
}

// `items`: the news as the page shows them (in the language chosen, without the channels switched off or the other sources); `langs`: the
// languages of the channels the server rates (a channel in another one has old ratings at most, from before it was switched off)
export function topStories(items: Item[], hours: number, now: number, langs: readonly Lang[]): TopStory[] {
  const from = now - hours * 3600_000
  const rated = items.filter((i) => typeof i.ai === 'number' && i.time >= from && i.time <= now + 5 * 60_000 && langs.includes(langOf(i.source, i.label)))
  // put together by their text as published (and the translation), whatever language they are shown in
  const groups = groupStories(rated.map((it) => ({ it, title: originalOf(it).title, translation: it.pl?.title, link: it.link, time: it.time })))
  return groups
    .map((g) => {
      const news = g.map((k) => k.it.it).sort((a, b) => b.ai! - a.ai! || b.time - a.time)
      const [item, ...others] = news
      const sources = [...new Set(news.map((n) => n.source))]
      return { item, others, sources, ai: item.ai! }
    })
    .sort((a, b) => b.ai - a.ai || b.sources.length - a.sources.length || b.item.time - a.item.time)
}

// What the page shows of a rating (0 to 10): one of four steps, by colour, from a quiet news (green) to a very important one (red). The number
// itself is not shown: the steps say at a glance what a decimal would not
export const IMPORTANCE = [
  { name: 'spokojna', from: 0 },
  { name: 'umiarkowana', from: 4 },
  { name: 'ważna', from: 6 },
  { name: 'bardzo ważna', from: 8 },
] as const
export type ImportanceLevel = 1 | 2 | 3 | 4
export const importanceLevel = (ai: number): ImportanceLevel => (ai >= 8 ? 4 : ai >= 6 ? 3 : ai >= 4 ? 2 : 1)

export const isTopHours = (n: unknown): n is TopHours => TOP_HOURS.includes(n as TopHours)
