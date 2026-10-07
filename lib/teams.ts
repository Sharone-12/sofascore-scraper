export const CURRENT_SEASON = "2026/27"

/** Leagues ingested in full, so their `team_table` is a real standings table. */
export const FULL_LEAGUES = ["Premier League", "La Liga"] as const

/**
 * Clubs tracked on their own, without the rest of their league. Only these
 * teams' fixtures are ingested, so `team_table` rows for their opponents are
 * fragments (two games, not 34) — never render those leagues as a table.
 * `team` must match Sofascore exactly; see LEAGUES in data_loader.py.
 */
export const SINGLE_CLUBS = [
  { team: "Paris Saint-Germain", short: "PSG", league: "Ligue 1" },
  { team: "FC Bayern München", short: "Bayern", league: "Bundesliga" },
] as const

// `stat` values match the `stat` column in match_stats verbatim.
// pct: read the parsed percentage column instead of the raw leading number
// (e.g. "Ball possession" stores '68%', "Tackles won" stores '83%').
export type TeamStat = { stat: string; label: string; pct?: boolean }

export const TEAM_STAT_GROUPS: { label: string; stats: TeamStat[] }[] = [
  {
    label: "Attacking",
    stats: [
      { stat: "Expected goals", label: "xG" },
      { stat: "Total shots", label: "Shots" },
      { stat: "Shots on target", label: "On Target" },
      { stat: "Big chances", label: "Big Chances" },
      { stat: "Shots inside box", label: "Shots in Box" },
      { stat: "Touches in penalty area", label: "Box Touches" },
    ],
  },
  {
    label: "Possession & Build-up",
    stats: [
      { stat: "Ball possession", label: "Possession %", pct: true },
      { stat: "Accurate passes", label: "Accurate Passes" },
      { stat: "Final third entries", label: "Final Third Entries" },
      { stat: "Long balls", label: "Long Balls" },
      { stat: "Through balls", label: "Through Balls" },
      { stat: "Dribbles", label: "Dribbles" },
    ],
  },
  {
    label: "Defending",
    stats: [
      { stat: "Tackles", label: "Tackles" },
      { stat: "Tackles won", label: "Tackles Won %", pct: true },
      { stat: "Interceptions", label: "Interceptions" },
      { stat: "Clearances", label: "Clearances" },
      { stat: "Recoveries", label: "Recoveries" },
      { stat: "Blocked shots", label: "Blocked Shots" },
    ],
  },
  {
    label: "Duels & Physical",
    stats: [
      { stat: "Duels", label: "Duels" },
      { stat: "Ground duels", label: "Ground Duels" },
      { stat: "Aerial duels", label: "Aerial Duels" },
      { stat: "Distance covered", label: "Distance (km)" },
      { stat: "Number of sprints", label: "Sprints" },
      { stat: "Fouls", label: "Fouls" },
    ],
  },
  {
    label: "Goalkeeping",
    stats: [
      { stat: "Goalkeeper saves", label: "Saves" },
      { stat: "Goals prevented", label: "Goals Prevented" },
      { stat: "Big saves", label: "Big Saves" },
      { stat: "High claims", label: "High Claims" },
    ],
  },
]

// Radar axes: the six that best separate playing styles.
export const TEAM_RADAR_STATS: TeamStat[] = [
  { stat: "Ball possession", label: "Possession", pct: true },
  { stat: "Expected goals", label: "xG" },
  { stat: "Total shots", label: "Shots" },
  { stat: "Final third entries", label: "Final Third" },
  { stat: "Tackles", label: "Tackles" },
  { stat: "Recoveries", label: "Recoveries" },
]

export const TEAM_COLORS = ["#4ade80", "#60a5fa", "#fbbf24"]

/** Short league badges. Keep in sync with LEAGUE_SHORT in lib/search.ts. */
export const LEAGUE_ABBR: Record<string, string> = {
  "Premier League": "PL",
  "La Liga": "LL",
  "Ligue 1": "L1",
  Bundesliga: "BL",
}

/** The three headline per-match numbers shown on a single-club card. */
export const CLUB_CARD_STATS: TeamStat[] = [
  { stat: "Ball possession", label: "Possession", pct: true },
  { stat: "Expected goals", label: "xG" },
  { stat: "Total shots", label: "Shots" },
]

export type SeasonStatRow = {
  team: string
  stat: string
  per_match: number | string | null
  pct: number | string | null
  matches: number
}

export type TeamTableRow = {
  season: string
  league: string
  team: string
  played: number
  won: number
  drawn: number
  lost: number
  goals_for: number
  goals_against: number
  goal_diff: number
  points: number
}

/** Pick the right column for a stat and coerce the numeric-typed string Postgres returns. */
export function statValue(row: SeasonStatRow | undefined, spec: TeamStat): number {
  if (!row) return 0
  const raw = spec.pct ? (row.pct ?? row.per_match) : row.per_match
  return raw == null ? 0 : Number(raw)
}

/** Index rows by `${team}|${stat}` for O(1) lookup while building chart data. */
export function indexStats(rows: SeasonStatRow[]): Map<string, SeasonStatRow> {
  const map = new Map<string, SeasonStatRow>()
  for (const r of rows) map.set(`${r.team}|${r.stat}`, r)
  return map
}
