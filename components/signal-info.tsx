"use client"

import { InfoIcon } from "lucide-react"
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover"

export function SignalInfo({
  label,
  formula,
  what,
  signifies,
  why,
}: {
  label: string
  formula: string
  what: string
  signifies: string
  why: string
}) {
  return (
    <Popover>
      <PopoverTrigger
        aria-label={`About ${label}`}
        className="inline-flex items-center justify-center size-5 rounded-full text-muted-foreground hover:text-foreground hover:bg-white/[0.06] transition-colors"
      >
        <InfoIcon className="size-3.5" />
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={6} className="w-80 gap-3">
        <div className="flex items-baseline justify-between gap-3">
          <h3
            className="text-sm font-semibold tracking-tight uppercase"
            style={{ fontFamily: "var(--font-condensed)" }}
          >
            {label}
          </h3>
          <span className="stat-label text-right truncate">{formula}</span>
        </div>
        <dl className="flex flex-col gap-2.5 text-xs leading-relaxed">
          <div>
            <dt className="stat-label mb-0.5">What it is</dt>
            <dd className="text-foreground/90">{what}</dd>
          </div>
          <div>
            <dt className="stat-label mb-0.5">What it signifies</dt>
            <dd className="text-foreground/90">{signifies}</dd>
          </div>
          <div>
            <dt className="stat-label mb-0.5">Why we track it</dt>
            <dd className="text-foreground/90">{why}</dd>
          </div>
        </dl>
      </PopoverContent>
    </Popover>
  )
}
