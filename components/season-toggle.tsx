"use client"

import { usePathname, useSearchParams } from "next/navigation"
import { SEASONS, resolveSeason, shortSeason } from "@/lib/seasons"
import { SlidingSegment } from "@/components/sliding-segment"

/**
 * Switches season by rewriting ?season= on the current page via <Link> so
 * Next.js prefetches and the pill locks in on click.
 */
export function SeasonToggle() {
  const pathname = usePathname()
  const params = useSearchParams()
  const current = resolveSeason(params.get("season"))

  function hrefFor(season: string): string {
    const next = new URLSearchParams(params.toString())
    if (season === SEASONS[0]) next.delete("season")
    else next.set("season", season)
    const qs = next.toString()
    return qs ? `${pathname}?${qs}` : pathname
  }

  return (
    <SlidingSegment
      ariaLabel="Season"
      activeKey={current}
      items={SEASONS.map((s) => ({
        key: s,
        label: shortSeason(s),
        href: hrefFor(s),
      }))}
    />
  )
}
