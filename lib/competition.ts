import { DEFAULT_SEASON } from "@/lib/seasons"

/**
 * Which competition a stats view shows: each club's domestic league, or the
 * Champions League. Clubs and players hold a separate row per competition, so
 * a view has to pick one — mixing them ranks one round of Champions League
 * football against a whole league season.
 *
 * Carried as ?comp= like ?season=, with the default dropped from the URL.
 */
export const COMPETITIONS = ["league", "ucl"] as const

export type Competition = (typeof COMPETITIONS)[number]

export const DEFAULT_COMPETITION: Competition = "league"

export const UCL = "Champions League"

export const COMPETITION_LABEL: Record<Competition, string> = {
  league: "League",
  ucl: "UCL",
}

/** Narrow an untrusted ?comp= value, falling back to the default. */
export function resolveCompetition(value?: string | string[] | null): Competition {
  const v = Array.isArray(value) ? value[0] : value
  return (COMPETITIONS as readonly string[]).includes(v ?? "")
    ? (v as Competition)
    : DEFAULT_COMPETITION
}

export function inCompetition(league: string, comp: Competition): boolean {
  return comp === "ucl" ? league === UCL : league !== UCL
}

type Filterable = {
  eq(column: string, value: string): unknown
  neq(column: string, value: string): unknown
}

/**
 * Restrict a Supabase query on a table with a `league` column. Q is left
 * unconstrained on purpose: bounding it by the builder's own methods sends
 * TypeScript into "excessively deep" instantiation on supabase-js types.
 */
export function scopeLeague<Q>(query: Q, comp: Competition): Q {
  const q = query as unknown as Filterable
  return (comp === "ucl" ? q.eq("league", UCL) : q.neq("league", UCL)) as Q
}

/** "?…&season=…&comp=…" for links between views, defaults dropped. */
export function scopeQuery(
  season: string,
  comp: Competition,
  extra: Record<string, string> = {},
): string {
  const p = new URLSearchParams(extra)
  if (season !== DEFAULT_SEASON) p.set("season", season)
  if (comp !== DEFAULT_COMPETITION) p.set("comp", comp)
  const qs = p.toString()
  return qs ? `?${qs}` : ""
}
