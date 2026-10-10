"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { TeamCrest, LeagueCrest } from "@/components/player-avatar"
import { LEAGUE_TOURNAMENT_ID } from "@/lib/teams"

export type UpcomingMatch = {
  event_id: number
  date: string
  league: string
  home: string
  home_id: number | null
  away: string
  away_id: number | null
}

function formatWhen(iso: string) {
  const d = new Date(iso + "T12:00:00")
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })
}

const SLOT_MS = 4000

export function UpcomingTicker({ matches }: { matches: UpcomingMatch[] }) {
  const [i, setI] = useState(0)
  const [paused, setPaused] = useState(false)

  useEffect(() => {
    if (matches.length <= 1 || paused) return
    const t = setInterval(() => setI((x) => (x + 1) % matches.length), SLOT_MS)
    return () => clearInterval(t)
  }, [matches.length, paused])

  if (matches.length === 0) {
    return (
      <section className="surface rounded-2xl bg-card px-5 py-4 h-[108px] flex items-center">
        <span className="stat-label">No upcoming matches this week.</span>
      </section>
    )
  }

  const m = matches[i]
  const tid = LEAGUE_TOURNAMENT_ID[m.league]

  return (
    <section
      className="surface rounded-2xl bg-card overflow-hidden"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <header className="flex items-baseline justify-between px-5 pt-4 pb-1">
        <h2
          className="text-sm font-semibold tracking-tight uppercase"
          style={{ fontFamily: "var(--font-condensed)" }}
        >
          This week
        </h2>
        <span className="stat-label">
          {i + 1} / {matches.length}
        </span>
      </header>
      <div className="px-2 pb-2 h-[68px]">
        <Link
          key={m.event_id}
          href={`/predictions/match?event=${m.event_id}`}
          className="row-item animate-in fade-in slide-in-from-right-3 duration-500 flex items-center gap-3 px-3 py-2.5 rounded-xl h-full"
        >
          <span className="stat-label w-14 shrink-0">{formatWhen(m.date)}</span>
          <span className="flex-1 min-w-0 flex items-center gap-2">
            {m.home_id != null && (
              <TeamCrest teamId={m.home_id} name={m.home} size={20} />
            )}
            <span className="truncate text-sm font-medium">{m.home}</span>
            <span className="text-muted-foreground text-xs">vs</span>
            {m.away_id != null && (
              <TeamCrest teamId={m.away_id} name={m.away} size={20} />
            )}
            <span className="truncate text-sm font-medium">{m.away}</span>
          </span>
          {tid && <LeagueCrest tournamentId={tid} name={m.league} size={16} />}
        </Link>
      </div>
    </section>
  )
}
