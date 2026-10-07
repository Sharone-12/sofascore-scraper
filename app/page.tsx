import { Suspense } from "react"
import { supabase } from "@/lib/supabase"
import { PlayerSearch } from "@/components/player-search"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import Link from "next/link"

function LeaderboardSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-5 w-40" />
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

async function Leaderboards() {
  const [{ data: topScorers }, { data: topAssisters }] = await Promise.all([
    supabase
      .from("players")
      .select("player, slug, team, league, goals, goals_p90, minutes")
      .eq("season", "2026/27")
      .order("goals", { ascending: false })
      .limit(10),
    supabase
      .from("players")
      .select("player, slug, team, league, assists, xa_p90, minutes")
      .eq("season", "2026/27")
      .order("assists", { ascending: false })
      .limit(10),
  ])

  return (
    <div className="grid md:grid-cols-2 gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Top Scorers — 2026/27</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-1">
            {(topScorers || []).map((p, i) => (
              <Link
                key={`${p.slug}-${i}`}
                href={`/player/${p.slug}`}
                className="flex items-center justify-between hover:bg-accent rounded px-2 py-1.5 -mx-2 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span className="text-muted-foreground text-sm w-5 font-mono">
                    {i + 1}
                  </span>
                  <div>
                    <div className="font-medium text-sm">{p.player}</div>
                    <div className="text-xs text-muted-foreground">
                      {p.team}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="text-xs">
                    {p.league === "Premier League" ? "PL" : "LL"}
                  </Badge>
                  <span className="font-mono text-sm font-bold w-6 text-right">
                    {p.goals}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Top Assists — 2026/27</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-1">
            {(topAssisters || []).map((p, i) => (
              <Link
                key={`${p.slug}-${i}`}
                href={`/player/${p.slug}`}
                className="flex items-center justify-between hover:bg-accent rounded px-2 py-1.5 -mx-2 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span className="text-muted-foreground text-sm w-5 font-mono">
                    {i + 1}
                  </span>
                  <div>
                    <div className="font-medium text-sm">{p.player}</div>
                    <div className="text-xs text-muted-foreground">
                      {p.team}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="text-xs">
                    {p.league === "Premier League" ? "PL" : "LL"}
                  </Badge>
                  <span className="font-mono text-sm font-bold w-6 text-right">
                    {p.assists}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export default function Home() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold tracking-tight mb-2">footyy</h1>
        <p className="text-muted-foreground mb-6">
          Player stats and comparisons across Europe&apos;s top leagues
        </p>
        <div className="mx-auto max-w-md">
          <PlayerSearch linkToProfile placeholder="Search for a player..." />
        </div>
      </div>

      <Suspense
        fallback={
          <div className="grid md:grid-cols-2 gap-6">
            <LeaderboardSkeleton />
            <LeaderboardSkeleton />
          </div>
        }
      >
        <Leaderboards />
      </Suspense>
    </div>
  )
}
