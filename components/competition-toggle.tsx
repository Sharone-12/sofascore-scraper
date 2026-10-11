"use client"

import { usePathname, useSearchParams } from "next/navigation"
import {
  COMPETITIONS,
  COMPETITION_LABEL,
  DEFAULT_COMPETITION,
  resolveCompetition,
} from "@/lib/competition"
import { SlidingSegment } from "@/components/sliding-segment"

/**
 * League / UCL switch. Rewrites ?comp= on the current page via <Link>, keeping
 * every other param, the same way SeasonToggle handles ?season=.
 */
export function CompetitionToggle() {
  const pathname = usePathname()
  const params = useSearchParams()
  const current = resolveCompetition(params.get("comp"))

  function hrefFor(comp: string): string {
    const next = new URLSearchParams(params.toString())
    if (comp === DEFAULT_COMPETITION) next.delete("comp")
    else next.set("comp", comp)
    const qs = next.toString()
    return qs ? `${pathname}?${qs}` : pathname
  }

  return (
    <SlidingSegment
      ariaLabel="Competition"
      activeKey={current}
      items={COMPETITIONS.map((c) => ({
        key: c,
        label: COMPETITION_LABEL[c],
        href: hrefFor(c),
      }))}
    />
  )
}
