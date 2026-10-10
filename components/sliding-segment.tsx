"use client"

import { useLayoutEffect, useRef, useState } from "react"

export type SegmentItem = {
  key: string
  label: string
  onPick: () => void
}

/**
 * Button-based segmented control with a measured sliding pill behind the
 * active (or hovered) item, matching MainNav.
 */
export function SlidingSegment({
  items,
  activeKey,
  ariaLabel,
}: {
  items: SegmentItem[]
  activeKey: string
  ariaLabel: string
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([])
  const [pill, setPill] = useState<{ x: number; w: number } | null>(null)
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null)

  const activeIdx = items.findIndex((it) => it.key === activeKey)
  const targetIdx = hoveredIdx ?? (activeIdx >= 0 ? activeIdx : 0)

  useLayoutEffect(() => {
    const container = containerRef.current
    const el = itemRefs.current[targetIdx]
    if (!container || !el) {
      setPill(null)
      return
    }
    const c = container.getBoundingClientRect()
    const e = el.getBoundingClientRect()
    setPill({ x: e.left - c.left, w: e.width })
  }, [targetIdx, activeKey])

  useLayoutEffect(() => {
    function onResize() {
      const container = containerRef.current
      const el = itemRefs.current[targetIdx]
      if (!container || !el) return
      const c = container.getBoundingClientRect()
      const e = el.getBoundingClientRect()
      setPill({ x: e.left - c.left, w: e.width })
    }
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [targetIdx])

  return (
    <div
      ref={containerRef}
      className="segment relative inline-flex rounded-full p-1 gap-0.5"
      role="group"
      aria-label={ariaLabel}
      onMouseLeave={() => setHoveredIdx(null)}
    >
      {pill && (
        <span
          aria-hidden
          className="absolute top-1 bottom-1 rounded-full bg-white/[0.08] shadow-[inset_0_1px_0_oklch(1_0_0_/_14%)] transition-[transform,width] duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)]"
          style={{ transform: `translateX(${pill.x - 4}px)`, width: pill.w }}
        />
      )}
      {items.map((it, i) => {
        const active = i === activeIdx
        return (
          <button
            key={it.key}
            type="button"
            aria-pressed={active}
            ref={(el) => {
              itemRefs.current[i] = el
            }}
            onMouseEnter={() => setHoveredIdx(i)}
            onFocus={() => setHoveredIdx(i)}
            onBlur={() => setHoveredIdx(null)}
            onClick={it.onPick}
            data-active={active || undefined}
            className="relative z-10 px-2.5 py-1.5 rounded-full text-xs font-medium tabular-nums text-muted-foreground hover:text-foreground transition-colors duration-200 data-[active]:text-foreground"
          >
            {it.label}
          </button>
        )
      })}
    </div>
  )
}
