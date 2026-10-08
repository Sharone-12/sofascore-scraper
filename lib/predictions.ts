import type { TeamTableRow, SeasonStatRow } from "@/lib/teams"
import { indexStats, statValue } from "@/lib/teams"

export type MatchPrediction = {
  event_id: number
  league: string
  round: number
  date: string
  home: string
  home_id: number | null
  away: string
  away_id: number | null
  homeWin: number
  draw: number
  awayWin: number
  predicted: "home" | "draw" | "away"
  homeGoals: number | null
  awayGoals: number | null
  actual: "home" | "draw" | "away" | null
  correct: boolean | null
}

export type AccuracyStats = {
  total: number
  correct: number
  pct: number
  homeCorrect: number
  homeTotal: number
  drawCorrect: number
  drawTotal: number
  awayCorrect: number
  awayTotal: number
}

function poisson(lambda: number, k: number): number {
  return (Math.pow(lambda, k) * Math.exp(-lambda)) / factorial(k)
}

function factorial(n: number): number {
  if (n <= 1) return 1
  let r = 1
  for (let i = 2; i <= n; i++) r *= i
  return r
}

function matchProbabilities(
  homeExpected: number,
  awayExpected: number,
  maxGoals = 7,
): { homeWin: number; draw: number; awayWin: number } {
  let homeWin = 0
  let draw = 0
  let awayWin = 0

  for (let h = 0; h <= maxGoals; h++) {
    for (let a = 0; a <= maxGoals; a++) {
      const p = poisson(homeExpected, h) * poisson(awayExpected, a)
      if (h > a) homeWin += p
      else if (h === a) draw += p
      else awayWin += p
    }
  }

  const total = homeWin + draw + awayWin
  return {
    homeWin: homeWin / total,
    draw: draw / total,
    awayWin: awayWin / total,
  }
}

const HOME_ADVANTAGE = 0.2

type TeamProfile = {
  xG: number
  goals: number
  goalsAgainst: number
  shotsOnTarget: number
  bigChances: number
  shotsInBox: number
  totalShots: number
  possession: number
  goalsPrevented: number
  played: number
}

function buildProfile(
  team: string,
  tableRow: TeamTableRow | undefined,
  byKey: Map<string, SeasonStatRow>,
): TeamProfile | null {
  if (!tableRow || tableRow.played < 2) return null

  const s = (stat: string, pct = false) => {
    const row = byKey.get(`${team}|${stat}`)
    if (!row) return 0
    const raw = pct ? (row.pct ?? row.per_match) : row.per_match
    return raw == null ? 0 : Number(raw)
  }

  return {
    xG: s("Expected goals"),
    goals: tableRow.goals_for / tableRow.played,
    goalsAgainst: tableRow.goals_against / tableRow.played,
    shotsOnTarget: s("Shots on target"),
    bigChances: s("Big chances"),
    shotsInBox: s("Shots inside box"),
    totalShots: s("Total shots"),
    possession: s("Ball possession", true),
    goalsPrevented: s("Goals prevented"),
    played: tableRow.played,
  }
}

function estimateAttack(profile: TeamProfile, leagueAvgGoals: number): number {
  if (profile.xG > 0) {
    const xgStrength = profile.xG / Math.max(leagueAvgGoals, 0.5)
    const goalStrength = profile.goals / Math.max(leagueAvgGoals, 0.5)
    return xgStrength * 0.6 + goalStrength * 0.4
  }
  return profile.goals / Math.max(leagueAvgGoals, 0.5)
}

function estimateDefence(profile: TeamProfile, leagueAvgGoals: number): number {
  let base = profile.goalsAgainst / Math.max(leagueAvgGoals, 0.5)

  if (profile.goalsPrevented !== 0) {
    const gpAdj = -profile.goalsPrevented * 0.06
    base = Math.max(0.4, base + gpAdj)
  }

  return base
}

function shotQualityMultiplier(profile: TeamProfile, leagueAvg: { sot: number; bc: number; sib: number }): number {
  let mult = 1.0

  if (profile.shotsOnTarget > 0 && leagueAvg.sot > 0) {
    const sotRatio = profile.shotsOnTarget / leagueAvg.sot
    mult += (sotRatio - 1) * 0.08
  }

  if (profile.bigChances > 0 && leagueAvg.bc > 0) {
    const bcRatio = profile.bigChances / leagueAvg.bc
    mult += (bcRatio - 1) * 0.06
  }

  if (profile.shotsInBox > 0 && leagueAvg.sib > 0) {
    const sibRatio = profile.shotsInBox / leagueAvg.sib
    mult += (sibRatio - 1) * 0.04
  }

  return Math.max(0.75, Math.min(1.3, mult))
}

function possessionAdjustment(homePoss: number, awayPoss: number): number {
  if (homePoss <= 0 || awayPoss <= 0) return 0
  const diff = homePoss - awayPoss
  return diff * 0.002
}

const PREDICTION_STATS = [
  "Expected goals",
  "Shots on target",
  "Big chances",
  "Shots inside box",
  "Total shots",
  "Ball possession",
  "Goals prevented",
]

export { PREDICTION_STATS }

export function predictMatches(
  upcoming: {
    event_id: number
    league: string
    round: number
    date: string
    home: string
    home_id: number | null
    away: string
    away_id: number | null
  }[],
  finished: {
    event_id: number
    home: string
    away: string
    home_goals: number | null
    away_goals: number | null
  }[],
  table: TeamTableRow[],
  stats?: SeasonStatRow[],
): MatchPrediction[] {
  const teamMap = new Map(table.map((t) => [t.team, t]))
  const byKey = stats ? indexStats(stats) : new Map<string, SeasonStatRow>()

  const leagueAvg = new Map<string, { goals: number; sot: number; bc: number; sib: number }>()
  for (const league of new Set(table.map((t) => t.league))) {
    const teams = table.filter((t) => t.league === league && t.played >= 2)
    if (teams.length === 0) continue
    const totalGames = teams.reduce((s, t) => s + t.played, 0)
    const totalGoals = teams.reduce((s, t) => s + t.goals_for, 0)
    const avgGoals = totalGoals / totalGames || 1.2

    let totalSot = 0, totalBc = 0, totalSib = 0, statCount = 0
    for (const t of teams) {
      const sot = byKey.get(`${t.team}|Shots on target`)
      const bc = byKey.get(`${t.team}|Big chances`)
      const sib = byKey.get(`${t.team}|Shots inside box`)
      if (sot) { totalSot += Number(sot.per_match ?? 0); statCount++ }
      if (bc) totalBc += Number(bc.per_match ?? 0)
      if (sib) totalSib += Number(sib.per_match ?? 0)
    }
    const n = statCount || 1
    leagueAvg.set(league, {
      goals: avgGoals,
      sot: totalSot / n,
      bc: totalBc / n,
      sib: totalSib / n,
    })
  }

  const finishedMap = new Map(finished.map((m) => [m.event_id, m]))

  return upcoming.map((m) => {
    const homeTeam = teamMap.get(m.home)
    const awayTeam = teamMap.get(m.away)
    const avg = leagueAvg.get(m.league) ?? { goals: 1.3, sot: 4, bc: 1, sib: 5 }

    const homeProfile = buildProfile(m.home, homeTeam, byKey)
    const awayProfile = buildProfile(m.away, awayTeam, byKey)

    let homeExpected: number
    let awayExpected: number

    if (homeProfile && awayProfile) {
      const homeAttack = estimateAttack(homeProfile, avg.goals)
      const homeDefence = estimateDefence(homeProfile, avg.goals)
      const awayAttack = estimateAttack(awayProfile, avg.goals)
      const awayDefence = estimateDefence(awayProfile, avg.goals)

      homeExpected = homeAttack * awayDefence * avg.goals
      awayExpected = awayAttack * homeDefence * avg.goals

      const homeShotMult = shotQualityMultiplier(homeProfile, avg)
      const awayShotMult = shotQualityMultiplier(awayProfile, avg)
      homeExpected *= homeShotMult
      awayExpected *= awayShotMult

      const possAdj = possessionAdjustment(homeProfile.possession, awayProfile.possession)
      homeExpected += possAdj
      awayExpected -= possAdj * 0.5

      homeExpected += HOME_ADVANTAGE
    } else {
      const ha = homeTeam && homeTeam.played >= 2
        ? homeTeam.goals_for / homeTeam.played / avg.goals : 1
      const hd = homeTeam && homeTeam.played >= 2
        ? homeTeam.goals_against / homeTeam.played / avg.goals : 1
      const aa = awayTeam && awayTeam.played >= 2
        ? awayTeam.goals_for / awayTeam.played / avg.goals : 1
      const ad = awayTeam && awayTeam.played >= 2
        ? awayTeam.goals_against / awayTeam.played / avg.goals : 1

      homeExpected = ha * ad * avg.goals + HOME_ADVANTAGE
      awayExpected = aa * hd * avg.goals
    }

    const probs = matchProbabilities(
      Math.max(0.3, homeExpected),
      Math.max(0.3, awayExpected),
    )

    const predicted =
      probs.homeWin >= probs.draw && probs.homeWin >= probs.awayWin
        ? "home"
        : probs.awayWin >= probs.draw
          ? "away"
          : "draw"

    const result = finishedMap.get(m.event_id)
    let actual: "home" | "draw" | "away" | null = null
    let homeGoals: number | null = null
    let awayGoals: number | null = null

    if (result && result.home_goals != null && result.away_goals != null) {
      homeGoals = result.home_goals
      awayGoals = result.away_goals
      actual =
        result.home_goals > result.away_goals
          ? "home"
          : result.home_goals < result.away_goals
            ? "away"
            : "draw"
    }

    return {
      event_id: m.event_id,
      league: m.league,
      round: m.round,
      date: m.date,
      home: m.home,
      home_id: m.home_id,
      away: m.away,
      away_id: m.away_id,
      homeWin: Math.round(probs.homeWin * 100),
      draw: Math.round(probs.draw * 100),
      awayWin: Math.round(probs.awayWin * 100),
      predicted,
      homeGoals,
      awayGoals,
      actual,
      correct: actual ? predicted === actual : null,
    }
  })
}

export function computeAccuracy(predictions: MatchPrediction[]): AccuracyStats {
  const settled = predictions.filter((p) => p.actual !== null)
  const correct = settled.filter((p) => p.correct)

  const byOutcome = (outcome: "home" | "draw" | "away") => {
    const predicted = settled.filter((p) => p.predicted === outcome)
    return {
      total: predicted.length,
      correct: predicted.filter((p) => p.correct).length,
    }
  }

  const home = byOutcome("home")
  const draw = byOutcome("draw")
  const away = byOutcome("away")

  return {
    total: settled.length,
    correct: correct.length,
    pct: settled.length > 0 ? Math.round((correct.length / settled.length) * 100) : 0,
    homeCorrect: home.correct,
    homeTotal: home.total,
    drawCorrect: draw.correct,
    drawTotal: draw.total,
    awayCorrect: away.correct,
    awayTotal: away.total,
  }
}
