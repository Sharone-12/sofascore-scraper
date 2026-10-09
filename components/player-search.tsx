"use client"

import { useState, useEffect, useRef, useMemo, useCallback } from "react"
import { Input } from "@/components/ui/input"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { SearchIcon, XIcon, Loader2 } from "lucide-react"
import {
  searchPlayers,
  LEAGUE_CODES,
  LEAGUE_SHORT,
  type IndexedPlayer,
  type Ranked,
} from "@/lib/search"

// One hue per league, reused for the label and a 13% background wash.
const LEAGUE_HUE: Record<number, string> = {
  0: "0.78 0.13 290", // Premier League — violet
  1: "0.80 0.14 60", // La Liga — amber
  2: "0.78 0.13 240", // Ligue 1 — blue
  3: "0.78 0.14 15", // Bundesliga — red
  4: "0.78 0.14 230", // Champions League — blue
}

type SearchResult = {
  player_id: number
  player: string
  slug: string
  team: string
  position: string
  league: string
}

// Shared across every mounted search box, and kept for the life of the tab:
// the index is ~70 kB and only changes when the daily refresh runs.
let indexCache: IndexedPlayer[] | null = null
let indexPromise: Promise<IndexedPlayer[]> | null = null

function loadIndex(): Promise<IndexedPlayer[]> {
  if (indexCache) return Promise.resolve(indexCache)
  if (!indexPromise) {
    indexPromise = fetch("/api/players")
      .then((r) => r.json())
      .then((j) => {
        indexCache = j.players ?? []
        return indexCache!
      })
      .catch(() => {
        indexPromise = null // let a later keystroke retry
        return []
      })
  }
  return indexPromise
}

function toResult(p: Ranked): SearchResult {
  return {
    player_id: p.i,
    player: p.n,
    slug: p.s,
    team: p.t,
    position: p.p,
    league: LEAGUE_CODES[p.l] ?? LEAGUE_CODES[0],
  }
}

function Highlight({ text, hit }: { text: string; hit: [number, number] | null }) {
  if (!hit) return <>{text}</>
  return (
    <>
      {text.slice(0, hit[0])}
      <mark className="bg-transparent text-primary font-semibold">
        {text.slice(hit[0], hit[1])}
      </mark>
      {text.slice(hit[1])}
    </>
  )
}

export function PlayerSearch({
  onSelect,
  placeholder = "Search players...",
  linkToProfile = false,
}: {
  onSelect?: (player: SearchResult) => void
  placeholder?: string
  linkToProfile?: boolean
}) {
  const router = useRouter()
  const [query, setQuery] = useState("")
  const [index, setIndex] = useState<IndexedPlayer[] | null>(indexCache)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const ref = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // Warm the index on mount so the first keystroke is already instant.
  useEffect(() => {
    let alive = true
    loadIndex().then((p) => {
      if (alive) setIndex(p)
    })
    return () => {
      alive = false
    }
  }, [])

  const results = useMemo(
    () => (index && query.trim() ? searchPlayers(index, query) : []),
    [index, query],
  )

  useEffect(() => setActive(0), [query])

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", onClickOutside)
    return () => document.removeEventListener("mousedown", onClickOutside)
  }, [])

  const choose = useCallback(
    (p: Ranked) => {
      setOpen(false)
      setQuery("")
      if (linkToProfile) router.push(`/player/${p.s}`)
      else onSelect?.(toResult(p))
    },
    [linkToProfile, onSelect, router],
  )

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      setOpen(false)
      return
    }
    if (!open || results.length === 0) return
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault()
      const next =
        e.key === "ArrowDown"
          ? (active + 1) % results.length
          : (active - 1 + results.length) % results.length
      setActive(next)
      listRef.current
        ?.querySelectorAll("[data-row]")
        [next]?.scrollIntoView({ block: "nearest" })
      return
    }
    if (e.key === "Enter") {
      e.preventDefault()
      choose(results[active])
    }
  }

  const loading = index === null
  const showPanel = open && query.trim().length > 0

  return (
    <div ref={ref} className="relative z-50 w-full">
      <div className="relative group">
        <SearchIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 h-[18px] w-[18px] text-muted-foreground pointer-events-none transition-colors group-focus-within:text-primary" />
        <Input
          placeholder={placeholder}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          role="combobox"
          aria-expanded={showPanel}
          aria-controls="player-search-results"
          autoComplete="off"
          spellCheck={false}
          className="w-full pl-10 pr-10 h-12 rounded-xl bg-card border-white/10 hover:border-white/20 focus-visible:border-white/25 focus-visible:ring-0 outline-none transition-all text-base"
        />
        {query && (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => {
              setQuery("")
              setOpen(false)
            }}
            className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground rounded-full hover:bg-white/10 transition-colors p-1"
          >
            <XIcon className="h-4 w-4" />
          </button>
        )}
      </div>

      {showPanel && (
        <div
          id="player-search-results"
          className="surface-raised absolute z-50 mt-2 w-full rounded-xl bg-popover text-popover-foreground overflow-hidden animate-slide-down"
        >
          {loading ? (
            <div className="flex items-center justify-center gap-2 p-4 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading players…
            </div>
          ) : results.length === 0 ? (
            <div className="p-4 text-center text-sm text-muted-foreground">
              No players match “{query}”
            </div>
          ) : (
            <>
              <div
                ref={listRef}
                className="py-1 max-h-[330px] overflow-y-auto"
                role="listbox"
              >
                {results.map((p, i) => {
                  const row = (
                    <div
                      data-row
                      role="option"
                      aria-selected={i === active}
                      onMouseEnter={() => setActive(i)}
                      className={`flex items-center justify-between gap-3 px-4 py-2.5 cursor-pointer transition-colors duration-100 ${
                        i === active ? "bg-white/[0.07]" : ""
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">
                          <Highlight text={p.n} hit={p.hit} />
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5 flex gap-1.5 items-center">
                          <span className="truncate">{p.t}</span>
                          {p.p && (
                            <>
                              <span className="w-1 h-1 rounded-full bg-white/20 shrink-0" />
                              <span className="shrink-0">{p.p}</span>
                            </>
                          )}
                        </div>
                      </div>
                      <span
                        className="stat-label shrink-0 px-1.5 py-0.5 rounded"
                        style={{
                          color: `oklch(${LEAGUE_HUE[p.l] ?? LEAGUE_HUE[0]})`,
                          background: `oklch(${LEAGUE_HUE[p.l] ?? LEAGUE_HUE[0]} / 13%)`,
                        }}
                      >
                        {LEAGUE_SHORT[p.l] ?? LEAGUE_SHORT[0]}
                      </span>
                    </div>
                  )

                  return linkToProfile ? (
                    <Link
                      key={p.i}
                      href={`/player/${p.s}`}
                      onClick={() => {
                        setOpen(false)
                        setQuery("")
                      }}
                      className="block"
                    >
                      {row}
                    </Link>
                  ) : (
                    <div key={p.i} onClick={() => choose(p)}>
                      {row}
                    </div>
                  )
                })}
              </div>
              <div className="flex items-center gap-3 px-4 py-2 border-t border-white/5 stat-label">
                <span>↑↓ navigate</span>
                <span>↵ open</span>
                <span>esc close</span>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
