import type { TeamTableRow, SeasonStatRow, MatchXg } from "@/lib/teams"
import { indexStats, statValue, FULL_LEAGUES, SINGLE_CLUBS } from "@/lib/teams"
import { UCL } from "@/lib/competition"

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

// ── Champions League model ──
//
// A club plays one or two Champions League games before its odds matter, far
// too few to rate it on. So each club's attack and defence blend three things:
//   - its Champions League games this season,
//   - its domestic league games this season (where we hold that league),
//   - an average Champions League side, so a thin record is pulled to the mean.
// Backtested point-in-time on the 2025/26 league phase (144 matches), log-loss:
//   Champions League record alone, unshrunk ..... 1.109
//   every team rated average .................... 1.028
//   Champions League record, shrunk ............. 0.976
//   + domestic league form (this model) ......... 0.959
// and on 2026/27 round 1, which the settings never saw: 0.879 vs 0.962.

/** Share of a goal-rate that comes from xG; the rest from goals actually scored. */
const UCL_XG_WEIGHT = 0.6
/** A domestic league game counts as this much of a Champions League game. */
const UCL_DOMESTIC_WEIGHT = 0.75
/** Pseudo-games of an exactly average side mixed into every rating. */
const UCL_PRIOR_GAMES = 4
/** Home goals 1.93 vs away 1.45 per match in 2025/26: sqrt of the ratio each way. */
const UCL_HOME_MULT = 1.15
/** Goals per team-match before any are played (2025/26 league phase: 1.69). */
const UCL_PRIOR_AVG = 1.69
/** Ligue 1 / Bundesliga average: we hold only PSG's and Bayern's games there. */
const SINGLE_LEAGUE_AVG = 1.4

export type FinishedMatch = {
  event_id: number
  league: string
  date: string
  home: string
  away: string
  home_goals: number | null
  away_goals: number | null
}

export type UclStrength = {
  team: string
  /** Goal rates relative to an average Champions League side (1 = average). */
  attack: number
  defence: number
  /** Expected goal margin per match against an average side, neutral venue. */
  rating: number
  uclPlayed: number
  domesticPlayed: number
  domesticLeague: string | null
}

export type UclModel = { avg: number; teams: Map<string, UclStrength> }

type Tally = { n: number; gf: number; ga: number; xf: number; xa: number; nx: number }

function rates(t: Tally, avg: number): [number, number] {
  let f = t.gf / t.n
  let a = t.ga / t.n
  if (t.nx) {
    f = UCL_XG_WEIGHT * (t.xf / t.nx) + (1 - UCL_XG_WEIGHT) * f
    a = UCL_XG_WEIGHT * (t.xa / t.nx) + (1 - UCL_XG_WEIGHT) * a
  }
  return [f / avg, a / avg]
}

/**
 * Rate every Champions League club from matches played before `before`
 * (exclusive, "YYYY-MM-DD"), or from all of them when it is omitted. Point in
 * time matters for settled matches: rating a game with its own result in the
 * data flatters the accuracy tracker.
 */
export function uclStrengths(
  finished: FinishedMatch[],
  xg: MatchXg | undefined,
  uclTeams: Iterable<string>,
  before?: string,
): UclModel {
  const full = new Set<string>(FULL_LEAGUES)
  const single = new Map<string, string>(SINGLE_CLUBS.map((c) => [c.team, c.league]))
  const tallies = new Map<string, Tally>()
  const goals = new Map<string, [number, number]>()

  for (const m of finished) {
    if (before && m.date >= before) continue
    if (m.home_goals == null || m.away_goals == null) continue
    const x = xg?.get(m.event_id)
    const sides: [string, number, number, number | undefined, number | undefined][] = [
      [m.home, m.home_goals, m.away_goals, x?.[0], x?.[1]],
      [m.away, m.away_goals, m.home_goals, x?.[1], x?.[0]],
    ]
    for (const [team, gf, ga, xf, xa] of sides) {
      if (!full.has(m.league) && single.get(team) !== m.league) continue
      const key = `${m.league}|${team}`
      const t = tallies.get(key) ?? { n: 0, gf: 0, ga: 0, xf: 0, xa: 0, nx: 0 }
      t.n++
      t.gf += gf
      t.ga += ga
      if (xf != null && xa != null) {
        t.xf += xf
        t.xa += xa
        t.nx++
      }
      tallies.set(key, t)
    }
    if (full.has(m.league)) {
      const g = goals.get(m.league) ?? [0, 0]
      g[0] += m.home_goals + m.away_goals
      g[1] += 2
      goals.set(m.league, g)
    }
  }

  // Shrunk toward the prior too, so round 1's average isn't one evening's noise.
  const [ug, un] = goals.get(UCL) ?? [0, 0]
  const avg = (ug + UCL_PRIOR_AVG * 20) / (un + 20)

  const teams = new Map<string, UclStrength>()
  for (const team of uclTeams) {
    let att = UCL_PRIOR_GAMES
    let def = UCL_PRIOR_GAMES
    let weight = UCL_PRIOR_GAMES
    const u = tallies.get(`${UCL}|${team}`)
    if (u?.n) {
      const [a, d] = rates(u, avg)
      att += u.n * a
      def += u.n * d
      weight += u.n
    }
    let domesticLeague: string | null = null
    let domesticPlayed = 0
    for (const [key, t] of tallies) {
      const [league, name] = key.split("|")
      if (name !== team || league === UCL || !t.n) continue
      const [lg, ln] = goals.get(league) ?? [0, 0]
      const leagueAvg = ln ? lg / ln : SINGLE_LEAGUE_AVG
      // A club's rate against its own league, taken as its rate against the
      // Champions League field. Fitting a per-league conversion did no better
      // in the backtest, so none is applied.
      const [a, d] = rates(t, leagueAvg)
      const w = UCL_DOMESTIC_WEIGHT * t.n
      att += w * a
      def += w * d
      weight += w
      domesticLeague = league
      domesticPlayed = t.n
    }
    const attack = att / weight
    const defence = def / weight
    teams.set(team, {
      team,
      attack,
      defence,
      rating: avg * (attack - defence),
      uclPlayed: u?.n ?? 0,
      domesticPlayed,
      domesticLeague,
    })
  }
  return { avg, teams }
}

function uclExpectedGoals(home: string, away: string, model: UclModel): [number, number] {
  const h = model.teams.get(home)
  const a = model.teams.get(away)
  const ha = h?.attack ?? 1
  const hd = h?.defence ?? 1
  const aa = a?.attack ?? 1
  const ad = a?.defence ?? 1
  return [ha * ad * model.avg * UCL_HOME_MULT, (aa * hd * model.avg) / UCL_HOME_MULT]
}

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
  finished: FinishedMatch[],
  table: TeamTableRow[],
  stats?: SeasonStatRow[],
  xg?: MatchXg,
): MatchPrediction[] {
  // A club has one row per competition, so look it up in the match's own.
  const teamMap = new Map(table.map((t) => [`${t.league}|${t.team}`, t]))
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

  // Champions League ratings as of each match date, computed once per date.
  const uclTeams = new Set(
    upcoming.filter((m) => m.league === UCL).flatMap((m) => [m.home, m.away]),
  )
  const uclAsOf = new Map<string, UclModel>()
  const uclNow = uclStrengths(finished, xg, uclTeams)
  const uclModel = (m: { event_id: number; date: string }) => {
    if (!finishedMap.has(m.event_id)) return uclNow
    let model = uclAsOf.get(m.date)
    if (!model) {
      model = uclStrengths(finished, xg, uclTeams, m.date)
      uclAsOf.set(m.date, model)
    }
    return model
  }

  return upcoming.map((m) => {
    const homeTeam = teamMap.get(`${m.league}|${m.home}`)
    const awayTeam = teamMap.get(`${m.league}|${m.away}`)
    const avg = leagueAvg.get(m.league) ?? { goals: 1.3, sot: 4, bc: 1, sib: 5 }

    const homeProfile = buildProfile(m.home, homeTeam, byKey)
    const awayProfile = buildProfile(m.away, awayTeam, byKey)

    let homeExpected: number
    let awayExpected: number

    if (m.league === UCL) {
      ;[homeExpected, awayExpected] = uclExpectedGoals(m.home, m.away, uclModel(m))
    } else if (homeProfile && awayProfile) {
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
