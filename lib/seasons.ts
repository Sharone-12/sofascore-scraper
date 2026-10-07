/**
 * Seasons the site can show. Newest first — index 0 is the default everywhere:
 * leaderboards, rankings, the agent, and the player a search picks.
 *
 * The database holds both seasons in full; before this every page silently
 * pinned itself to the newest one and 25/26 was unreachable.
 */
export const SEASONS = ["2026/27", "2025/26"] as const

export type Season = (typeof SEASONS)[number]

export const DEFAULT_SEASON: Season = SEASONS[0]

/** Narrow an untrusted ?season= value, falling back to the default. */
export function resolveSeason(value?: string | string[] | null): Season {
  const v = Array.isArray(value) ? value[0] : value
  return (SEASONS as readonly string[]).includes(v ?? "")
    ? (v as Season)
    : DEFAULT_SEASON
}

/** "2026/27" -> "26/27", for tight UI like the nav toggle. */
export function shortSeason(season: string): string {
  return season.replace(/^20/, "")
}
