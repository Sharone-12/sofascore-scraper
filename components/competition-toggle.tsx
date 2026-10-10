"use client"

import { useRouter, usePathname, useSearchParams } from "next/navigation"
import {
  COMPETITIONS,
  COMPETITION_LABEL,
  DEFAULT_COMPETITION,
  resolveCompetition,
} from "@/lib/competition"

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
    <div
      className="segment inline-flex rounded-full p-1 gap-0.5"
      role="group"
      aria-label="Competition"
    >
      {COMPETITIONS.map((c) => (
        <button
          key={c}
          type="button"
          aria-pressed={c === current}
          onClick={() => pick(c)}
          className={`px-3.5 py-1.5 rounded-full text-xs font-medium transition-colors duration-200 ${
            c === current
              ? "bg-white/10 text-foreground"
              : "text-muted-foreground hover:text-foreground hover:bg-white/5"
          }`}
        >
          {COMPETITION_LABEL[c]}
        </button>
      ))}
    </div>
  )
}
