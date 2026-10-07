"use client"

import { useState, useEffect, useRef } from "react"
import { Input } from "@/components/ui/input"
import { supabase } from "@/lib/supabase"
import Link from "next/link"

type SearchResult = {
  player_id: number
  player: string
  slug: string
  team: string
  position: string
  league: string
  season: string
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
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<SearchResult[]>([])
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (query.length < 2) {
      setResults([])
      setOpen(false)
      return
    }
    const timeout = setTimeout(async () => {
      const { data } = await supabase
        .from("players")
        .select("player_id, player, slug, team, position, league, season")
        .ilike("player", `%${query}%`)
        .order("season", { ascending: false })
        .order("minutes", { ascending: false })
        .limit(20)

      const seen = new Set<number>()
      const unique = (data || []).filter((p) => {
        if (seen.has(p.player_id)) return false
        seen.add(p.player_id)
        return true
      }).slice(0, 8)

      setResults(unique)
      setOpen(true)
    }, 300)
    return () => clearTimeout(timeout)
  }, [query])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  return (
    <div ref={ref} className="relative w-full">
      <Input
        placeholder={placeholder}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="w-full"
      />
      {open && results.length > 0 && (
        <div className="absolute z-50 mt-1 w-full rounded-lg border bg-popover shadow-lg overflow-hidden">
          {results.map((p) => {
            const content = (
              <div className="flex items-center justify-between px-3 py-2.5 hover:bg-accent cursor-pointer transition-colors">
                <div>
                  <div className="font-medium text-sm">{p.player}</div>
                  <div className="text-xs text-muted-foreground">
                    {p.team} · {p.position} · {p.league}
                  </div>
                </div>
              </div>
            )
            if (linkToProfile) {
              return (
                <Link
                  key={p.player_id}
                  href={`/player/${p.slug}`}
                  onClick={() => {
                    setOpen(false)
                    setQuery("")
                  }}
                >
                  {content}
                </Link>
              )
            }
            return (
              <div
                key={p.player_id}
                onClick={() => {
                  onSelect?.(p)
                  setOpen(false)
                  setQuery("")
                }}
              >
                {content}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
