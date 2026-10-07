import { NextResponse } from "next/server"
import { supabase } from "@/lib/supabase"
import { leagueCode, type LeagueCode } from "@/lib/search"

// The whole searchable player index is ~76 kB raw (~20 kB gzipped). Shipping it
// once and filtering in the browser beats a per-keystroke round trip, which can
// never use an index anyway: ILIKE '%x%' forces a seq scan.
// Freshness comes from the Cache-Control header below; the `revalidate`
// segment config is rejected under nextConfig.cacheComponents.

// PostgREST enforces max-rows=1000 server-side, so a Range header alone cannot
// lift the cap and the table (1163 rows) must be walked page by page.
const PAGE = 1000

type Indexed = {
  i: number
  n: string
  s: string
  t: string
  p: string
  l: LeagueCode
  m: number
}

export async function GET() {
  const seen = new Set<number>()
  const players: Indexed[] = []

  for (let page = 0; ; page++) {
    const { data, error } = await supabase
      .from("players")
      .select("player_id, player, slug, team, position, league, season, minutes")
      .order("season", { ascending: false })
      .order("minutes", { ascending: false })
      .range(page * PAGE, page * PAGE + PAGE - 1)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    if (!data?.length) break

    // Rows arrive season-ordered, so the first sighting of a player_id carries
    // their most recent club and position.
    for (const p of data) {
      if (seen.has(p.player_id)) continue
      seen.add(p.player_id)
      players.push({
        i: p.player_id,
        n: p.player,
        s: p.slug,
        t: p.team ?? "",
        p: p.position ?? "",
        l: leagueCode(p.league),
        m: p.minutes ?? 0,
      })
    }

    if (data.length < PAGE) break
  }

  return NextResponse.json(
    { players },
    {
      headers: {
        "Cache-Control":
          "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400",
      },
    },
  )
}
