"use client"

import { useState, useEffect, useRef, useMemo, Fragment } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { percentileRank } from "@/lib/stats"
import {
  FULL_LEAGUES,
  SINGLE_CLUBS,
  LEAGUE_ABBR,
  LEAGUE_TOURNAMENT_ID,
  TEAM_STAT_GROUPS,
  TEAM_RADAR_STATS,
  TEAM_COLORS,
  statValue,
  indexStats,
  parseRaw,
  type SeasonStatRow,
  type TeamTableRow,
} from "@/lib/teams"
import { resolveSeason } from "@/lib/seasons"
import { PlayerRadar, StatBarChart } from "@/components/charts"
import { TeamCrest, LeagueCrest } from "@/components/player-avatar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

const MAX_TEAMS = 3

const WANTED_STATS = Array.from(
  new Set([
    ...TEAM_RADAR_STATS.map((s) => s.stat),
    ...TEAM_STAT_GROUPS.flatMap((g) => g.stats.map((s) => s.stat)),
  ]),
)

function TeamPicker({
  teams,
  selected,
  onPick,
  disabled,
}: {
  teams: TeamTableRow[]
  selected: string[]
  onPick: (team: string) => void
  disabled: boolean
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", onClickOutside)
    return () => document.removeEventListener("mousedown", onClickOutside)
  }, [])

  const matches = teams.filter(
    (t) =>
      !selected.includes(t.team) &&
      t.team.toLowerCase().includes(query.toLowerCase()),
  )

  return (
    <div ref={ref} className="relative w-full max-w-md">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className="surface w-full rounded-xl bg-card px-4 py-3 text-left text-sm flex items-center justify-between disabled:opacity-45 disabled:cursor-not-allowed transition-colors hover:bg-white/[0.03]"
      >
        <span className={disabled ? "text-muted-foreground" : ""}>
          {disabled ? `Maximum ${MAX_TEAMS} teams` : "Add a team…"}
        </span>
        <span className="text-muted-foreground text-xs">▾</span>
      </button>

      {open && !disabled && (
        <div className="surface-raised absolute z-50 mt-2 w-full rounded-xl bg-popover text-popover-foreground overflow-hidden animate-slide-down">
          <div className="p-2 border-b border-white/5">
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter teams…"
              className="w-full rounded-lg bg-white/[0.05] px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus:bg-white/[0.08] transition-colors"
            />
          </div>
          <div className="max-h-72 overflow-y-auto p-1">
            {matches.length === 0 && (
              <p className="px-3 py-4 text-sm text-muted-foreground">
                No teams match.
              </p>
            )}
            {matches.map((t) => (
              <button
                key={t.team}
                type="button"
                onClick={() => {
                  onPick(t.team)
                  setOpen(false)
                  setQuery("")
                }}
                className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-white/[0.06] transition-colors text-left"
              >
                <span className="text-sm font-medium">{t.team}</span>
                <span className="stat-label flex items-center gap-1">
                  {LEAGUE_TOURNAMENT_ID[t.league] && (
                    <LeagueCrest tournamentId={LEAGUE_TOURNAMENT_ID[t.league]} name={t.league} size={13} />
                  )}
                  {LEAGUE_ABBR[t.league] ?? t.league} · {t.points}pts
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default function TeamCompareContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const teamsParam = searchParams.get("teams")
  const season = resolveSeason(searchParams.get("season"))

  const selected = useMemo(
    () => teamsParam?.split(",").filter(Boolean) ?? [],
    [teamsParam],
  )

  const [table, setTable] = useState<TeamTableRow[]>([])
  const [stats, setStats] = useState<SeasonStatRow[]>([])
  const [teamIds, setTeamIds] = useState<Map<string, number>>(new Map())
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const [matchesRes, idsRes] = await Promise.all([
        supabase
          .from("matches")
          .select("event_id, league, season, home, away, status, home_goals, away_goals")
          .eq("season", season)
          .eq("status", "finished")
          .limit(1000),
        supabase
          .from("players")
          .select("team, team_id")
          .eq("season", season),
      ])
      if (cancelled) return

      const matchRows = (matchesRes.data || []) as {
        event_id: number; league: string; season: string
        home: string; away: string; status: string
        home_goals: number | null; away_goals: number | null
      }[]

      const matchById = new Map(matchRows.map((m) => [m.event_id, m]))
      const eventIds = matchRows.map((m) => m.event_id)

      // Fetch match_stats in batches of 50 event_ids to stay under URL/row limits
      const rawStats: { event_id: number; stat: string; home: string; away: string }[] = []
      for (let i = 0; i < eventIds.length; i += 50) {
        const batch = eventIds.slice(i, i + 50)
        const { data } = await supabase
          .from("match_stats")
          .select("event_id, stat, home, away")
          .in("event_id", batch)
          .in("stat", WANTED_STATS)
          .limit(5000)
        if (data) rawStats.push(...(data as typeof rawStats))
      }
      if (cancelled) return

      const allowedTeams = new Set<string>()
      const fullLeagueSet = new Set<string>(FULL_LEAGUES)
      const singleClubNames = new Set<string>(SINGLE_CLUBS.map((c) => c.team))
      for (const m of matchRows) {
        if (fullLeagueSet.has(m.league)) {
          allowedTeams.add(m.home)
          allowedTeams.add(m.away)
        } else {
          if (singleClubNames.has(m.home)) allowedTeams.add(m.home)
          if (singleClubNames.has(m.away)) allowedTeams.add(m.away)
        }
      }

      const teamMap = new Map<string, { league: string; gf: number; ga: number; w: number; d: number; l: number; p: number }>()
      function addSide(team: string, league: string, gf: number, ga: number) {
        if (!allowedTeams.has(team)) return
        let t = teamMap.get(team)
        if (!t) { t = { league, gf: 0, ga: 0, w: 0, d: 0, l: 0, p: 0 }; teamMap.set(team, t) }
        t.gf += gf; t.ga += ga; t.p++
        if (gf > ga) t.w++; else if (gf === ga) t.d++; else t.l++
      }
      for (const m of matchRows) {
        if (m.home_goals != null && m.away_goals != null) {
          addSide(m.home, m.league, m.home_goals, m.away_goals)
          addSide(m.away, m.league, m.away_goals, m.home_goals)
        }
      }
      const builtTable: TeamTableRow[] = []
      for (const [team, t] of teamMap) {
        builtTable.push({
          season, league: t.league, team, played: t.p,
          won: t.w, drawn: t.d, lost: t.l,
          goals_for: t.gf, goals_against: t.ga,
          goal_diff: t.gf - t.ga,
          points: t.w * 3 + t.d,
        })
      }
      builtTable.sort((a, b) => b.points - a.points)

      type Acc = { sum: number; pctSum: number; count: number }
      const accMap = new Map<string, Acc>()
      for (const rs of rawStats) {
        const m = matchById.get(rs.event_id)
        if (!m) continue
        const sides: [string, string][] = [[m.home, rs.home], [m.away, rs.away]]
        for (const [team, raw] of sides) {
          if (!allowedTeams.has(team)) continue
          const { value, pct } = parseRaw(raw)
          if (value == null && pct == null) continue
          const key = `${team}|${rs.stat}`
          let acc = accMap.get(key)
          if (!acc) { acc = { sum: 0, pctSum: 0, count: 0 }; accMap.set(key, acc) }
          acc.sum += value ?? 0
          acc.pctSum += pct ?? 0
          acc.count++
        }
      }

      const builtStats: SeasonStatRow[] = []
      for (const [key, acc] of accMap) {
        const [team, stat] = key.split("|")
        builtStats.push({
          team, stat,
          per_match: Math.round((acc.sum / acc.count) * 100) / 100,
          pct: Math.round((acc.pctSum / acc.count) * 10) / 10,
          matches: acc.count,
        })
      }

      setTable(builtTable)
      setStats(builtStats)
      const idMap = new Map<string, number>()
      for (const r of idsRes.data || []) idMap.set(r.team, r.team_id)
      setTeamIds(idMap)
      setLoading(false)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [season])

  function setTeams(next: string[]) {
    router.push(
      next.length
        ? `/teams/compare?teams=${next.map(encodeURIComponent).join(",")}`
        : "/teams/compare",
      { scroll: false },
    )
  }

  const byKey = useMemo(() => indexStats(stats), [stats])

  const radarData = useMemo(() => {
    if (selected.length === 0) return []
    return TEAM_RADAR_STATS.map((spec) => {
      const population = table
        .filter((t) => byKey.has(`${t.team}|${spec.stat}`))
        .map((t) => statValue(byKey.get(`${t.team}|${spec.stat}`), spec))
      const row: Record<string, string | number> = { stat: spec.label }
      for (const team of selected) {
        const entry = byKey.get(`${team}|${spec.stat}`)
        row[team] = entry
          ? percentileRank(statValue(entry, spec), population)
          : 0
      }
      return row
    })
  }, [selected, table, byKey])

  const barGroups = useMemo(
    () =>
      TEAM_STAT_GROUPS.map((group) => ({
        label: group.label,
        data: group.stats
          .filter((spec) =>
            selected.some((team) => byKey.has(`${team}|${spec.stat}`)),
          )
          .map((spec) => {
            const row: Record<string, string | number> = { stat: spec.label }
            for (const team of selected) {
              row[team] = statValue(byKey.get(`${team}|${spec.stat}`), spec)
            }
            return row
          }),
      })),
    [selected, byKey],
  )

  const standings = selected
    .map((name) => table.find((t) => t.team === name))
    .filter(Boolean) as TeamTableRow[]

  return (
    <div className="mx-auto max-w-6xl px-4 py-14">
      <div className="mb-8 animate-fade-in">
        <h1
          className="text-5xl sm:text-6xl tracking-[-0.035em] leading-none mb-3"
          style={{ fontFamily: "var(--font-condensed)" }}
        >
          <span className="font-bold">Club</span>
          <span className="font-normal text-muted-foreground"> vs </span>
          <span className="font-bold">club.</span>
        </h1>
        <p className="text-muted-foreground text-base">
          Per-match averages across {season}. Add up to {MAX_TEAMS}.
        </p>
      </div>

      <div className="mb-6">
        <TeamPicker
          teams={table}
          selected={selected}
          onPick={(t) => setTeams([...selected, t])}
          disabled={selected.length >= MAX_TEAMS}
        />
      </div>

      {standings.length > 0 && (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-8 stagger">
          {standings.map((t, i) => (
            <div
              key={t.team}
              className="surface-raised rounded-2xl bg-card px-5 py-4"
              style={{ borderTop: `2px solid ${TEAM_COLORS[i]}` }}
            >
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  {teamIds.has(t.team) && (
                    <TeamCrest teamId={teamIds.get(t.team)!} name={t.team} size={28} />
                  )}
                  <div className="min-w-0">
                    <p className="font-semibold truncate">{t.team}</p>
                    <p className="stat-label mt-0.5">
                      {t.league}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  aria-label={`Remove ${t.team}`}
                  onClick={() => setTeams(selected.filter((s) => s !== t.team))}
                  className="text-muted-foreground hover:text-foreground transition-colors text-sm leading-none shrink-0"
                >
                  ✕
                </button>
              </div>
              <div className="grid grid-cols-4 gap-2">
                {[
                  { k: "Pts", v: t.points },
                  { k: "P", v: t.played },
                  { k: "GD", v: `${t.goal_diff > 0 ? "+" : ""}${t.goal_diff}` },
                  { k: "GF", v: t.goals_for },
                ].map((s) => (
                  <div key={s.k}>
                    <p
                      className="stat-figure text-2xl"
                      style={{ color: TEAM_COLORS[i] }}
                    >
                      {s.v}
                    </p>
                    <p className="stat-label mt-0.5">{s.k}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {loading && (
        <p className="text-muted-foreground animate-fade-in">Loading teams…</p>
      )}

      {!loading && selected.length === 0 && (
        <div className="surface rounded-2xl bg-card py-20 text-center animate-fade-in">
          <p
            className="text-3xl font-bold tracking-tight mb-2"
            style={{ fontFamily: "var(--font-condensed)" }}
          >
            Pick two clubs
          </p>
          <p className="text-muted-foreground text-sm">
            Style profiles, per-match stat breakdowns and head-to-head numbers.
          </p>
        </div>
      )}

      {selected.length > 0 && (
        <Card className="surface border-0 mb-6 animate-slide-up">
          <CardHeader>
            <CardTitle className="stat-label text-sm">Style Profile</CardTitle>
            <p className="text-xs text-muted-foreground/60">
              Percentile rank against all 40 clubs
            </p>
          </CardHeader>
          <CardContent>
            <PlayerRadar data={radarData} players={selected} />
          </CardContent>
        </Card>
      )}

      {selected.length > 0 && (
        <>
          <div className="grid md:grid-cols-2 gap-5 mb-6 stagger">
            {barGroups
              .filter((group) => group.data.length > 0)
              .map((group) => (
              <Card key={group.label} className="surface border-0">
                <CardHeader>
                  <CardTitle className="stat-label text-sm">
                    {group.label}
                  </CardTitle>
                  <p className="text-xs text-muted-foreground/60">per match</p>
                </CardHeader>
                <CardContent>
                  <StatBarChart data={group.data} players={selected} />
                </CardContent>
              </Card>
            ))}
          </div>

          <Card className="surface border-0 animate-slide-up">
            <CardHeader>
              <CardTitle className="stat-label text-sm">All Stats</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/10">
                      <th className="stat-label text-left py-2.5 pr-4">Stat</th>
                      {selected.map((team, i) => (
                        <th
                          key={team}
                          className="stat-label text-right py-2.5 px-2"
                          style={{ color: TEAM_COLORS[i] }}
                        >
                          <span className="inline-flex items-center gap-1.5 justify-end">
                            {teamIds.has(team) && (
                              <TeamCrest teamId={teamIds.get(team)!} name={team} size={16} />
                            )}
                            {team}
                          </span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {TEAM_STAT_GROUPS.map((group) => (
                      <Fragment key={group.label}>
                        <tr>
                          <td
                            colSpan={selected.length + 1}
                            className="stat-label pt-5 pb-1.5"
                            style={{ color: "var(--pitch)" }}
                          >
                            {group.label}
                          </td>
                        </tr>
                        {group.stats.map((spec) => {
                          const entries = selected.map((team) =>
                            byKey.get(`${team}|${spec.stat}`),
                          )
                          const vals = entries.map((e) => statValue(e, spec))
                          const hasAny = entries.some(Boolean)
                          if (!hasAny) return null
                          const max = Math.max(...vals)
                          return (
                            <tr
                              key={spec.stat}
                              className="border-b border-white/[0.06]"
                            >
                              <td className="py-2 pr-4 text-muted-foreground">
                                {spec.label}
                              </td>
                              {selected.map((team, i) => {
                                const v = vals[i]
                                const missing = !entries[i]
                                const best =
                                  vals.length > 1 && v === max && v > 0
                                return (
                                  <td
                                    key={team}
                                    className="stat-figure text-right py-2 px-2 text-[0.95rem]"
                                    style={{
                                      color: best
                                        ? TEAM_COLORS[i]
                                        : "var(--muted-foreground)",
                                    }}
                                  >
                                    {missing ? "—" : v.toFixed(spec.pct ? 1 : 2)}
                                  </td>
                                )
                              })}
                            </tr>
                          )
                        })}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
