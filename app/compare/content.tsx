"use client"

import { useState, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { STAT_GROUPS, PLAYER_COLORS } from "@/lib/stats"
import { PlayerSearch } from "@/components/player-search"
import { StatBarChart } from "@/components/charts"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

type Player = Record<string, string | number | null>

export default function CompareContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [players, setPlayers] = useState<Player[]>([])
  const [loading, setLoading] = useState(false)

  const slugParam = searchParams.get("players")
  const slugs = slugParam?.split(",").filter(Boolean) || []

  useEffect(() => {
    if (slugs.length === 0) {
      setPlayers([])
      return
    }
    setLoading(true)
    supabase
      .from("players")
      .select("*")
      .in("slug", slugs)
      .order("season", { ascending: false })
      .then(({ data }) => {
        const seen = new Set<string>()
        const unique = (data || []).filter((p) => {
          const s = p.slug as string
          if (seen.has(s)) return false
          seen.add(s)
          return true
        })
        const ordered = slugs
          .map((s) => unique.find((p) => p.slug === s))
          .filter(Boolean) as Player[]
        setPlayers(ordered)
        setLoading(false)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slugParam])

  function addPlayer(p: { slug: string }) {
    if (slugs.includes(p.slug) || slugs.length >= 3) return
    const next = [...slugs, p.slug]
    router.push(`/compare?players=${next.join(",")}`, { scroll: false })
  }

  function removePlayer(slug: string) {
    const next = slugs.filter((s) => s !== slug)
    router.push(
      next.length ? `/compare?players=${next.join(",")}` : "/compare",
      { scroll: false },
    )
  }

  const playerNames = players.map((p) => p.player as string)

  const barGroups = STAT_GROUPS.map((group) => ({
    label: group.label,
    data: group.stats.map((s) => {
      const row: Record<string, string | number> = { stat: s.label }
      players.forEach((p) => {
        row[p.player as string] = Number(p[s.key]) || 0
      })
      return row
    }),
  }))

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="text-3xl font-bold mb-6">Compare Players</h1>

      <div className="max-w-md mb-6">
        <PlayerSearch
          onSelect={addPlayer}
          placeholder={
            slugs.length >= 3 ? "Max 3 players" : "Add a player..."
          }
        />
      </div>

      {players.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-8">
          {players.map((p, i) => (
            <Badge
              key={p.slug as string}
              variant="outline"
              className="text-sm py-1.5 px-3 cursor-pointer hover:bg-accent transition-colors"
              style={{ borderColor: PLAYER_COLORS[i] }}
              onClick={() => removePlayer(p.slug as string)}
            >
              <span className="mr-2" style={{ color: PLAYER_COLORS[i] }}>
                ●
              </span>
              {p.player as string}
              <span className="ml-2 text-muted-foreground">×</span>
            </Badge>
          ))}
        </div>
      )}

      {loading && (
        <p className="text-muted-foreground">Loading players...</p>
      )}

      {players.length >= 2 && (
        <>
          <div className="grid md:grid-cols-2 gap-6 mb-8">
            {barGroups.map((group) => (
              <Card key={group.label}>
                <CardHeader>
                  <CardTitle className="text-lg">{group.label}</CardTitle>
                  <p className="text-xs text-muted-foreground">
                    per 90 minutes
                  </p>
                </CardHeader>
                <CardContent>
                  <StatBarChart data={group.data} players={playerNames} />
                </CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">All Stats</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-2 pr-4 text-muted-foreground font-medium">
                        Stat
                      </th>
                      {players.map((p, i) => (
                        <th
                          key={p.slug as string}
                          className="text-right py-2 px-2 font-medium"
                          style={{ color: PLAYER_COLORS[i] }}
                        >
                          {p.player as string}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {STAT_GROUPS.flatMap((group) =>
                      group.stats.map((s) => {
                        const vals = players.map(
                          (p) => Number(p[s.key]) || 0,
                        )
                        const max = Math.max(...vals)
                        return (
                          <tr
                            key={s.key}
                            className="border-b border-border/50"
                          >
                            <td className="py-1.5 pr-4 text-muted-foreground">
                              {s.label}
                            </td>
                            {players.map((p, i) => {
                              const v = Number(p[s.key]) || 0
                              const isBest =
                                vals.length > 1 && v === max && v > 0
                              return (
                                <td
                                  key={p.slug as string}
                                  className={`text-right py-1.5 px-2 font-mono ${isBest ? "font-bold text-foreground" : "text-muted-foreground"}`}
                                >
                                  {v.toFixed(2)}
                                </td>
                              )
                            })}
                          </tr>
                        )
                      }),
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {players.length === 1 && !loading && (
        <p className="text-muted-foreground">
          Add another player to compare.
        </p>
      )}

      {players.length === 0 && !loading && (
        <div className="text-center py-16 text-muted-foreground">
          <p className="text-lg mb-2">Search and add players to compare</p>
          <p className="text-sm">Compare up to 3 players side by side</p>
        </div>
      )}
    </div>
  )
}
