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
import { LEAGUE_TOURNAMENT_ID } from "@/lib/teams"

export type SignalExpandRow = {
  slug: string
  player: string
  team: string
  team_id: number | null
  league: string
  value: number
}

export type SignalFmt = "signed2" | "fixed1" | "fixed2" | "pct1"

const LEAGUE_TAG: Record<string, { short: string; hue: string }> = {
  "Premier League": { short: "PL", hue: "0.78 0.13 290" },
  "La Liga": { short: "LL", hue: "0.80 0.14 60" },
  "Ligue 1": { short: "L1", hue: "0.78 0.13 240" },
  Bundesliga: { short: "BL", hue: "0.78 0.14 15" },
  "Champions League": { short: "UCL", hue: "0.78 0.14 230" },
}

function LeagueTag({ league }: { league: string }) {
  const tid = LEAGUE_TOURNAMENT_ID[league]
  if (tid) return <LeagueCrest tournamentId={tid} name={league} size={18} />
  const tag = LEAGUE_TAG[league] ?? LEAGUE_TAG["Premier League"]
  return (
    <span
      className="stat-label text-[0.6rem] px-1.5 py-0.5 rounded"
      style={{ color: `oklch(${tag.hue})`, background: `oklch(${tag.hue} / 13%)` }}
    >
      {tag.short}
    </span>
  )
}

function formatValue(v: number, fmt: SignalFmt) {
  switch (fmt) {
    case "signed2":
      return v > 0 ? `+${v.toFixed(2)}` : v.toFixed(2)
    case "fixed1":
      return v.toFixed(1)
    case "fixed2":
      return v.toFixed(2)
    case "pct1":
      return `${v.toFixed(1)}%`
  }
}

export function SignalExpand({
  label,
  formula,
  rows,
  fmt,
  scope,
}: {
  label: string
  formula: string
  rows: SignalExpandRow[]
  fmt: SignalFmt
  scope: string
}) {
  const [q, setQ] = useState("")

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return rows
    return rows.filter(
      (r) =>
        r.player.toLowerCase().includes(needle) ||
        r.team.toLowerCase().includes(needle),
    )
  }, [q, rows])

  return (
    <Dialog>
      <DialogTrigger
        aria-label={`Expand ${label}`}
        className="inline-flex items-center justify-center size-5 rounded-full text-muted-foreground hover:text-foreground hover:bg-white/[0.06] transition-colors"
      >
        <ExpandIcon className="size-3.5" />
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-5 pt-5 pb-4 border-b border-white/5 pr-14">
          <DialogTitle
            className="text-xl font-semibold tracking-tight uppercase leading-tight"
            style={{ fontFamily: "var(--font-condensed)" }}
          >
            {label}
          </DialogTitle>
          <span className="stat-label mt-1 block">{formula}</span>
          <div className="relative mt-4">
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
            <Input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search player or team…"
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
        <div className="max-h-[60vh] overflow-y-auto px-2 py-2">
          {filtered.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-muted-foreground">
              No players match.
            </p>
          ) : (
            filtered.map((p) => {
              const absoluteRank = rows.indexOf(p) + 1
              return (
                <Link
                  key={`${p.slug}-${absoluteRank}`}
                  href={`/player/${p.slug}${scope}`}
                  className="row-item flex items-center gap-3 px-3 py-2.5 rounded-xl"
                >
                  <span className="rank-badge" data-rank={absoluteRank}>
                    {absoluteRank}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-[0.9rem] font-medium leading-tight truncate">
                      {p.player}
                    </span>
                    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      {p.team_id != null && (
                        <TeamCrest teamId={p.team_id} name={p.team} size={14} />
                      )}
                      <span className="truncate">{p.team}</span>
                    </span>
                  </span>
                  <LeagueTag league={p.league} />
                  <span
                    className="stat-figure text-lg w-16 text-right shrink-0 tabular-nums"
                    style={{ color: absoluteRank <= 3 ? "var(--pitch)" : undefined }}
                  >
                    {formatValue(p.value, fmt)}
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
