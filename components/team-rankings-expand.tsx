"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { ExpandIcon, SearchIcon, XIcon } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { TeamCrest, LeagueCrest } from "@/components/player-avatar"
import { LEAGUE_ABBR, LEAGUE_TOURNAMENT_ID } from "@/lib/teams"

export type RankedTeamRow = {
  team: string
  league: string
  score: number
  ppg: number
  gd: number
  played: number
  href: string
}

export function TeamRankingsExpand({
  rows,
  teamIds,
}: {
  rows: RankedTeamRow[]
  teamIds: Map<string, number>
}) {
  const [q, setQ] = useState("")
  const maxScore = rows[0]?.score ?? 1
  const displayRating = (raw: number) => 60 + (raw / maxScore) * 39

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return rows
    return rows.filter(
      (r) =>
        r.team.toLowerCase().includes(needle) ||
        r.league.toLowerCase().includes(needle),
    )
  }, [q, rows])

  return (
    <Dialog>
      <DialogTrigger
        aria-label="Expand Power Rankings"
        className="inline-flex items-center justify-center size-6 rounded-full text-muted-foreground hover:text-foreground hover:bg-white/[0.06] transition-colors"
      >
        <ExpandIcon className="size-4" />
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-5 pt-5 pb-4 border-b border-white/5 pr-14">
          <DialogTitle
            className="text-xl font-semibold tracking-tight uppercase leading-tight"
            style={{ fontFamily: "var(--font-condensed)" }}
          >
            Power Rankings
          </DialogTitle>
          <span className="stat-label mt-1 block">
            {rows.length} teams · ppg + goal diff + xG
          </span>
          <div className="relative mt-4">
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
            <Input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search team or league…"
              className="pl-9 pr-9 h-9"
            />
            {q && (
              <button
                type="button"
                aria-label="Clear"
                onClick={() => setQ("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex items-center justify-center size-6 rounded-full text-muted-foreground hover:text-foreground hover:bg-white/[0.06]"
              >
                <XIcon className="size-3.5" />
              </button>
            )}
          </div>
        </DialogHeader>
        <div className="max-h-[65vh] overflow-y-auto px-2 py-2">
          {filtered.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-muted-foreground">
              No teams match.
            </p>
          ) : (
            filtered.map((t) => {
              const absoluteRank = rows.indexOf(t) + 1
              const tid = LEAGUE_TOURNAMENT_ID[t.league]
              return (
                <Link
                  key={`${t.team}-${t.league}`}
                  href={t.href}
                  className="row-item flex items-center gap-3 px-3 py-2.5 rounded-xl"
                >
                  <span className="rank-badge" data-rank={absoluteRank}>
                    {absoluteRank}
                  </span>
                  {teamIds.get(t.team) != null && (
                    <TeamCrest teamId={teamIds.get(t.team)!} name={t.team} size={22} />
                  )}
                  <span className="flex-1 min-w-0">
                    <span className="block text-[0.9rem] font-medium leading-tight truncate">
                      {t.team}
                    </span>
                    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      {tid ? (
                        <LeagueCrest tournamentId={tid} name={t.league} size={14} />
                      ) : null}
                      <span className="truncate">{LEAGUE_ABBR[t.league] ?? t.league}</span>
                    </span>
                  </span>
                  <span className="text-right shrink-0 hidden sm:block">
                    <span className="stat-figure text-sm block tabular-nums">
                      {t.ppg.toFixed(2)}
                    </span>
                    <span className="stat-label">ppg</span>
                  </span>
                  <span className="text-right shrink-0 hidden sm:block w-10">
                    <span
                      className="stat-figure text-sm block tabular-nums"
                      style={{
                        color: t.gd > 0 ? "var(--pitch)" : t.gd < 0 ? "oklch(0.65 0.14 25)" : undefined,
                      }}
                    >
                      {t.gd > 0 ? "+" : ""}{t.gd}
                    </span>
                    <span className="stat-label">gd</span>
                  </span>
                  <span
                    className="stat-figure text-lg w-14 text-right shrink-0 tabular-nums"
                    style={{ color: absoluteRank <= 3 ? "var(--pitch)" : undefined }}
                  >
                    {displayRating(t.score).toFixed(1)}
                  </span>
                </Link>
              )
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
