import { Suspense } from "react"
import Link from "next/link"
import { supabase } from "@/lib/supabase"
import { Skeleton } from "@/components/ui/skeleton"
import {
  FULL_LEAGUES,
  SINGLE_CLUBS,
  CLUB_CARD_STATS,
  LEAGUE_ABBR,
  statValue,
  indexStats,
  fetchTeamData,
  type TeamTableRow,
  type SeasonStatRow,
  type TeamStat,
} from "@/lib/teams"
import { resolveSeason } from "@/lib/seasons"

const POWER_STAT = { stat: "Expected goals", label: "xG" } as TeamStat

const POWER_COLORS = [
  "oklch(0.85 0.18 145)",
  "oklch(0.78 0.15 145)",
  "oklch(0.72 0.12 145)",
  "oklch(0.66 0.09 145)",
  "oklch(0.60 0.06 145)",
]

function formBar({ won, drawn, lost, played }: TeamTableRow) {
  if (!played) return []
  return [
    { label: "W", n: won, color: "var(--pitch)" },
    { label: "D", n: drawn, color: "oklch(0.70 0.045 252)" },
    { label: "L", n: lost, color: "oklch(0.55 0.14 25)" },
  ].filter((s) => s.n > 0)
}

function LeagueTable({
  league,
  rows,
}: {
  league: string
  rows: TeamTableRow[]
}) {
  const topPoints = rows[0]?.points || 1
  return (
    <section className="surface rounded-2xl bg-card overflow-hidden">
      <header className="flex items-baseline justify-between px-5 pt-5 pb-3">
        <h2
          className="text-lg font-semibold tracking-tight uppercase"
          style={{ fontFamily: "var(--font-condensed)" }}
        >
          {league}
        </h2>
        <span className="stat-label">{rows[0]?.played ?? 0} played</span>
      </header>

      <div className="px-2 pb-3">
        <div className="grid grid-cols-[1.5rem_1fr_2rem_2.5rem_2.25rem] sm:grid-cols-[1.5rem_1fr_2rem_4.5rem_2.5rem_2.25rem] gap-2 px-3 pb-2 border-b border-white/5">
          <span className="stat-label text-right">#</span>
          <span className="stat-label">Team</span>
          <span className="stat-label text-right">P</span>
          <span className="stat-label hidden sm:block text-center">W/D/L</span>
          <span className="stat-label text-right">GD</span>
          <span className="stat-label text-right">Pts</span>
        </div>

        {rows.map((t, i) => (
          <Link
            key={t.team}
            href={`/teams/compare?teams=${encodeURIComponent(t.team)}`}
            className="group grid grid-cols-[1.5rem_1fr_2rem_2.5rem_2.25rem] sm:grid-cols-[1.5rem_1fr_2rem_4.5rem_2.5rem_2.25rem] gap-2 items-center px-3 py-2 rounded-xl hover:bg-white/[0.04] transition-colors duration-150"
          >
            <span
              className="stat-figure text-sm text-right"
              style={{
                color: i < 4 ? "var(--pitch)" : "var(--muted-foreground)",
                opacity: i < 4 ? 1 : 0.5,
              }}
            >
              {i + 1}
            </span>

            <span className="min-w-0">
              <span className="block text-[0.9rem] font-medium truncate group-hover:text-white transition-colors">
                {t.team}
              </span>
              <span className="flex h-[3px] gap-px mt-1.5 rounded-full overflow-hidden max-w-[7rem]">
                {formBar(t).map((s) => (
                  <span
                    key={s.label}
                    style={{ background: s.color, flexGrow: s.n, opacity: 0.75 }}
                  />
                ))}
              </span>
            </span>

            <span className="stat-figure text-sm text-right text-muted-foreground">
              {t.played}
            </span>

            <span className="hidden sm:block stat-figure text-xs text-center text-muted-foreground tracking-wide">
              {t.won}-{t.drawn}-{t.lost}
            </span>

            <span
              className="stat-figure text-sm text-right"
              style={{
                color:
                  t.goal_diff > 0
                    ? "var(--pitch)"
                    : t.goal_diff < 0
                      ? "oklch(0.65 0.14 25)"
                      : "var(--muted-foreground)",
              }}
            >
              {t.goal_diff > 0 ? "+" : ""}
              {t.goal_diff}
            </span>

            <span className="relative text-right">
              <span className="stat-figure text-lg">{t.points}</span>
              <span
                className="absolute -bottom-0.5 right-0 h-[2px] rounded-full"
                style={{
                  width: `${Math.max(8, (t.points / topPoints) * 100)}%`,
                  background: "var(--pitch)",
                  opacity: 0.3,
                }}
              />
            </span>
          </Link>
        ))}
      </div>
    </section>
  )
}

function ClubCard({
  short,
  league,
  row,
  stats,
}: {
  short: string
  league: string
  row: TeamTableRow | undefined
  stats: Map<string, SeasonStatRow>
}) {
  const played = row?.played ?? 0
  const perGame = (n: number) => (played ? (n / played).toFixed(1) : "—")
  return (
    <section className="surface rounded-2xl bg-card p-5">
      <header className="flex items-baseline justify-between pb-3">
        <h3
          className="text-lg font-semibold tracking-tight uppercase"
          style={{ fontFamily: "var(--font-condensed)" }}
        >
          {short}
        </h3>
        <span className="stat-label">
          {league} · {played} played
        </span>
      </header>

      {played === 0 ? (
        <p className="stat-label">No finished matches yet this season.</p>
      ) : (
        <>
          <div className="flex gap-4 pb-3">
            <span className="stat-label">
              {row!.won}W {row!.drawn}D {row!.lost}L
            </span>
            <span className="stat-label">
              {row!.goals_for}:{row!.goals_against} (
              {row!.goal_diff > 0 ? "+" : ""}
              {row!.goal_diff})
            </span>
            <span className="stat-label">{row!.points} pts</span>
          </div>
          <div className="grid grid-cols-4 gap-2 border-t border-white/5 pt-3">
            <div>
              <div className="stat-label">Goals/g</div>
              <div className="tabular-nums">{perGame(row!.goals_for)}</div>
            </div>
            {CLUB_CARD_STATS.map((s) => (
              <div key={s.stat}>
                <div className="stat-label">{s.label}</div>
                <div className="tabular-nums">
                  {statValue(stats.get(`${row!.team}|${s.stat}`), s).toFixed(1)}
                  {s.pct ? "%" : ""}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  )
}

type RankedTeam = {
  team: string
  league: string
  score: number
  ppg: number
  gd: number
  played: number
}

function PowerRankings({ ranked }: { ranked: RankedTeam[] }) {
  const top = ranked.slice(0, 5)
  const maxScore = top[0]?.score ?? 1
  return (
    <section className="surface rounded-2xl bg-card overflow-hidden">
      <header className="px-5 pt-5 pb-4">
        <h2
          className="text-lg font-semibold tracking-tight uppercase"
          style={{ fontFamily: "var(--font-condensed)" }}
        >
          Power Rankings
        </h2>
        <p className="stat-label mt-1">
          Points per game, goal difference &amp; xG — weighted toward results
        </p>
      </header>

      <div className="px-3 pb-4 space-y-1">
        {top.map((t, i) => (
          <Link
            key={t.team}
            href={`/teams/compare?teams=${encodeURIComponent(t.team)}`}
            className="group relative flex items-center gap-4 px-4 py-3 rounded-xl hover:bg-white/[0.04] transition-colors"
          >
            <span
              className="stat-figure text-2xl w-8 text-center shrink-0"
              style={{ color: POWER_COLORS[i], fontFamily: "var(--font-condensed)" }}
            >
              {i + 1}
            </span>

            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-2">
                <span className="font-semibold text-[0.95rem] truncate group-hover:text-white transition-colors">
                  {t.team}
                </span>
                <span className="stat-label shrink-0">
                  {LEAGUE_ABBR[t.league] ?? t.league}
                </span>
              </div>
              <div className="flex items-center gap-3 mt-1.5">
                <div
                  className="h-[5px] rounded-full"
                  style={{
                    width: `${(t.score / maxScore) * 100}%`,
                    background: POWER_COLORS[i],
                    opacity: 0.7,
                    minWidth: "1rem",
                  }}
                />
              </div>
            </div>

            <div className="flex items-center gap-4 shrink-0">
              <div className="text-right">
                <div
                  className="stat-figure text-lg"
                  style={{ color: POWER_COLORS[i] }}
                >
                  {t.score.toFixed(1)}
                </div>
                <div className="stat-label">rating</div>
              </div>
              <div className="text-right hidden sm:block">
                <div className="stat-figure text-sm">{t.ppg.toFixed(2)}</div>
                <div className="stat-label">ppg</div>
              </div>
              <div className="text-right hidden sm:block">
                <div
                  className="stat-figure text-sm"
                  style={{
                    color: t.gd > 0 ? "var(--pitch)" : t.gd < 0 ? "oklch(0.65 0.14 25)" : "var(--muted-foreground)",
                  }}
                >
                  {t.gd > 0 ? "+" : ""}{t.gd}
                </div>
                <div className="stat-label">gd</div>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  )
}

function normalize(v: number, min: number, max: number): number {
  return max === min ? 0.5 : (v - min) / (max - min)
}

function computePowerRankings(
  table: TeamTableRow[],
  stats: SeasonStatRow[],
): RankedTeam[] {
  const byKey = indexStats(stats)
  const teams = table.filter((t) => t.played >= 3)
  if (teams.length === 0) return []

  const ppgVals = teams.map((t) => t.points / t.played)
  const gdVals = teams.map((t) => t.goal_diff / t.played)
  const xgVals = teams.map((t) =>
    statValue(byKey.get(`${t.team}|${POWER_STAT.stat}`), POWER_STAT),
  )

  const ppgMin = Math.min(...ppgVals), ppgMax = Math.max(...ppgVals)
  const gdMin = Math.min(...gdVals), gdMax = Math.max(...gdVals)
  const xgMin = Math.min(...xgVals), xgMax = Math.max(...xgVals)

  return teams
    .map((t) => {
      const ppg = t.points / t.played
      const gdpg = t.goal_diff / t.played
      const xg = statValue(byKey.get(`${t.team}|${POWER_STAT.stat}`), POWER_STAT)
      const score =
        normalize(ppg, ppgMin, ppgMax) * 50 +
        normalize(gdpg, gdMin, gdMax) * 30 +
        normalize(xg, xgMin, xgMax) * 20
      return {
        team: t.team,
        league: t.league,
        score,
        ppg,
        gd: t.goal_diff,
        played: t.played,
      }
    })
    .sort((a, b) => b.score - a.score)
}

const WANTED_STATS = Array.from(
  new Set([
    ...CLUB_CARD_STATS.map((s) => s.stat),
    POWER_STAT.stat,
  ]),
)

async function Tables({
  searchParams,
}: {
  searchParams: Promise<{ season?: string }>
}) {
  const season = resolveSeason((await searchParams).season)
  const { table: all, stats } = await fetchTeamData(supabase, season, WANTED_STATS)
  const clubStats = indexStats(stats)
  const ranked = computePowerRankings(all, stats)

  return (
    <div className="stagger space-y-5">
      <PowerRankings ranked={ranked} />

      <div className="grid lg:grid-cols-2 gap-5">
        {FULL_LEAGUES.map((lg) => (
          <LeagueTable
            key={lg}
            league={lg}
            rows={all.filter((t) => t.league === lg)}
          />
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        {SINGLE_CLUBS.map((c) => (
          <ClubCard
            key={c.team}
            short={c.short}
            league={c.league}
            row={all.find((t) => t.team === c.team)}
            stats={clubStats}
          />
        ))}
      </div>
    </div>
  )
}

export default function TeamsPage({
  searchParams,
}: {
  searchParams: Promise<{ season?: string }>
}) {
  return (
    <div className="mx-auto max-w-6xl px-4 py-14">
      <div className="mb-10 animate-fade-in">
        <h1
          className="text-5xl sm:text-6xl tracking-[-0.035em] leading-[0.95] mb-4"
          style={{ fontFamily: "var(--font-condensed)" }}
        >
          <span className="font-bold">Every club.</span>{" "}
          <span className="font-normal text-muted-foreground">
            Every metric.
          </span>
        </h1>
        <p className="text-muted-foreground text-base max-w-md mb-6">
          League standings and per-match team profiles.
        </p>
        <Link
          href="/teams/compare"
          className="surface-raised inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium transition-transform duration-200 hover:-translate-y-px"
          style={{ background: "var(--primary)" }}
        >
          Compare teams
          <span aria-hidden>→</span>
        </Link>
      </div>

      <Suspense
        fallback={
          <div className="grid lg:grid-cols-2 gap-5">
            <Skeleton className="h-[640px] rounded-2xl" />
            <Skeleton className="h-[640px] rounded-2xl" />
          </div>
        }
      >
        <Tables searchParams={searchParams} />
      </Suspense>
    </div>
  )
}
