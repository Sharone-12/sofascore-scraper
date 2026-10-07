"use client"

import { useRouter, usePathname, useSearchParams } from "next/navigation"
import { SEASONS, resolveSeason, shortSeason } from "@/lib/seasons"

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
    <div
      className="segment flex rounded-full p-1 gap-0.5"
      role="group"
      aria-label="Season"
    >
      {SEASONS.map((s) => (
        <button
          key={s}
          type="button"
          aria-pressed={s === current}
          onClick={() => pick(s)}
          className={`px-2.5 py-1.5 rounded-full text-xs font-medium tabular-nums transition-colors duration-200 ${
            s === current
              ? "bg-white/10 text-foreground"
              : "text-muted-foreground hover:text-foreground hover:bg-white/5"
          }`}
        >
          {shortSeason(s)}
        </button>
      ))}
    </div>
  )
}
