import { Suspense } from "react"
import Link from "next/link"
import { supabase } from "@/lib/supabase"
import { resolveSeason } from "@/lib/seasons"
import {
  fetchTeamData,
  LEAGUE_ABBR,
  LEAGUE_TOURNAMENT_ID,
  TEAM_STAT_GROUPS,
  TEAM_RADAR_STATS,
  statValue,
  indexStats,
  type TeamTableRow,
  type SeasonStatRow,
  type TeamStat,
} from "@/lib/teams"
import { predictMatches } from "@/lib/predictions"
import { percentileRank } from "@/lib/stats"
import { Skeleton } from "@/components/ui/skeleton"
import { TeamCrest, LeagueCrest } from "@/components/player-avatar"

const TEAM_COLORS = ["#4ade80", "#60a5fa"]

const OUTCOME_COLORS = {
  home: "oklch(0.80 0.19 150)",
  draw: "oklch(0.70 0.045 252)",
  away: "oklch(0.72 0.14 40)",
} as const

const ALL_STATS = Array.from(
  new Set([
    ...TEAM_RADAR_STATS.map((s) => s.stat),
    ...TEAM_STAT_GROUPS.flatMap((g) => g.stats.map((s) => s.stat)),
  ]),
)

function ProbSection({
  homeWin,
  draw,
  awayWin,
  home,
  away,
  predicted,
}: {
  homeWin: number
  draw: number
  awayWin: number
  home: string
  away: string
  predicted: "home" | "draw" | "away"
}) {
  return (
    <section className="surface rounded-2xl bg-card p-5">
      <h2
        className="stat-label text-sm mb-4"
        style={{ color: "var(--pitch)" }}
      >
        Win Probability
      </h2>

      <div className="flex h-4 rounded-full overflow-hidden gap-0.5 mb-4">
        <div
          className="rounded-l-full flex items-center justify-center text-[0.6rem] font-bold"
          style={{ width: `${homeWin}%`, background: OUTCOME_COLORS.home }}
        >
          {homeWin > 12 ? `${homeWin}%` : ""}
        </div>
        <div
          className="flex items-center justify-center text-[0.6rem] font-bold"
          style={{ width: `${draw}%`, background: OUTCOME_COLORS.draw }}
        >
          {draw > 12 ? `${draw}%` : ""}
        </div>
        <div
          className="rounded-r-full flex items-center justify-center text-[0.6rem] font-bold"
          style={{ width: `${awayWin}%`, background: OUTCOME_COLORS.away }}
        >
          {awayWin > 12 ? `${awayWin}%` : ""}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4 text-center">
        {([
          { label: home, pct: homeWin, color: OUTCOME_COLORS.home, key: "home" },
          { label: "Draw", pct: draw, color: OUTCOME_COLORS.draw, key: "draw" },
          { label: away, pct: awayWin, color: OUTCOME_COLORS.away, key: "away" },
        ] as const).map((o) => (
          <div
            key={o.key}
            className="rounded-xl py-3 px-2"
            style={{
              background: predicted === o.key ? `${o.color}15` : "transparent",
              border: predicted === o.key ? `1px solid ${o.color}40` : "1px solid transparent",
            }}
          >
            <div className="stat-figure text-2xl" style={{ color: o.color }}>
              {o.pct}%
            </div>
            <div className="stat-label mt-1 truncate">{o.label}</div>
            {predicted === o.key && (
              <div
                className="stat-label text-[0.55rem] mt-1.5 px-1.5 py-0.5 rounded-full inline-block"
                style={{ color: o.color, background: `${o.color}20` }}
              >
                PREDICTED
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}

function FormCard({
  team,
  teamId,
  row,
  color,
}: {
  team: string
  teamId: number | null
  row: TeamTableRow | undefined
  color: string
}) {
  if (!row) return null
  const ppg = row.played > 0 ? (row.points / row.played).toFixed(2) : "—"
  const gfpg = row.played > 0 ? (row.goals_for / row.played).toFixed(1) : "—"
  const gapg = row.played > 0 ? (row.goals_against / row.played).toFixed(1) : "—"

  return (
    <div
      className="rounded-xl bg-white/[0.03] p-4"
      style={{ borderTop: `2px solid ${color}` }}
    >
      <div className="flex items-center gap-2.5 mb-3">
        {teamId && <TeamCrest teamId={teamId} name={team} size={24} />}
        <h3 className="font-semibold text-[0.95rem] truncate">{team}</h3>
      </div>
      <div className="grid grid-cols-3 gap-3">
        {([
          { label: "W-D-L", value: `${row.won}-${row.drawn}-${row.lost}` },
          { label: "PPG", value: ppg },
          { label: "Points", value: row.points },
          { label: "GF/g", value: gfpg },
          { label: "GA/g", value: gapg },
          { label: "GD", value: `${row.goal_diff > 0 ? "+" : ""}${row.goal_diff}` },
        ]).map((s) => (
          <div key={s.label}>
            <div className="stat-figure text-lg" style={{ color }}>{s.value}</div>
            <div className="stat-label">{s.label}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function StatCompare({
  home,
  away,
  homeId,
  awayId,
  byKey,
  allTeams,
}: {
  home: string
  away: string
  homeId: number | null
  awayId: number | null
  byKey: Map<string, SeasonStatRow>
  allTeams: TeamTableRow[]
}) {
  return (
    <section className="surface rounded-2xl bg-card overflow-hidden">
      <header className="px-5 pt-5 pb-3">
        <h2
          className="text-lg font-semibold tracking-tight uppercase"
          style={{ fontFamily: "var(--font-condensed)" }}
        >
          Stat Comparison
        </h2>
        <p className="stat-label mt-1">Per-match averages this season</p>
        <div className="flex items-center justify-between mt-3 px-2">
          <div className="flex items-center gap-2">
            {homeId && <TeamCrest teamId={homeId} name={home} size={20} />}
            <span className="text-sm font-medium" style={{ color: TEAM_COLORS[0] }}>{home}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium" style={{ color: TEAM_COLORS[1] }}>{away}</span>
            {awayId && <TeamCrest teamId={awayId} name={away} size={20} />}
          </div>
        </div>
      </header>

      <div className="px-3 pb-4">
        {TEAM_STAT_GROUPS.map((group) => {
          const visibleStats = group.stats.filter(
            (spec) =>
              byKey.has(`${home}|${spec.stat}`) || byKey.has(`${away}|${spec.stat}`),
          )
          if (visibleStats.length === 0) return null

          return (
            <div key={group.label} className="mb-4 last:mb-0">
              <div
                className="stat-label px-2 py-2"
                style={{ color: "var(--pitch)" }}
              >
                {group.label}
              </div>
              {visibleStats.map((spec) => {
                const hv = statValue(byKey.get(`${home}|${spec.stat}`), spec)
                const av = statValue(byKey.get(`${away}|${spec.stat}`), spec)
                const max = Math.max(hv, av, 0.01)
                const hBetter = hv > av
                const aBetter = av > hv

                return (
                  <div key={spec.stat} className="px-2 py-2.5 border-b border-white/[0.04] last:border-0">
                    <div className="text-center stat-label mb-2">{spec.label}</div>
                    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                      <div className="flex items-center gap-2 justify-end">
                        <span
                          className="stat-figure text-[0.95rem]"
                          style={{ color: hBetter ? TEAM_COLORS[0] : "var(--muted-foreground)" }}
                        >
                          {hv.toFixed(spec.pct ? 1 : 2)}{spec.pct ? "%" : ""}
                        </span>
                        <div className="w-24 h-2 rounded-full bg-white/[0.06] overflow-hidden flex justify-end">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${(hv / max) * 100}%`,
                              background: TEAM_COLORS[0],
                              opacity: hBetter ? 0.8 : 0.3,
                            }}
                          />
                        </div>
                      </div>

                      <span className="text-muted-foreground text-xs">vs</span>

                      <div className="flex items-center gap-2">
                        <div className="w-24 h-2 rounded-full bg-white/[0.06] overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${(av / max) * 100}%`,
                              background: TEAM_COLORS[1],
                              opacity: aBetter ? 0.8 : 0.3,
                            }}
                          />
                        </div>
                        <span
                          className="stat-figure text-[0.95rem]"
                          style={{ color: aBetter ? TEAM_COLORS[1] : "var(--muted-foreground)" }}
                        >
                          {av.toFixed(spec.pct ? 1 : 2)}{spec.pct ? "%" : ""}
                        </span>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>
    </section>
  )
}

function H2HResults({
  home,
  away,
  matches,
}: {
  home: string
  away: string
  matches: {
    event_id: number; round: number; date: string
    home: string; away: string
    home_goals: number | null; away_goals: number | null
  }[]
}) {
  const h2h = matches
    .filter(
      (m) =>
        m.home_goals != null &&
        ((m.home === home && m.away === away) ||
          (m.home === away && m.away === home)),
    )
    .sort((a, b) => b.date.localeCompare(a.date))

  if (h2h.length === 0) return null

  return (
    <section className="surface rounded-2xl bg-card p-5">
      <h2
        className="text-lg font-semibold tracking-tight uppercase mb-3"
        style={{ fontFamily: "var(--font-condensed)" }}
      >
        Head to Head
      </h2>
      <div className="space-y-2">
        {h2h.map((m) => {
          const hWon = m.home_goals! > m.away_goals!
          const aWon = m.away_goals! > m.home_goals!
          return (
            <div key={m.event_id} className="flex items-center gap-3 px-2 py-2 rounded-lg bg-white/[0.02]">
              <span className="stat-label shrink-0">
                {new Date(m.date + "T12:00:00").toLocaleDateString("en-GB", {
                  day: "numeric",
                  month: "short",
                  year: "2-digit",
                })}
              </span>
              <span
                className="flex-1 text-right text-sm font-medium truncate"
                style={{ color: hWon ? TEAM_COLORS[m.home === home ? 0 : 1] : undefined }}
              >
                {m.home}
              </span>
              <span className="stat-figure text-base px-1">
                {m.home_goals} – {m.away_goals}
              </span>
              <span
                className="flex-1 text-sm font-medium truncate"
                style={{ color: aWon ? TEAM_COLORS[m.away === away ? 1 : 0] : undefined }}
              >
                {m.away}
              </span>
            </div>
          )
        })}
      </div>
    </section>
  )
}

async function Content({
  searchParams,
}: {
  searchParams: Promise<{ id?: string; season?: string }>
}) {
  const params = await searchParams
  const eventId = Number(params.id)
  const season = resolveSeason(params.season)

  if (!eventId) {
    return (
      <div className="text-center py-20">
        <p className="text-muted-foreground">No match selected.</p>
        <Link href="/predictions" className="text-sm mt-2 inline-block" style={{ color: "var(--pitch)" }}>
          ← Back to predictions
        </Link>
      </div>
    )
  }

  const [{ table, stats }, { data: allMatchData }] = await Promise.all([
    fetchTeamData(supabase, season, ALL_STATS),
    supabase
      .from("matches")
      .select("event_id, league, season, round, date, home, home_id, away, away_id, status, home_goals, away_goals")
      .eq("season", season)
      .limit(2000),
  ])

  const allMatches = (allMatchData || []) as {
    event_id: number; league: string; season: string; round: number
    date: string; home: string; home_id: number | null; away: string; away_id: number | null; status: string
    home_goals: number | null; away_goals: number | null
  }[]

  const match = allMatches.find((m) => m.event_id === eventId)
  if (!match) {
    return (
      <div className="text-center py-20">
        <p className="text-muted-foreground">Match not found.</p>
        <Link href="/predictions" className="text-sm mt-2 inline-block" style={{ color: "var(--pitch)" }}>
          ← Back to predictions
        </Link>
      </div>
    )
  }

  const finished = allMatches.filter((m) => m.status === "finished")

  const predictions = predictMatches(
    [{
      event_id: match.event_id,
      league: match.league,
      round: match.round,
      date: match.date,
      home: match.home,
      home_id: match.home_id,
      away: match.away,
      away_id: match.away_id,
    }],
    finished,
    table,
    stats,
  )
  const pred = predictions[0]

  const homeRow = table.find((t) => t.team === match.home)
  const awayRow = table.find((t) => t.team === match.away)

  const byKey = indexStats(stats)
  const isSettled = match.status === "finished" && match.home_goals != null

  const leagueLabel = LEAGUE_ABBR[match.league] ?? match.league
  const leagueTournamentId = LEAGUE_TOURNAMENT_ID[match.league]
  const dateStr = new Date(match.date + "T12:00:00").toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  })

  return (
    <>
      <Link
        href="/predictions"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
      >
        <span>←</span> Predictions
      </Link>

      <section className="surface rounded-2xl bg-card px-5 py-6 mb-6 text-center">
        <div className="stat-label mb-2 flex items-center justify-center gap-2">
          {leagueTournamentId && (
            <LeagueCrest tournamentId={leagueTournamentId} name={match.league} size={22} />
          )}
          Round {match.round}
        </div>
        <div className="stat-label mb-5">{dateStr}</div>

        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 max-w-lg mx-auto">
          <Link
            href={`/teams/compare?teams=${encodeURIComponent(match.home)}`}
            className="flex flex-col items-center gap-2 group"
          >
            {match.home_id && (
              <TeamCrest teamId={match.home_id} name={match.home} size={48} />
            )}
            <span
              className="text-base sm:text-lg font-semibold group-hover:underline"
              style={{ color: TEAM_COLORS[0] }}
            >
              {match.home}
            </span>
          </Link>
          {isSettled ? (
            <div className="stat-figure text-3xl px-3">
              {match.home_goals} – {match.away_goals}
            </div>
          ) : (
            <div className="stat-label text-lg px-3">vs</div>
          )}
          <Link
            href={`/teams/compare?teams=${encodeURIComponent(match.away)}`}
            className="flex flex-col items-center gap-2 group"
          >
            {match.away_id && (
              <TeamCrest teamId={match.away_id} name={match.away} size={48} />
            )}
            <span
              className="text-base sm:text-lg font-semibold group-hover:underline"
              style={{ color: TEAM_COLORS[1] }}
            >
              {match.away}
            </span>
          </Link>
        </div>

        {isSettled && pred && (
          <div className="mt-4">
            <span
              className="stat-label text-[0.65rem] px-3 py-1 rounded-full"
              style={{
                color: pred.correct ? OUTCOME_COLORS.home : "oklch(0.65 0.14 25)",
                background: pred.correct
                  ? "oklch(0.80 0.19 150 / 13%)"
                  : "oklch(0.65 0.14 25 / 13%)",
              }}
            >
              Prediction {pred.correct ? "CORRECT" : "WRONG"} — called{" "}
              {pred.predicted === "home" ? match.home : pred.predicted === "away" ? match.away : "Draw"}
            </span>
          </div>
        )}
      </section>

      {pred && (
        <div className="mb-6">
          <ProbSection
            homeWin={pred.homeWin}
            draw={pred.draw}
            awayWin={pred.awayWin}
            home={match.home}
            away={match.away}
            predicted={pred.predicted}
          />
        </div>
      )}

      <div className="grid sm:grid-cols-2 gap-4 mb-6">
        <FormCard team={match.home} teamId={match.home_id} row={homeRow} color={TEAM_COLORS[0]} />
        <FormCard team={match.away} teamId={match.away_id} row={awayRow} color={TEAM_COLORS[1]} />
      </div>

      <div className="mb-6">
        <StatCompare
          home={match.home}
          away={match.away}
          homeId={match.home_id}
          awayId={match.away_id}
          byKey={byKey}
          allTeams={table}
        />
      </div>

      <H2HResults
        home={match.home}
        away={match.away}
        matches={allMatches.map((m) => ({
          event_id: m.event_id,
          round: m.round,
          date: m.date,
          home: m.home,
          away: m.away,
          home_goals: m.home_goals,
          away_goals: m.away_goals,
        }))}
      />
    </>
  )
}

export default function MatchDetailPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string; season?: string }>
}) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-14">
      <Suspense
        fallback={
          <div className="space-y-5">
            <Skeleton className="h-[180px] rounded-2xl" />
            <Skeleton className="h-[200px] rounded-2xl" />
            <div className="grid sm:grid-cols-2 gap-4">
              <Skeleton className="h-[160px] rounded-xl" />
              <Skeleton className="h-[160px] rounded-xl" />
            </div>
            <Skeleton className="h-[400px] rounded-2xl" />
          </div>
        }
      >
        <Content searchParams={searchParams} />
      </Suspense>
    </div>
  )
}
