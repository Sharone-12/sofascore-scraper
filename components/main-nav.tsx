"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useLayoutEffect, useRef, useState } from "react"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"

const LINKS = [
  { href: "/", label: "Players", hint: "Top scorers & assists" },
  { href: "/teams", label: "Teams", hint: "Standings & power rankings" },
  { href: "/signals", label: "Signals", hint: "Derived metrics only we track" },
  { href: "/predictions", label: "Predict", hint: "Match predictions" },
  { href: "/compare", label: "Compare", hint: "Side-by-side player stats" },
]

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/"
  return pathname === href || pathname.startsWith(`${href}/`)
}

/**
 * SSR fallback — same shape as MainNav but with no active pill (needs
 * usePathname, which blocks prerender under Next 16 Cache Components).
 * Rendered until the client component streams in.
 */
export function MainNavFallback() {
  return (
    <div className="segment relative flex rounded-full p-1 gap-0.5">
      {LINKS.map((l) => (
        <span
          key={l.href}
          className="relative z-10 px-3.5 sm:px-4 py-1.5 rounded-full text-sm font-medium text-muted-foreground"
        >
          {l.label}
        </span>
      ))}
    </div>
  )
}

export function MainNav() {
  const pathname = usePathname()
  const containerRef = useRef<HTMLDivElement>(null)
  const itemRefs = useRef<Array<HTMLAnchorElement | null>>([])
  const [pill, setPill] = useState<{ x: number; w: number } | null>(null)
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null)

  const activeIdx = LINKS.findIndex((l) => isActive(pathname, l.href))
  const targetIdx = hoveredIdx ?? activeIdx

  // Measure after layout so the pill lands on the right item on first paint
  // and re-measures on route change or window resize.
  useLayoutEffect(() => {
    const container = containerRef.current
    const el = itemRefs.current[targetIdx]
    if (!container || !el) {
      setPill(null)
      return
    }
    const cRect = container.getBoundingClientRect()
    const eRect = el.getBoundingClientRect()
    setPill({ x: eRect.left - cRect.left, w: eRect.width })
  }, [targetIdx, pathname])

  useLayoutEffect(() => {
    function onResize() {
      const container = containerRef.current
      const el = itemRefs.current[targetIdx]
      if (!container || !el) return
      const cRect = container.getBoundingClientRect()
      const eRect = el.getBoundingClientRect()
      setPill({ x: eRect.left - cRect.left, w: eRect.width })
    }
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [targetIdx])

  return (
    <div
      ref={containerRef}
      className="segment relative flex rounded-full p-1 gap-0.5"
      onMouseLeave={() => setHoveredIdx(null)}
    >
      {pill && (
        <span
          aria-hidden
          className="absolute top-1 bottom-1 rounded-full bg-white/[0.08] shadow-[inset_0_1px_0_oklch(1_0_0_/_14%)] transition-[transform,width] duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)]"
          style={{
            transform: `translateX(${pill.x - 4}px)`,
            width: pill.w,
          }}
        />
      )}
      {LINKS.map((l, i) => {
        const active = i === activeIdx
        return (
          <Tooltip key={l.href}>
            <TooltipTrigger
              render={
                <Link
                  ref={(el) => {
                    itemRefs.current[i] = el
                  }}
                  href={l.href}
                  onMouseEnter={() => setHoveredIdx(i)}
                  onFocus={() => setHoveredIdx(i)}
                  onBlur={() => setHoveredIdx(null)}
                  data-active={active || undefined}
                  className="relative z-10 px-3.5 sm:px-4 py-1.5 rounded-full text-sm font-medium text-muted-foreground hover:text-foreground transition-colors duration-200 data-[active]:text-foreground"
                >
                  {l.label}
                </Link>
              }
            />
            <TooltipContent sideOffset={8}>{l.hint}</TooltipContent>
          </Tooltip>
        )
      })}
    </div>
  )
}
