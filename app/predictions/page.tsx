import { Suspense } from "react"
import Link from "next/link"
import { supabase } from "@/lib/supabase"
import { resolveSeason } from "@/lib/seasons"
import { fetchTeamData, LEAGUE_ABBR, LEAGUE_TOURNAMENT_ID, FULL_LEAGUES, SINGLE_CLUBS } from "@/lib/teams"
import {
  predictMatches,
  computeAccuracy,
  uclStrengths,
  PREDICTION_STATS,
  type MatchPrediction,
  type AccuracyStats,
  type UclModel,
} from "@/lib/predictions"
import { UCL } from "@/lib/competition"
import { Skeleton } from "@/components/ui/skeleton"
import { TeamCrest, LeagueCrest } from "@/components/player-avatar"
import { PredictionsLeagueToggle } from "@/components/predictions-league-toggle"
import { BarcaTransition } from "@/components/barca-transition"

const OUTCOME_COLORS = {
  home: "oklch(0.80 0.19 150)",
  draw: "oklch(0.70 0.045 252)",
  away: "oklch(0.72 0.14 40)",
} as const

const OUTCOME_LABELS = { home: "Home", draw: "Draw", away: "Away" } as const

function ProbBar({ homeWin, draw, awayWin }: { homeWin: number; draw: number; awayWin: number }) {
  return (
    <div className="flex h-2 rounded-full overflow-hidden gap-px">
      <div
        className="rounded-l-full transition-all"
        style={{ width: `${homeWin}%`, background: OUTCOME_COLORS.home }}
      />
      <div
        className="transition-all"
        style={{ width: `${draw}%`, background: OUTCOME_COLORS.draw }}
      />
      <div
        className="rounded-r-full transition-all"
        style={{ width: `${awayWin}%`, background: OUTCOME_COLORS.away }}
      />
    </div>
  )
}

function MatchCardInner({ p }: { p: MatchPrediction }) {
  const isSettled = p.actual !== null
  const isBarca = p.home === "FC Barcelona" || p.away === "FC Barcelona"
  const cardClass = `card-lift surface rounded-xl px-4 py-3.5 space-y-3 block ${
    isBarca ? "barca-stripes" : "bg-card"
  }`
  const content = (
    <div className={cardClass}>
      <div className="flex items-center justify-between gap-2">
        <span className="shrink-0 flex items-center gap-1.5">
          {LEAGUE_TOURNAMENT_ID[p.league] ? (
            <LeagueCrest tournamentId={LEAGUE_TOURNAMENT_ID[p.league]} name={p.league} size={20} />
          ) : (
            <span className="stat-label">{LEAGUE_ABBR[p.league] ?? p.league}</span>
          )}
        </span>
        <span className="stat-label">R{p.round}</span>
        <span className="stat-label ml-auto">
          {new Date(p.date + "T12:00:00").toLocaleDateString("en-GB", {
            weekday: "short",
            day: "numeric",
            month: "short",
          })}
        </span>
      </div>

      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        <span className="flex items-center gap-2 justify-end">
          <span className="text-[0.9rem] font-medium truncate">{p.home}</span>
          {p.home_id && <TeamCrest teamId={p.home_id} name={p.home} size={22} />}
        </span>
        {isSettled ? (
          <span className="stat-figure text-lg px-2">
            {p.homeGoals} – {p.awayGoals}
          </span>
        ) : (
          <span className="stat-label px-2">vs</span>
        )}
        <span className="flex items-center gap-2">
          {p.away_id && <TeamCrest teamId={p.away_id} name={p.away} size={22} />}
          <span className="text-[0.9rem] font-medium truncate">{p.away}</span>
        </span>
      </div>

      <ProbBar homeWin={p.homeWin} draw={p.draw} awayWin={p.awayWin} />

      <div className="flex justify-between text-xs">
        {(["home", "draw", "away"] as const).map((k) => (
          <span key={k} className="flex items-center gap-1.5">
            <span
              className="w-2 h-2 rounded-full"
              style={{ background: OUTCOME_COLORS[k] }}
            />
            <span className="stat-label">
              {OUTCOME_LABELS[k]}{" "}
              <span className="text-foreground">
                {k === "home" ? p.homeWin : k === "draw" ? p.draw : p.awayWin}%
              </span>
            </span>
          </span>
        ))}
      </div>

      <div className="flex items-center justify-between pt-1 border-t border-white/5">
        <span className="stat-label">
          Prediction:{" "}
          <span style={{ color: OUTCOME_COLORS[p.predicted] }}>
            {p.predicted === "home" ? p.home : p.predicted === "away" ? p.away : "Draw"}
          </span>
        </span>
        {isSettled && (
          <span
            className="stat-label text-[0.6rem] px-2 py-0.5 rounded-full"
            style={{
              color: p.correct ? OUTCOME_COLORS.home : "oklch(0.65 0.14 25)",
              background: p.correct
                ? "oklch(0.80 0.19 150 / 13%)"
                : "oklch(0.65 0.14 25 / 13%)",
            }}
          >
            {p.correct ? "CORRECT" : "WRONG"}
          </span>
        )}
      </div>
    </div>
  )
  const href = `/predictions/match?id=${p.event_id}`
  return isBarca ? (
    <BarcaTransition href={href}>{content}</BarcaTransition>
  ) : (
    <Link href={href}>{content}</Link>
  )
}

function MatchCard({ p }: { p: MatchPrediction }) {
  return <MatchCardInner p={p} />
}

function AccuracyCard({ acc }: { acc: AccuracyStats }) {
  if (acc.total === 0) return null
  const ring = (correct: number, total: number) => {
    const pct = total > 0 ? (correct / total) * 100 : 0
    const r = 18
    const circ = 2 * Math.PI * r
    const offset = circ - (pct / 100) * circ
    return { pct: Math.round(pct), r, circ, offset }
  }

  const overall = ring(acc.correct, acc.total)

  return (
    <section className="surface rounded-2xl bg-card p-5">
      <header className="flex items-baseline justify-between pb-4">
        <h2
          className="text-lg font-semibold tracking-tight uppercase"
          style={{ fontFamily: "var(--font-condensed)" }}
        >
          Accuracy Tracker
        </h2>
        <span className="stat-label">{acc.total} settled</span>
      </header>

      <div className="flex items-center gap-6">
        <div className="relative shrink-0">
          <svg width="52" height="52" viewBox="0 0 44 44" className="-rotate-90">
            <circle cx="22" cy="22" r={overall.r} fill="none" stroke="oklch(1 0 0 / 8%)" strokeWidth="5" />
            <circle
              cx="22" cy="22" r={overall.r} fill="none"
              stroke={OUTCOME_COLORS.home}
              strokeWidth="5"
              strokeLinecap="round"
              strokeDasharray={overall.circ}
              strokeDashoffset={overall.offset}
            />
          </svg>
          <span
            className="absolute inset-0 flex items-center justify-center stat-figure text-sm"
            style={{ color: OUTCOME_COLORS.home }}
          >
            {overall.pct}%
          </span>
        </div>

        <div className="flex-1 grid grid-cols-3 gap-3">
          {([
            { label: "Home", correct: acc.homeCorrect, total: acc.homeTotal, color: OUTCOME_COLORS.home },
            { label: "Draw", correct: acc.drawCorrect, total: acc.drawTotal, color: OUTCOME_COLORS.draw },
            { label: "Away", correct: acc.awayCorrect, total: acc.awayTotal, color: OUTCOME_COLORS.away },
          ] as const).map((s) => (
            <div key={s.label} className="text-center">
              <div className="stat-label">{s.label}</div>
              <div className="stat-figure text-lg" style={{ color: s.color }}>
                {s.total > 0 ? Math.round((s.correct / s.total) * 100) : 0}%
              </div>
              <div className="stat-label">{s.correct}/{s.total}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

const WANTED_STATS = PREDICTION_STATS

function signed(n: number, digits = 2) {
  return `${n > 0 ? "+" : ""}${n.toFixed(digits)}`
}

/**
 * Every Champions League club rated by the same model that sets the odds, so
 * a reader can see why a match is priced the way it is.
 */
function UclRatings({ model, ids }: { model: UclModel; ids: Map<string, number> }) {
  const rows = [...model.teams.values()].sort((a, b) => b.rating - a.rating)
  if (rows.length === 0) return null
  const top = Math.max(...rows.map((r) => Math.abs(r.rating)), 0.01)
  return (
    <section className="surface rounded-2xl bg-card overflow-hidden">
      <header className="px-5 pt-5 pb-3">
        <h2
          className="text-lg font-semibold tracking-tight uppercase"
          style={{ fontFamily: "var(--font-condensed)" }}
        >
          UCL strength
        </h2>
        <p className="stat-label mt-1">
          Expected goal margin vs an average Champions League side · this
          season&apos;s UCL and league form, xG-weighted
        </p>
      </header>
      <div className="px-2 pb-3">
        <div className="grid grid-cols-[1.5rem_1fr_3.5rem_3rem] sm:grid-cols-[1.5rem_1fr_3.5rem_3.5rem_3.5rem_7rem] gap-2 px-3 pb-2 border-b border-white/5">
          <span className="stat-label text-right">#</span>
          <span className="stat-label">Team</span>
          <span className="stat-label text-right">Rating</span>
          <span className="stat-label text-right hidden sm:block">For</span>
          <span className="stat-label text-right hidden sm:block">Against</span>
          <span className="stat-label text-right">Based on</span>
        </div>
        {rows.map((t, i) => (
          <div
            key={t.team}
            className="grid grid-cols-[1.5rem_1fr_3.5rem_3rem] sm:grid-cols-[1.5rem_1fr_3.5rem_3.5rem_3.5rem_7rem] gap-2 items-center px-3 py-2"
          >
            <span className="stat-figure text-sm text-right text-muted-foreground">{i + 1}</span>
            <span className="min-w-0">
              <span className="flex items-center gap-2 text-[0.9rem] font-medium truncate">
                {ids.has(t.team) && <TeamCrest teamId={ids.get(t.team)!} name={t.team} size={18} />}
                <span className="truncate">{t.team}</span>
              </span>
              <span className="flex h-[3px] mt-1.5 max-w-[7rem] rounded-full overflow-hidden bg-white/5">
                <span
                  style={{
                    width: `${(Math.abs(t.rating) / top) * 100}%`,
                    background: t.rating >= 0 ? OUTCOME_COLORS.home : OUTCOME_COLORS.away,
                    opacity: 0.75,
                  }}
                />
              </span>
            </span>
            <span
              className="stat-figure text-sm text-right"
              style={{ color: t.rating >= 0 ? "var(--pitch)" : OUTCOME_COLORS.away }}
            >
              {signed(t.rating)}
            </span>
            <span className="stat-figure text-sm text-right text-muted-foreground hidden sm:block">
              {(t.attack * model.avg).toFixed(2)}
            </span>
            <span className="stat-figure text-sm text-right text-muted-foreground hidden sm:block">
              {(t.defence * model.avg).toFixed(2)}
            </span>
            <span className="stat-label text-right">
              {t.uclPlayed} UCL
              {t.domesticLeague ? ` · ${t.domesticPlayed} ${LEAGUE_ABBR[t.domesticLeague] ?? t.domesticLeague}` : ""}
            </span>
          </div>
        ))}
      </div>
      <p className="stat-label px-5 pb-4">
        Clubs from leagues we don&apos;t track are rated on Champions League games
        alone, pulled toward average until they&apos;ve played more.
      </p>
    </section>
  )
}
const trackedTeams = new Set([
  ...FULL_LEAGUES,
  ...SINGLE_CLUBS.map((c) => c.league),
])

const LEAGUE_FILTERS = [
  { key: "all", label: "All", full: "" },
  { key: "PL", label: "PL", full: "Premier League" },
  { key: "LL", label: "La Liga", full: "La Liga" },
  { key: "UCL", label: "UCL", full: "Champions League" },
] as const

async function Content({
  searchParams,
}: {
  searchParams: Promise<{ season?: string; league?: string }>
}) {
  const sp = await searchParams
  const season = resolveSeason(sp.season)
  const leagueFilter = sp.league || "all"
  const leagueFullName = LEAGUE_FILTERS.find((f) => f.key === leagueFilter)?.full || null

  const [{ table, stats, xg }, { data: matchData }] = await Promise.all([
    fetchTeamData(supabase, season, WANTED_STATS),
    supabase
      .from("matches")
      .select("event_id, league, season, round, date, home, home_id, away, away_id, status, home_goals, away_goals")
      .eq("season", season)
      .limit(2000),
  ])

  const matches = (matchData || []) as {
    event_id: number; league: string; season: string; round: number
    date: string; home: string; home_id: number | null; away: string; away_id: number | null; status: string
    home_goals: number | null; away_goals: number | null
  }[]

  const trackedLeagues = new Set(table.map((t) => t.league))
  const trackedTeamNames = new Set(table.map((t) => t.team))

  const upcoming = matches
    .filter((m) =>
      m.status === "upcoming" &&
      trackedLeagues.has(m.league) &&
      (trackedTeamNames.has(m.home) || trackedTeamNames.has(m.away)),
    )
    .sort((a, b) => a.date.localeCompare(b.date) || a.league.localeCompare(b.league))

  const finished = matches.filter((m) => m.status === "finished")

  const allPredictable = [...upcoming, ...finished.filter((m) =>
    trackedLeagues.has(m.league) &&
    (trackedTeamNames.has(m.home) || trackedTeamNames.has(m.away)),
  )]

  const predictions = predictMatches(
    allPredictable.map((m) => ({
      event_id: m.event_id,
      league: m.league,
      round: m.round,
      date: m.date,
      home: m.home,
      home_id: m.home_id,
      away: m.away,
      away_id: m.away_id,
    })),
    finished,
    table,
    stats,
    xg,
  )

  const uclIds = new Map<string, number>()
  for (const m of matches) {
    if (m.league !== UCL) continue
    if (m.home_id) uclIds.set(m.home, m.home_id)
    if (m.away_id) uclIds.set(m.away, m.away_id)
  }
  const uclModel =
    leagueFullName === UCL ? uclStrengths(finished, xg, uclIds.keys()) : null

  const filtered = leagueFullName
    ? predictions.filter((p) => p.league === leagueFullName)
    : predictions

  const upcomingPredictions = filtered.filter((p) => p.actual === null)
  const settledPredictions = filtered.filter((p) => p.actual !== null)
  const accuracy = computeAccuracy(filtered)

  const nextRound = upcomingPredictions[0]?.round
  const nextRoundPredictions = upcomingPredictions.filter((p) => p.round === nextRound)
  const laterPredictions = upcomingPredictions.filter((p) => p.round !== nextRound)

  const recentSettled = settledPredictions
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 20)

  return (
    <>
      <PredictionsLeagueToggle active={leagueFilter} />
      <AccuracyCard acc={accuracy} />
      {uclModel && <UclRatings model={uclModel} ids={uclIds} />}

      {nextRoundPredictions.length > 0 && (
        <section>
          <h2
            className="text-lg font-semibold tracking-tight uppercase mb-3"
            style={{ fontFamily: "var(--font-condensed)" }}
          >
            Next up — Round {nextRound}
          </h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 stagger">
            {nextRoundPredictions.map((p) => (
              <MatchCard key={p.event_id} p={p} />
            ))}
          </div>
        </section>
      )}

      {laterPredictions.length > 0 && (
        <section>
          <h2
            className="text-lg font-semibold tracking-tight uppercase mb-3"
            style={{ fontFamily: "var(--font-condensed)" }}
          >
            Coming up
          </h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {laterPredictions.slice(0, 30).map((p) => (
              <MatchCard key={p.event_id} p={p} />
            ))}
          </div>
        </section>
      )}

      {recentSettled.length > 0 && (
        <section>
          <h2
            className="text-lg font-semibold tracking-tight uppercase mb-3"
            style={{ fontFamily: "var(--font-condensed)" }}
          >
            Recent results
          </h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {recentSettled.map((p) => (
              <MatchCard key={p.event_id} p={p} />
            ))}
          </div>
        </section>
      )}
    </>
  )
}

export default function PredictionsPage({
  searchParams,
}: {
  searchParams: Promise<{ season?: string; league?: string }>
}) {
  return (
    <div className="mx-auto max-w-6xl px-4 py-14">
      <div className="mb-10 animate-fade-in">
        <h1
          className="text-5xl sm:text-6xl tracking-[-0.035em] leading-[0.95] mb-4"
          style={{ fontFamily: "var(--font-condensed)" }}
        >
          <span className="font-bold">Predictions.</span>{" "}
          <span className="font-normal text-muted-foreground">
            Receipts kept.
          </span>
        </h1>
        <p className="text-muted-foreground text-base max-w-md">
          Poisson model probabilities for every upcoming match — and a running
          accuracy tracker so you can see how we do.
        </p>
      </div>

      <Suspense
        fallback={
          <div className="space-y-5">
            <Skeleton className="h-[120px] rounded-2xl" />
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-[200px] rounded-xl" />
              ))}
            </div>
          </div>
        }
      >
        <div className="space-y-8">
          <Content searchParams={searchParams} />
        </div>
      </Suspense>
    </div>
  )
}
