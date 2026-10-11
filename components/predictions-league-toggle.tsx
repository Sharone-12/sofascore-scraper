"use client"

import { useSearchParams } from "next/navigation"
import { SlidingSegment } from "@/components/sliding-segment"
import { LeagueCrest } from "@/components/player-avatar"
import { LEAGUE_TOURNAMENT_ID } from "@/lib/teams"

const FILTERS = [
  { key: "all", label: "All", full: "" },
  { key: "PL", label: "PL", full: "Premier League" },
  { key: "LL", label: "La Liga", full: "La Liga" },
  { key: "UCL", label: "UCL", full: "Champions League" },
] as const

export function PredictionsLeagueToggle({ active }: { active: string }) {
  const params = useSearchParams()

  function hrefFor(key: string): string {
    const next = new URLSearchParams(params.toString())
    if (key === "all") next.delete("league")
    else next.set("league", key)
    const qs = next.toString()
    return qs ? `/predictions?${qs}` : "/predictions"
  }

  return (
    <div className="mb-6">
      <SlidingSegment
        ariaLabel="League filter"
        activeKey={active}
        items={FILTERS.map((f) => ({
          key: f.key,
          label: f.label,
          node:
            f.full && LEAGUE_TOURNAMENT_ID[f.full] ? (
              <LeagueCrest
                tournamentId={LEAGUE_TOURNAMENT_ID[f.full]}
                name={f.full}
                size={18}
              />
            ) : undefined,
          href: hrefFor(f.key),
        }))}
      />
    </div>
  )
}
