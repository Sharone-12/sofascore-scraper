import { percentileRank } from "@/lib/stats"

/**
 * Deterministic player ranking.
 *
 * The LLM never computes or recalls numbers — it only explains what this file
 * returns. Rankings therefore stay reproducible and can't be hallucinated.
 */

export type Weighted = { key: string; weight: number; invert?: boolean }

/**
 * Attacking impact — one profile for every outfield player, used to answer
 * "best player" across roles. Measures what a player produces going forward:
 * goals, creation, carrying. Defenders naturally score lower, and the prompt
 * tells the model this is attacking production only.
 *
 * Kept separate from role profiles so a centre-back is never penalised for not
 * creating chances when the question is "best centre-back", but IS ranked on
 * output when the question is "best player".
 */
export const ATTACKING_IMPACT: Weighted[] = [
  { key: "goals_p90", weight: 3 },
  { key: "xg_p90", weight: 2 },
  { key: "assists_p90", weight: 2 },
  { key: "xa_p90", weight: 1.5 },
  { key: "key_passes_p90", weight: 1.5 },
  { key: "big_chances_created_p90", weight: 1 },
  { key: "dribbles_p90", weight: 1 },
  { key: "shots_on_target_p90", weight: 1 },
]

/**
 * What actually matters per role. Weights are relative within a profile;
 * `invert` marks a stat where less is better (being dispossessed, missing big
 * chances), scored as 100 - percentile.
 *
 * Roles come from /characteristics via ROLE_MAP in data_loader.py; keep the
 * keys in sync.
 */
export const ROLE_PROFILES: Record<string, Weighted[]> = {
  Striker: [
    { key: "goals_p90", weight: 3 },
    { key: "xg_p90", weight: 2.5 },
    { key: "shots_on_target_p90", weight: 1.5 },
    { key: "big_chances_missed_p90", weight: 1, invert: true },
    { key: "aerials_won_p90", weight: 0.5 },
    { key: "assists_p90", weight: 0.5 },
    { key: "touches_p90", weight: 0.5 },
  ],
  Winger: [
    { key: "dribbles_p90", weight: 2 },
    { key: "assists_p90", weight: 1.5 },
    { key: "xa_p90", weight: 1.5 },
    { key: "key_passes_p90", weight: 1.5 },
    { key: "goals_p90", weight: 1.5 },
    { key: "crosses_p90", weight: 1 },
    { key: "xg_p90", weight: 1 },
    { key: "dispossessed_p90", weight: 0.5, invert: true },
  ],
  "Attacking Mid": [
    { key: "key_passes_p90", weight: 2.5 },
    { key: "xa_p90", weight: 2.5 },
    { key: "big_chances_created_p90", weight: 2 },
    { key: "assists_p90", weight: 1.5 },
    { key: "final_third_passes_p90", weight: 1.5 },
    { key: "dribbles_p90", weight: 1 },
    { key: "goals_p90", weight: 1 },
  ],
  "Central Mid": [
    { key: "passes_p90", weight: 1.5 },
    { key: "final_third_passes_p90", weight: 1.5 },
    { key: "key_passes_p90", weight: 1.5 },
    { key: "recoveries_p90", weight: 1.5 },
    { key: "tackles_won_p90", weight: 1.5 },
    { key: "xa_p90", weight: 1 },
    { key: "interceptions_p90", weight: 1 },
    { key: "dribbles_p90", weight: 1 },
    { key: "dispossessed_p90", weight: 0.5, invert: true },
  ],
  "Centre-Back": [
    { key: "aerials_won_p90", weight: 2.5 },
    { key: "clearances_p90", weight: 2 },
    { key: "interceptions_p90", weight: 2 },
    { key: "blocked_shots_p90", weight: 1.5 },
    { key: "tackles_won_p90", weight: 1.5 },
    { key: "recoveries_p90", weight: 1.5 },
    { key: "passes_p90", weight: 1 },
    { key: "long_balls_p90", weight: 0.5 },
  ],
  "Full-Back": [
    { key: "tackles_won_p90", weight: 2 },
    { key: "interceptions_p90", weight: 1.5 },
    { key: "recoveries_p90", weight: 1.5 },
    { key: "crosses_p90", weight: 1.5 },
    { key: "key_passes_p90", weight: 1 },
    { key: "dribbles_p90", weight: 1 },
    { key: "final_third_passes_p90", weight: 1 },
    { key: "clearances_p90", weight: 1 },
    { key: "aerials_won_p90", weight: 0.5 },
  ],
}

/**
 * Share of the season's available minutes at which a rate is half trusted.
 *
 * This used to be a flat 450 minutes, which quietly meant something different
 * in October than in May: eight games in, the most anyone has played is ~630,
 * so even an ever-present was only 58% trusted and the whole table squashed
 * toward 50. Scaling to the season makes "half a season played" the halfway
 * point whenever you ask.
 */
export const CONFIDENCE_SHARE = 0.5

/** Half-trust point in minutes for a cohort: half of what a regular has played. */
export function confidenceK(rows: Row[]): number {
  const most = Math.max(0, ...rows.map((r) => Number(r.minutes) || 0))
  return Math.max(1, most * CONFIDENCE_SHARE)
}

/**
 * How much of a player's percentile to believe, from their sample size. Rises
 * smoothly from 0, so there's no cutoff cliff — a short cameo is pulled toward
 * the cohort average rather than excluded outright.
 */
export function confidence(minutes: number, k: number): number {
  const m = Math.max(0, minutes)
  return m / (m + k)
}

export type Row = Record<string, unknown>

export type Scored = {
  player: string
  slug: string
  team: string
  league: string
  /** The scoring role, e.g. "Winger". */
  position: string
  /** Raw Sofascore positions, e.g. "LW/RW". */
  detailedPosition: string
  season: string
  minutes: number
  /** Weighted percentile before the minutes adjustment, 0-100. */
  raw: number
  /** Shrunk toward 50 by `confidence`; this is what ranks. */
  score: number
  confidence: number
  /** Per-stat percentiles, so the model can cite specifics. */
  percentiles: Record<string, number>
}

/**
 * Score every row against its position profile.
 *
 * Percentiles are computed within the supplied cohort, so callers must pass one
 * season's worth of one role — mixing seasons would rank a player against their
 * own past self, and mixing roles would judge a winger on a striker's metrics.
 */
export function rankPlayers(rows: Row[], role: string, k?: number): Scored[] {
  const profile = ROLE_PROFILES[role]
  if (!profile || rows.length === 0) return []
  return score(rows, profile, role, k ?? confidenceK(rows))
}

/**
 * Every outfield player scored on the same attacking-impact profile.
 *
 * This is what answers "best player" and "top N". Everyone is measured on the
 * same metrics in one pool, so the scores ARE comparable across roles. The
 * trade-off is that it only captures attacking production — a dominant
 * centre-back who rarely scores will rank low, and the prompt tells the model
 * to note that.
 *
 * Role scores (from `rankPlayers`) answer "best winger" and are NOT comparable
 * across roles — different metrics, different pools.
 */
/**
 * Minimum share of available minutes to appear in the cross-role ranking.
 * "Best player" is a headline answer — it should only include players with
 * a real body of work, not a cameo with elite rates.
 */
export const IMPACT_MIN_SHARE = 0.6

export function rankAllRoles(rows: Row[]): Scored[] {
  if (rows.length === 0) return []
  const k = confidenceK(rows)
  const most = Math.max(0, ...rows.map((r) => Number(r.minutes) || 0))
  const floor = most * IMPACT_MIN_SHARE
  const outfield = rows.filter(
    (r) => String(r.role ?? "") !== "Goalkeeper" && (Number(r.minutes) || 0) >= floor,
  )
  const slugToRole = new Map(
    outfield.map((r) => [String(r.slug ?? ""), String(r.role ?? r.position ?? "")]),
  )
  return score(outfield, ATTACKING_IMPACT, "", k).map((s) => ({
    ...s,
    position: slugToRole.get(s.slug) ?? "",
  }))
}

function score(
  rows: Row[],
  profile: Weighted[],
  role: string,
  k: number,
): Scored[] {

  // Cohort values per stat, gathered once rather than per player.
  const cohort = new Map<string, number[]>()
  for (const { key } of profile) {
    cohort.set(
      key,
      rows.map((r) => Number(r[key]) || 0),
    )
  }

  const totalWeight = profile.reduce((s, w) => s + w.weight, 0)

  return rows
    .map((r) => {
      const percentiles: Record<string, number> = {}
      let acc = 0
      for (const { key, weight, invert } of profile) {
        const pct = percentileRank(Number(r[key]) || 0, cohort.get(key)!)
        const v = invert ? 100 - pct : pct
        percentiles[key] = Math.round(v)
        acc += v * weight
      }
      const raw = acc / totalWeight
      const minutes = Number(r.minutes) || 0
      const c = confidence(minutes, k)
      return {
        player: String(r.player ?? ""),
        slug: String(r.slug ?? ""),
        team: String(r.team ?? ""),
        league: String(r.league ?? ""),
        position: role || String(r.role ?? r.position ?? ""),
        detailedPosition: String(r.detailed_position ?? ""),
        season: String(r.season ?? ""),
        minutes,
        raw: Math.round(raw * 10) / 10,
        score: Math.round((50 + (raw - 50) * c) * 10) / 10,
        confidence: Math.round(c * 100) / 100,
        percentiles,
      }
    })
    .sort((a, b) => b.score - a.score)
}
