"use client"

import { useRouter, usePathname, useSearchParams } from "next/navigation"
import { SEASONS, resolveSeason, shortSeason } from "@/lib/seasons"
import { SlidingSegment } from "@/components/sliding-segment"

/**
 * Switches season by rewriting ?season= on the current page, so it works on
 * every route without each one needing its own control. The default season
 * drops the param entirely, keeping the common URL clean and shareable.
 */
export function SeasonToggle() {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const current = resolveSeason(params.get("season"))

  function pick(season: string) {
    if (season === current) return
    const next = new URLSearchParams(params.toString())
    if (season === SEASONS[0]) next.delete("season")
    else next.set("season", season)
    const qs = next.toString()
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }

  return (
    <SlidingSegment
      ariaLabel="Season"
      activeKey={current}
      items={SEASONS.map((s) => ({
        key: s,
        label: shortSeason(s),
        onPick: () => pick(s),
      }))}
    />
  )
}
