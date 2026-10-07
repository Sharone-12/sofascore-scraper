import { percentileRank } from "@/lib/stats"

/**
 * Deterministic player ranking.
 *
 * The LLM never computes or recalls numbers — it only explains what this file
 * returns. Rankings therefore stay reproducible and can't be hallucinated.
 */

export type Weighted = { key: string; weight: number; invert?: boolean }

/**
 * What actually matters per role. Weights are relative within a profile;
 * `invert` marks a stat where less is better (being dispossessed, missing big
 * chances), scored as 100 - percentile.
 *
 * These are roles, not Sofascore's three broad buckets — those filed wingers
 * under midfield and holding mids under defence, so a winger was being judged
 * on central-midfield passing and a DM on clearances. Roles come from
 * /characteristics via ROLE_MAP in data_loader.py; keep the keys in sync.
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
 * Every player scored inside their own role, then ranked against each other.
 *
 * This is what answers "best player". Ranking everyone in one pool does not
 * work: roughly half an outfield cohort are defenders with no attacking output,
 * so one goal already beats most of the field and a quiet winger drifts up the
 * table. Scoring within role asks "how far above your own peers are you", which
 * is comparable across roles and is what people mean by best.
 *
 * One `k` for every role, from the whole cohort, so a role that happens to be
 * short of minutes isn't trusted more than the rest.
 */
export function rankAllRoles(rows: Row[]): Scored[] {
  if (rows.length === 0) return []
  const k = confidenceK(rows)
  return Object.keys(ROLE_PROFILES)
    .flatMap((role) =>
      rankPlayers(rows.filter((r) => String(r.role ?? "") === role), role, k),
    )
    .sort((a, b) => b.score - a.score)
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
