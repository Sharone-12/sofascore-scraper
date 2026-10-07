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
 * Attacking output, scored against EVERY outfield player in the season rather
 * than within a role — the one number that is comparable across roles.
 *
 * Role scores answer "how good at your job vs your peers", which is the right
 * question for "best winger" but cannot answer "best player": a striker's 70
 * and a centre-back's 64 come from different pools. This is the honest version
 * of what people mean by best player — raw attacking production, same yardstick
 * for everyone. A centre-back will score low on it, and that is expected: it
 * measures output, not value.
 */
export const IMPACT_PROFILE: Weighted[] = [
  { key: "goals_p90", weight: 3 },
  { key: "assists_p90", weight: 3 },
  { key: "xg_p90", weight: 2 },
  { key: "xa_p90", weight: 2 },
  { key: "key_passes_p90", weight: 1.5 },
  { key: "big_chances_created_p90", weight: 1.5 },
  { key: "dribbles_p90", weight: 1.5 },
]

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
export function rankPlayers(rows: Row[], role: string): Scored[] {
  const profile = ROLE_PROFILES[role]
  if (!profile || rows.length === 0) return []
  return score(rows, profile, role)
}

/**
 * Rank every outfield player in one season against each other on attacking
 * output. Unlike rankPlayers the cohort is the whole season, which is exactly
 * what makes the result comparable across roles.
 */
export function rankImpact(rows: Row[]): Scored[] {
  if (rows.length === 0) return []
  return score(rows, IMPACT_PROFILE, "")
}

function score(rows: Row[], profile: Weighted[], role: string): Scored[] {

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
