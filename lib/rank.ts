import { percentileRank } from "@/lib/stats"

/**
 * Deterministic player ranking.
 *
 * The LLM never computes or recalls numbers — it only explains what this file
 * returns. Rankings therefore stay reproducible and can't be hallucinated.
 */

export type Weighted = { key: string; weight: number; invert?: boolean }

/**
 * What actually matters per position. Weights are relative within a profile;
 * `invert` marks a stat where less is better (being dispossessed, missing big
 * chances), scored as 100 - percentile.
 */
export const POSITION_PROFILES: Record<string, Weighted[]> = {
  Forward: [
    { key: "goals_p90", weight: 3 },
    { key: "xg_p90", weight: 2 },
    { key: "shots_on_target_p90", weight: 1.5 },
    { key: "assists_p90", weight: 1 },
    { key: "xa_p90", weight: 1 },
    { key: "dribbles_p90", weight: 1 },
    { key: "big_chances_missed_p90", weight: 1, invert: true },
  ],
  Midfielder: [
    { key: "key_passes_p90", weight: 2 },
    { key: "xa_p90", weight: 2 },
    { key: "assists_p90", weight: 1.5 },
    { key: "final_third_passes_p90", weight: 1.5 },
    { key: "passes_p90", weight: 1 },
    { key: "dribbles_p90", weight: 1 },
    { key: "goals_p90", weight: 1 },
    { key: "tackles_won_p90", weight: 1 },
    { key: "interceptions_p90", weight: 1 },
    { key: "recoveries_p90", weight: 1 },
    { key: "dispossessed_p90", weight: 0.5, invert: true },
  ],
  Defender: [
    { key: "tackles_won_p90", weight: 2 },
    { key: "interceptions_p90", weight: 2 },
    { key: "aerials_won_p90", weight: 1.5 },
    { key: "clearances_p90", weight: 1.5 },
    { key: "recoveries_p90", weight: 1.5 },
    { key: "blocked_shots_p90", weight: 1 },
    { key: "passes_p90", weight: 1 },
    { key: "long_balls_p90", weight: 0.5 },
  ],
}

/** Minutes at which a rate is trusted halfway. 450 = five full matches. */
export const CONFIDENCE_K = 450

/**
 * How much of a player's percentile score to believe, from their sample size.
 * Rises smoothly from 0, so there's no cutoff cliff — a 95-minute cameo gets
 * pulled toward the cohort average rather than excluded outright.
 */
export function confidence(minutes: number): number {
  const m = Math.max(0, minutes)
  return m / (m + CONFIDENCE_K)
}

export type Row = Record<string, unknown>

export type Scored = {
  player: string
  slug: string
  team: string
  league: string
  position: string
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
 * season's worth of one position — mixing seasons would rank a player against
 * their own past self.
 */
export function rankPlayers(rows: Row[], position: string): Scored[] {
  const profile = POSITION_PROFILES[position]
  if (!profile || rows.length === 0) return []

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
      const c = confidence(minutes)
      return {
        player: String(r.player ?? ""),
        slug: String(r.slug ?? ""),
        team: String(r.team ?? ""),
        league: String(r.league ?? ""),
        position,
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
