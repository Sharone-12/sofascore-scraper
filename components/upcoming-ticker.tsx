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

function Row({ m }: { m: UpcomingMatch }) {
  const tid = LEAGUE_TOURNAMENT_ID[m.league]
  return (
    <Link
      href={`/predictions/match?event=${m.event_id}`}
      className="row-item flex items-center gap-3 px-3 py-2.5 rounded-xl"
    >
      <span className="stat-label w-14 shrink-0">{formatWhen(m.date)}</span>
      <span className="flex-1 min-w-0 flex items-center gap-2">
        {m.home_id != null && <TeamCrest teamId={m.home_id} name={m.home} size={18} />}
        <span className="truncate text-sm">{m.home}</span>
        <span className="text-muted-foreground text-xs">vs</span>
        {m.away_id != null && <TeamCrest teamId={m.away_id} name={m.away} size={18} />}
        <span className="truncate text-sm">{m.away}</span>
      </span>
      {tid && <LeagueCrest tournamentId={tid} name={m.league} size={16} />}
    </Link>
  )
}

/**
 * Vertical ticker. Doubles the row list so the keyframe can translate -50%
 * for a seamless loop (jumps back to 0 at loop end, visually identical).
 * Pure CSS; the whole thing is server-rendered and interactive without JS.
 */
export function UpcomingTicker({ matches }: { matches: UpcomingMatch[] }) {
  if (matches.length === 0) return null
  const loop = [...matches, ...matches]
  const duration = `${matches.length * 2.6}s`

  return (
    <section className="surface rounded-2xl bg-card overflow-hidden h-[260px] relative">
      <header className="flex items-baseline justify-between px-5 pt-4 pb-2">
        <h2
          className="text-sm font-semibold tracking-tight uppercase"
          style={{ fontFamily: "var(--font-condensed)" }}
        >
          Upcoming
        </h2>
        <span className="stat-label">next {matches.length}</span>
      </header>
      <div
        className="absolute inset-x-0 top-10 bottom-0 overflow-hidden"
        style={{
          maskImage:
            "linear-gradient(to bottom, transparent 0, black 12%, black 88%, transparent 100%)",
          WebkitMaskImage:
            "linear-gradient(to bottom, transparent 0, black 12%, black 88%, transparent 100%)",
        }}
      >
        <div
          className="px-2 ticker-track"
          style={{ animation: `ticker ${duration} linear infinite` }}
        >
          {loop.map((m, i) => (
            <Row key={`${m.event_id}-${i}`} m={m} />
          ))}
        </div>
      </div>
    </section>
  )
}
