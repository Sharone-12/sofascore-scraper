export const RADAR_STATS = [
  { key: "goals_p90", label: "Goals" },
  { key: "assists_p90", label: "Assists" },
  { key: "xg_p90", label: "xG" },
  { key: "key_passes_p90", label: "Key Passes" },
  { key: "dribbles_p90", label: "Dribbles" },
  { key: "tackles_won_p90", label: "Tackles" },
  { key: "interceptions_p90", label: "Interceptions" },
  { key: "aerials_won_p90", label: "Aerials" },
]

export const STAT_GROUPS = [
  {
    label: "Attacking",
    stats: [
      { key: "goals_p90", label: "Goals" },
      { key: "xg_p90", label: "xG" },
      { key: "shots_p90", label: "Shots" },
      { key: "shots_on_target_p90", label: "Shots on Target" },
      { key: "big_chances_missed_p90", label: "Big Chances Missed" },
    ],
  },
  {
    label: "Creativity",
    stats: [
      { key: "assists_p90", label: "Assists" },
      { key: "xa_p90", label: "xA" },
      { key: "key_passes_p90", label: "Key Passes" },
      { key: "big_chances_created_p90", label: "Big Chances Created" },
      { key: "crosses_p90", label: "Crosses" },
    ],
  },
  {
    label: "Passing",
    stats: [
      { key: "passes_p90", label: "Accurate Passes" },
      { key: "total_passes_p90", label: "Total Passes" },
      { key: "long_balls_p90", label: "Long Balls" },
      { key: "final_third_passes_p90", label: "Final Third Passes" },
    ],
  },
  {
    label: "Dribbling & Possession",
    stats: [
      { key: "dribbles_p90", label: "Successful Dribbles" },
      { key: "total_dribbles_p90", label: "Total Dribbles" },
      { key: "dispossessed_p90", label: "Dispossessed" },
      { key: "touches_p90", label: "Touches" },
    ],
  },
  {
    label: "Defending",
    stats: [
      { key: "tackles_won_p90", label: "Tackles Won" },
      { key: "interceptions_p90", label: "Interceptions" },
      { key: "recoveries_p90", label: "Recoveries" },
      { key: "clearances_p90", label: "Clearances" },
      { key: "blocked_shots_p90", label: "Blocked Shots" },
      { key: "aerials_won_p90", label: "Aerials Won" },
    ],
  },
  {
    label: "Discipline",
    stats: [
      { key: "yellows_p90", label: "Yellow Cards" },
      { key: "reds_p90", label: "Red Cards" },
      { key: "penalties_won_p90", label: "Penalties Won" },
      { key: "penalties_conceded_p90", label: "Penalties Conceded" },
    ],
  },
]

export const PLAYER_COLORS = ["#6366f1", "#f59e0b", "#10b981"]

export function percentileRank(value: number, values: number[]): number {
  const valid = values.filter((v) => v != null && !isNaN(v))
  if (valid.length === 0) return 0
  const below = valid.filter((v) => v < value).length
  const equal = valid.filter((v) => v === value).length
  return Math.round(((below + equal * 0.5) / valid.length) * 100)
}
