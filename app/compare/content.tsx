"use client"

import { useState, useEffect, Fragment } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { supabase } from "@/lib/supabase"
import {
  STAT_GROUPS,
  RADAR_STATS,
  PLAYER_COLORS,
  statKey,
  formatStat,
  type StatMode,
} from "@/lib/stats"
import { LEAGUE_ABBR, LEAGUE_TOURNAMENT_ID } from "@/lib/teams"
import { resolveSeason } from "@/lib/seasons"
import { PlayerSearch } from "@/components/player-search"
import { PlayerAvatar, TeamCrest, LeagueCrest } from "@/components/player-avatar"
import { useAsk, AskAnswer } from "@/components/ask-panel"
import { PlayerRadar, StatBarChart } from "@/components/charts"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

type Player = Record<string, string | number | null>

export default function CompareContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [players, setPlayers] = useState<Player[]>([])
  const [loading, setLoading] = useState(false)
  const [mode, setMode] = useState<StatMode>("p90")
  const verdict = useAsk()

  const slugParam = searchParams.get("players")
  const season = resolveSeason(searchParams.get("season"))
  const slugs = slugParam?.split(",").filter(Boolean) || []

  useEffect(() => {
    if (slugs.length === 0) {
      setPlayers([])
      return
    }
    setLoading(true)
    supabase
      .from("players")
      .select("*")
      .in("slug", slugs)
      .order("season", { ascending: false })
      .then(({ data }) => {
        const seen = new Set<string>()
        const rows = data || []
        const unique = [
          ...rows.filter((p) => p.season === season),
          ...rows,
        ].filter((p) => {
          const s = p.slug as string
          if (seen.has(s)) return false
          seen.add(s)
          return true
        })
        const ordered = slugs
          .map((s) => unique.find((p) => p.slug === s))
          .filter(Boolean) as Player[]
        setPlayers(ordered)
        setLoading(false)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slugParam, season])

  function addPlayer(p: { slug: string }) {
    if (slugs.includes(p.slug) || slugs.length >= 3) return
    const next = [...slugs, p.slug]
    router.push(`/compare?players=${next.join(",")}`, { scroll: false })
  }

  function removePlayer(slug: string) {
    const next = slugs.filter((s) => s !== slug)
    router.push(
      next.length ? `/compare?players=${next.join(",")}` : "/compare",
      { scroll: false },
    )
  }

  const playerNames = players.map((p) => p.player as string)

  const modeLabel = mode === "p90" ? "per 90 minutes" : "season total"

  const radarData = RADAR_STATS.map((s) => {
    const row: Record<string, string | number> = { stat: s.label }
    players.forEach((p) => {
      row[p.player as string] = Number(p[statKey(s.key, mode)]) || 0
    })
    return row
  })

  const barGroups = STAT_GROUPS.map((group) => ({
    label: group.label,
    data: group.stats.map((s) => {
      const row: Record<string, string | number> = { stat: s.label }
      players.forEach((p) => {
        row[p.player as string] = Number(p[statKey(s.key, mode)]) || 0
      })
      return row
    }),
  }))

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <div className="mb-10 animate-fade-in">
        <h1
          className="text-5xl tracking-[-0.035em] leading-none mb-3"
          style={{ fontFamily: "var(--font-condensed)" }}
        >
          <span className="font-bold">Head</span>
          <span className="font-normal text-muted-foreground">-to-</span>
          <span className="font-bold">head.</span>
        </h1>
        <p className="text-muted-foreground text-base">
          Side-by-side {mode === "p90" ? "per-90" : "season total"} stats for up
          to 3 players
        </p>
      </div>

      <div className="max-w-md mb-6">
        <PlayerSearch
          onSelect={addPlayer}
          placeholder={
            slugs.length >= 3 ? "Max 3 players" : "Add a player..."
          }
        />
      </div>

      {players.length > 0 && (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-6 stagger">
          {players.map((p, i) => (
            <div
              key={p.slug as string}
              className="surface relative rounded-xl bg-card overflow-hidden"
              style={{ borderTop: `2px solid ${PLAYER_COLORS[i]}` }}
            >
              <button
                type="button"
                aria-label={`Remove ${p.player as string}`}
                onClick={() => removePlayer(p.slug as string)}
                className="absolute top-2.5 right-2.5 text-muted-foreground/50 hover:text-foreground transition-colors text-sm leading-none"
              >
                ×
              </button>

              <div className="px-4 pt-3.5 pb-3 flex gap-3">
                <PlayerAvatar
                  playerId={p.player_id as number}
                  name={p.player as string}
                  size={48}
                  ring={PLAYER_COLORS[i]}
                />
                <div className="min-w-0">
                  <p
                    className="font-semibold tracking-tight truncate pr-5"
                    style={{ color: PLAYER_COLORS[i] }}
                  >
                    {p.player as string}
                  </p>
                  <p className="text-sm text-foreground/80 truncate mt-0.5 flex items-center gap-1.5">
                    <TeamCrest
                      teamId={p.team_id as number}
                      name={p.team as string}
                      size={16}
                    />
                    <span className="truncate">{p.team as string}</span>
                  </p>
                  <p className="stat-label mt-1 truncate flex items-center gap-1">
                    {(p.role as string) || (p.position as string)} ·{" "}
                    {LEAGUE_TOURNAMENT_ID[p.league as string] && (
                      <LeagueCrest tournamentId={LEAGUE_TOURNAMENT_ID[p.league as string]} name={p.league as string} size={13} />
                    )}
                    {LEAGUE_ABBR[p.league as string] ?? (p.league as string)} ·{" "}
                    {p.season as string}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 border-t border-white/5 divide-x divide-white/5">
                <div className="px-4 py-2">
                  <div className="stat-label">Minutes</div>
                  <div className="tabular-nums text-sm">
                    {Number(p.minutes) || 0}
                  </div>
                </div>
                <div className="px-4 py-2">
                  <div className="stat-label">Apps</div>
                  <div className="tabular-nums text-sm">
                    {Number(p.appearances) || 0}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {players.length > 0 && (
        <div className="flex items-center gap-3 mb-8">
          <div
            className="inline-flex rounded-lg p-0.5 bg-secondary/40"
            role="group"
            aria-label="Stat mode"
          >
            {(
              [
                ["p90", "Per 90"],
                ["total", "Totals"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={mode === value}
                onClick={() => setMode(value)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  mode === value
                    ? "bg-card text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <span className="stat-label">
            {mode === "p90"
              ? "rates, minutes-adjusted"
              : "raw season counts, not minutes-adjusted"}
          </span>

          {players.length >= 2 && (
            <button
              type="button"
              onClick={() =>
                verdict.ask(
                  `Who is the better player, and why? ${players
                    .map((p) => p.player as string)
                    .join(" vs ")}`,
                  players.map((p) => p.slug as string),
                )
              }
              disabled={verdict.loading}
              className="ml-auto rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-40 transition-opacity"
              style={{ background: "var(--brand)", color: "oklch(0.15 0 0)" }}
            >
              {verdict.loading ? "Thinking…" : "Who's better?"}
            </button>
          )}
        </div>
      )}

      {(verdict.loading || verdict.answer || verdict.error) && (
        <Card className="surface border-0 mb-8 animate-slide-up">
          <CardHeader>
            <CardTitle className="stat-label text-sm">Verdict</CardTitle>
          </CardHeader>
          <CardContent>
            <AskAnswer {...verdict} />
          </CardContent>
        </Card>
      )}

      {loading && (
        <p className="text-muted-foreground animate-fade-in">
          Loading players...
        </p>
      )}

      {players.length >= 2 && (
        <>
          <Card className="surface border-0 mb-8 animate-slide-up">
            <CardHeader>
              <CardTitle className="stat-label text-sm">
                Player Radar · {modeLabel}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <PlayerRadar data={radarData} players={playerNames} domain="auto" />
            </CardContent>
          </Card>

          <div className="grid md:grid-cols-2 gap-6 mb-8 stagger">
            {barGroups.map((group) => (
              <Card key={group.label} className="surface border-0">
                <CardHeader>
                  <CardTitle className="stat-label text-sm">
                    {group.label}
                  </CardTitle>
                  <p className="text-xs text-muted-foreground/60">
                    {modeLabel}
                  </p>
                </CardHeader>
                <CardContent>
                  <StatBarChart data={group.data} players={playerNames} />
                </CardContent>
              </Card>
            ))}
          </div>

          <Card className="surface animate-slide-up border-0">
            <CardHeader>
              <CardTitle className="stat-label text-sm">
                All Stats · {modeLabel}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-2.5 pr-4 text-muted-foreground font-medium text-xs uppercase tracking-wider">
                        Stat
                      </th>
                      {players.map((p, i) => (
                        <th
                          key={p.slug as string}
                          className="text-right py-2.5 px-2 font-medium text-xs uppercase tracking-wider"
                          style={{ color: PLAYER_COLORS[i] }}
                        >
                          {p.player as string}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {STAT_GROUPS.map((group) => (
                      <Fragment key={group.label}>
                        <tr>
                          <td
                            colSpan={players.length + 1}
                            className="stat-label pt-5 pb-1.5"
                            style={{ color: "var(--pitch)" }}
                          >
                            {group.label}
                          </td>
                        </tr>
                        {group.stats.map((s, si) => {
                          const col = statKey(s.key, mode)
                          const vals = players.map(
                            (p) => Number(p[col]) || 0,
                          )
                          const max = Math.max(...vals)
                          return (
                            <tr
                              key={s.key}
                              className={`border-b border-border/30 ${si % 2 === 0 ? "bg-secondary/20" : ""}`}
                            >
                              <td className="py-2 pr-4 text-muted-foreground">
                                {s.label}
                              </td>
                              {players.map((p) => {
                                const v = Number(p[col]) || 0
                                const isBest =
                                  vals.length > 1 && v === max && v > 0
                                return (
                                  <td
                                    key={p.slug as string}
                                    className={`text-right py-2 px-2 font-mono tabular-nums ${isBest ? "font-bold text-foreground" : "text-muted-foreground"}`}
                                  >
                                    {formatStat(v, mode)}
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

      {players.length === 1 && !loading && (
        <p className="text-muted-foreground animate-fade-in">
          Add another player to compare.
        </p>
      )}

      {players.length === 0 && !loading && (
        <div className="text-center py-20 animate-fade-in">
          <p
            className="text-2xl font-bold tracking-tight mb-2"
            style={{ color: "var(--brand)" }}
          >
            Compare Players
          </p>
          <p className="text-muted-foreground">
            Search and add up to 3 players for side-by-side comparison
          </p>
        </div>
      )}
    </div>
  )
}
