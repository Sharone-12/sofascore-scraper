import { Suspense } from "react"
import Link from "next/link"
import { supabase } from "@/lib/supabase"
import { Skeleton } from "@/components/ui/skeleton"
import {
  CURRENT_SEASON,
  FULL_LEAGUES,
  SINGLE_CLUBS,
  CLUB_CARD_STATS,
  statValue,
  indexStats,
  type TeamTableRow,
  type SeasonStatRow,
} from "@/lib/teams"

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

async function Tables() {
  const [tableRes, statsRes] = await Promise.all([
    supabase
      .from("team_table")
      .select("*")
      .eq("season", CURRENT_SEASON)
      .order("points", { ascending: false })
      .order("goal_diff", { ascending: false }),
    supabase
      .from("team_season_stats")
      .select("team, stat, per_match, pct, matches")
      .eq("season", CURRENT_SEASON)
      .in("team", SINGLE_CLUBS.map((c) => c.team) as unknown as string[]),
  ])

  const all = (tableRes.data || []) as TeamTableRow[]
  const clubStats = indexStats((statsRes.data || []) as SeasonStatRow[])

  return (
    <div className="stagger space-y-5">
      <div className="grid lg:grid-cols-2 gap-5">
        {FULL_LEAGUES.map((lg) => (
          <LeagueTable
            key={lg}
            league={lg}
            rows={all.filter((t) => t.league === lg)}
          />
        ))}
      </div>

      {/* Single clubs: their leagues aren't ingested in full, so there is no
          table to show — just the club's own record and per-match numbers. */}
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

export default function TeamsPage() {
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
          League standings and per-match team profiles, {CURRENT_SEASON}.
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
        <Tables />
      </Suspense>
    </div>
  )
}
