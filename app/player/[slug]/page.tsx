import { Suspense } from "react"
import { supabase } from "@/lib/supabase"
import { notFound } from "next/navigation"
import { RADAR_STATS, STAT_GROUPS, percentileRank } from "@/lib/stats"
import { PlayerRadar, StatBarChart } from "@/components/charts"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import Link from "next/link"

function Loading() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <Skeleton className="h-8 w-64 mb-2" />
      <Skeleton className="h-4 w-40 mb-8" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-20" />
        ))}
      </div>
      <Skeleton className="h-[400px] mb-8" />
    </div>
  )
}

async function PlayerContent({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params

  const { data: players } = await supabase
    .from("players")
    .select("*")
    .eq("slug", slug)
    .order("season", { ascending: false })
    .limit(2)

  if (!players || players.length === 0) notFound()

  const player = players[0] as Record<string, unknown>

  const { data: positionPeers } = await supabase
    .from("players")
    .select(RADAR_STATS.map((s) => s.key).join(","))
    .eq("position", player.position as string)
    .eq("season", player.season as string)

  const peers = (positionPeers as unknown) as Record<string, unknown>[] | null

  const radarData = RADAR_STATS.map((s) => {
    const allValues = (peers || []).map((p) => Number(p[s.key]) || 0)
    const pct = percentileRank(Number(player[s.key]) || 0, allValues)
    return { stat: s.label, [player.player as string]: pct }
  })

  const barData = STAT_GROUPS.map((group) => ({
    label: group.label,
    data: group.stats.map((s) => ({
      stat: s.label,
      [player.player as string]: Number(player[s.key]) || 0,
    })),
  }))

  const name = player.player as string
  const keyStats = [
    {
      label: "Goals",
      value: String(player.goals),
      sub: `${Number(player.goals_p90).toFixed(2)}/90`,
    },
    {
      label: "Assists",
      value: String(player.assists),
      sub: `${Number(player.assists_p90).toFixed(2)}/90`,
    },
    {
      label: "xG",
      value: Number(player.xg).toFixed(1),
      sub: `${Number(player.xg_p90).toFixed(2)}/90`,
    },
    {
      label: "Minutes",
      value: String(player.minutes),
      sub: `${player.appearances} apps`,
    },
  ]

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2 flex-wrap">
          <h1 className="text-3xl font-bold">{name}</h1>
          <Badge variant="outline">{player.position as string}</Badge>
        </div>
        <p className="text-muted-foreground">
          {player.team as string} · {player.league as string} ·{" "}
          {player.season as string}
        </p>
        <div className="mt-3">
          <Link
            href={`/compare?players=${player.slug}`}
            className="text-sm text-primary hover:underline"
          >
            Compare with another player →
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {keyStats.map((s) => (
          <Card key={s.label}>
            <CardContent className="pt-4 pb-3 text-center">
              <div className="text-2xl font-bold font-mono">{s.value}</div>
              <div className="text-xs text-muted-foreground">{s.label}</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {s.sub}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="text-lg">Percentile Ranks</CardTitle>
          <p className="text-xs text-muted-foreground">
            vs. all {player.position as string}s in{" "}
            {player.league as string} · {player.season as string}
          </p>
        </CardHeader>
        <CardContent>
          <PlayerRadar data={radarData} players={[name]} />
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-2 gap-6">
        {barData.map((group) => (
          <Card key={group.label}>
            <CardHeader>
              <CardTitle className="text-lg">{group.label}</CardTitle>
              <p className="text-xs text-muted-foreground">per 90 minutes</p>
            </CardHeader>
            <CardContent>
              <StatBarChart data={group.data} players={[name]} />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}

export default function PlayerPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  return (
    <Suspense fallback={<Loading />}>
      <PlayerContent params={params} />
    </Suspense>
  )
}
