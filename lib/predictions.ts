import type { TeamTableRow } from "@/lib/teams"

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
  maxGoals = 6,
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

const HOME_ADVANTAGE = 0.25

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
): MatchPrediction[] {
  const teamMap = new Map(table.map((t) => [t.team, t]))

  const leagueAvg = new Map<string, { attack: number; defence: number }>()
  for (const league of new Set(table.map((t) => t.league))) {
    const teams = table.filter((t) => t.league === league && t.played >= 2)
    if (teams.length === 0) continue
    const totalGames = teams.reduce((s, t) => s + t.played, 0)
    const totalGoals = teams.reduce((s, t) => s + t.goals_for, 0)
    const avg = totalGoals / totalGames || 1.2
    leagueAvg.set(league, { attack: avg, defence: avg })
  }

  const finishedMap = new Map(finished.map((m) => [m.event_id, m]))

  return upcoming.map((m) => {
    const homeTeam = teamMap.get(m.home)
    const awayTeam = teamMap.get(m.away)
    const avg = leagueAvg.get(m.league) ?? { attack: 1.3, defence: 1.3 }

    const homeAttack = homeTeam && homeTeam.played >= 2
      ? homeTeam.goals_for / homeTeam.played / avg.attack
      : 1
    const homeDefence = homeTeam && homeTeam.played >= 2
      ? homeTeam.goals_against / homeTeam.played / avg.defence
      : 1
    const awayAttack = awayTeam && awayTeam.played >= 2
      ? awayTeam.goals_for / awayTeam.played / avg.attack
      : 1
    const awayDefence = awayTeam && awayTeam.played >= 2
      ? awayTeam.goals_against / awayTeam.played / avg.defence
      : 1

    const homeExpected = homeAttack * awayDefence * avg.attack + HOME_ADVANTAGE
    const awayExpected = awayAttack * homeDefence * avg.defence

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
