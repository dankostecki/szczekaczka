// The "Top" tab: the most important news of the last hours, by the rating of a model of Workers AI (NewsItem.ai, worker/rate.ts). The same
// news from several channels is one story (lib/stories.ts, as in the morning briefing), under its best rated headline; a story that more sources
// report goes a little higher. Worked out here, from the list the page already has: no request of its own, and it works without the network.
import { groupStories } from './stories'
import { langOf, type Lang } from './sources'
import { originalOf, type Item } from './news'

export const TOP_HOURS = [4, 8, 12, 24] as const
export type TopHours = (typeof TOP_HOURS)[number]
export const DEFAULT_TOP_HOURS: TopHours = 12
export const TOP_FIRST = 10 // shown at first; "Pokaż więcej" shows up to TOP_MORE
export const TOP_MORE = 25
const PER_SOURCE = 0.5      // added to a story's rating for each other source that reports it…
const MAX_SOURCES = 3       // …up to this many

export interface TopStory {
  item: Item        // the best rated headline of the story, as the page shows it
  others: Item[]    // the story's other headlines, best rated first
  sources: string[] // its sources, the item's first
  ai: number        // the item's rating, 0 to 10
  score: number     // what the order goes by: the rating and the sources
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
      return { item, others, sources, ai: item.ai!, score: item.ai! + PER_SOURCE * Math.min(sources.length - 1, MAX_SOURCES) }
    })
    .sort((a, b) => b.score - a.score || b.item.time - a.item.time)
}

// "8,5" (the ratings have one decimal)
export const ratingText = (ai: number) => String(Math.round(ai * 10) / 10).replace('.', ',')

export const isTopHours = (n: unknown): n is TopHours => TOP_HOURS.includes(n as TopHours)
