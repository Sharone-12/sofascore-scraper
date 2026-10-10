"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react"
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
      <section className="surface rounded-2xl bg-card px-6 py-5 h-[230px] flex items-center justify-center">
        <span className="stat-label">No upcoming matches this week.</span>
      </section>
    )
  }

  const m = matches[i]
  const tid = LEAGUE_TOURNAMENT_ID[m.league]

  return (
    <section
      className={`surface rounded-2xl overflow-hidden ${
        m.home === "FC Barcelona" || m.away === "FC Barcelona"
          ? "barca-stripes"
          : "bg-card"
      }`}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <header className="flex items-center justify-between px-6 pt-5 pb-2">
        <h2
          className="text-lg font-semibold tracking-tight uppercase"
          style={{ fontFamily: "var(--font-condensed)" }}
        >
          This week
        </h2>
        <div className="flex items-center gap-2">
          <span className="stat-label text-xs tabular-nums">
            {i + 1} / {matches.length}
          </span>
          <div className="flex items-center gap-0.5 ml-1">
            <button
              type="button"
              aria-label="Previous match"
              onClick={() =>
                setI((x) => (x - 1 + matches.length) % matches.length)
              }
              className="inline-flex items-center justify-center size-6 rounded-full text-muted-foreground hover:text-foreground hover:bg-white/[0.06] transition-colors"
            >
              <ChevronLeftIcon className="size-4" />
            </button>
            <button
              type="button"
              aria-label="Next match"
              onClick={() => setI((x) => (x + 1) % matches.length)}
              className="inline-flex items-center justify-center size-6 rounded-full text-muted-foreground hover:text-foreground hover:bg-white/[0.06] transition-colors"
            >
              <ChevronRightIcon className="size-4" />
            </button>
          </div>
        </div>
      </header>
      <div className="px-3 pb-4 h-[170px]">
        <Link
          key={m.event_id}
          href={`/predictions/match?id=${m.event_id}`}
          className="card-lift animate-in fade-in slide-in-from-right-3 duration-500 flex flex-col justify-center gap-3 px-4 py-4 rounded-xl h-full"
        >
          <div className="flex items-center justify-between gap-3">
            <span className="stat-label text-xs">{formatWhen(m.date)}</span>
            {tid && <LeagueCrest tournamentId={tid} name={m.league} size={20} />}
          </div>
          <div className="flex items-center gap-4">
            <div className="flex-1 min-w-0 flex items-center gap-2.5">
              {m.home_id != null && (
                <TeamCrest teamId={m.home_id} name={m.home} size={32} />
              )}
              <span className="truncate font-semibold text-[0.95rem]">{m.home}</span>
            </div>
            <span
              className="stat-figure text-xl text-muted-foreground shrink-0"
              style={{ color: "var(--pitch)" }}
            >
              vs
            </span>
            <div className="flex-1 min-w-0 flex items-center gap-2.5 justify-end text-right">
              <span className="truncate font-semibold text-[0.95rem]">{m.away}</span>
              {m.away_id != null && (
                <TeamCrest teamId={m.away_id} name={m.away} size={32} />
              )}
            </div>
          </div>
        </Link>
      </div>
    </section>
  )
}
