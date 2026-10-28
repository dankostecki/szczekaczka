// The morning briefing as the page gets it from the Worker (/api/briefing…). Only what a listener needs: no prompts, no models,
// no errors of the services, no costs. The Worker (worker/briefing) writes these; the page (components/Briefing.tsx) reads them.

export interface BriefingSource {
  title: string
  publisher: string
  url: string               // https only
  publishedAt: string | null // as the page itself states it (not when it was read)
  modifiedAt: string | null
}

export interface BriefingStory {
  id: string
  headline: string
  text: string               // what the voice reads for this story
  sources: BriefingSource[]
}

export interface PublicEdition {
  id: string                 // the Polish date, "2026-10-28"
  window: { from: string; to: string } // the requested window (ISO)
  cutoff: string             // news published up to this moment are in it
  generatedAt: string
  publishedAt: string | null
  late: boolean              // published after the planned time
  audio: { url: string; seconds: number; bytes: number } // url: relative to the API's address
  intro: string
  outro: string
  stories: BriefingStory[]
  test: boolean              // made with the mock services (local tests): not a real edition
}

export interface BriefingListItem { id: string; publishedAt: string; seconds: number; stories: number; test: boolean }

// What the page says about today's edition
export type TodayState =
  | 'none'       // no edition today (a day without one)
  | 'scheduled'  // its time has not come yet
  | 'preparing'  // under way, or ready and waiting for its time
  | 'delayed'    // past its time and not out yet
  | 'failed'     // it will not come out today
  | 'published'

export interface BriefingIndex {
  today: { id: string; state: TodayState; publishAt: string }
  schedule: { days: number[]; seconds: number } // ISO weekdays with an edition, its planned length
  editions: BriefingListItem[] // newest first
}

// In the news list's snapshot (/api/news): the latest edition, so that the page can show the way to it without asking
export interface BriefingPointer { id: string; publishedAt: string }

export const isEditionId = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s)
