"use client"

import { useRouter, usePathname, useSearchParams } from "next/navigation"
import {
  COMPETITIONS,
  COMPETITION_LABEL,
  DEFAULT_COMPETITION,
  resolveCompetition,
} from "@/lib/competition"
import { SlidingSegment } from "@/components/sliding-segment"

/**
 * League / UCL switch. Rewrites ?comp= on the current page, keeping every other
 * param, the same way SeasonToggle handles ?season=.
 */
export function CompetitionToggle() {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const current = resolveCompetition(params.get("comp"))

  function pick(comp: string) {
    if (comp === current) return
    const next = new URLSearchParams(params.toString())
    if (comp === DEFAULT_COMPETITION) next.delete("comp")
    else next.set("comp", comp)
    const qs = next.toString()
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }

  return (
    <SlidingSegment
      ariaLabel="Competition"
      activeKey={current}
      items={COMPETITIONS.map((c) => ({
        key: c,
        label: COMPETITION_LABEL[c],
        onPick: () => pick(c),
      }))}
    />
  )
}
