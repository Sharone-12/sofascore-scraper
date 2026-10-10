import { Suspense } from "react"
import { connection } from "next/server"
import { supabase } from "@/lib/supabase"
import { resolveSeason } from "@/lib/seasons"
import { resolveCompetition, scopeLeague, scopeQuery, COMPETITION_LABEL } from "@/lib/competition"
import { CompetitionToggle } from "@/components/competition-toggle"
import { LEAGUE_TOURNAMENT_ID } from "@/lib/teams"
import { PlayerSearch } from "@/components/player-search"
import { LeagueCrest, TeamCrest } from "@/components/player-avatar"
import { UpcomingTicker, type UpcomingMatch } from "@/components/upcoming-ticker"
import { Skeleton } from "@/components/ui/skeleton"
import Link from "next/link"

function BallIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5 8.6 10l1.3 4h4.2l1.3-4z" />
      <path d="M12 3v4.5M4.2 9.6 8.6 10M19.8 9.6 15.4 10M7.1 19.3 9.9 14M16.9 19.3 14.1 14" />
    </svg>
  )
}

function AssistIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 17c0-5 4-8 9-8h5" />
      <path d="M13 5.5 17.5 9 13 12.5" />
    </svg>
  )
}

function HeadlineSkeleton() {
  return (
    <div className="grid sm:grid-cols-2 gap-3">
      {Array.from({ length: 2 }).map((_, i) => (
        <Skeleton key={i} className="h-[104px] rounded-2xl" />
      ))}
    </div>
  )
}

function BoardSkeleton() {
  return (
    <div className="grid md:grid-cols-2 gap-5">
      {Array.from({ length: 2 }).map((_, i) => (
        <Skeleton key={i} className="h-[420px] rounded-2xl" />
      ))}
    </div>
  )
}

type Row = {
  player: string
  slug: string
  team: string
  team_id: number | null
  league: string
  goals?: number
  assists?: number
}

// Keep these hues in sync with LEAGUE_HUE in components/player-search.tsx.
const LEAGUE_TAG: Record<string, { short: string; hue: string }> = {
  "Premier League": { short: "PL", hue: "0.78 0.13 290" },
  "La Liga": { short: "LL", hue: "0.80 0.14 60" },
  "Ligue 1": { short: "L1", hue: "0.78 0.13 240" },
  Bundesliga: { short: "BL", hue: "0.78 0.14 15" },
  "Champions League": { short: "UCL", hue: "0.78 0.14 230" },
}

function LeagueTag({ league }: { league: string }) {
  const tid = LEAGUE_TOURNAMENT_ID[league]
  if (tid) {
    return <LeagueCrest tournamentId={tid} name={league} size={20} />
  }
  const tag = LEAGUE_TAG[league] ?? LEAGUE_TAG["Premier League"]
  return (
    <span
      className="stat-label text-[0.6rem] px-1.5 py-0.5 rounded"
      style={{
        color: `oklch(${tag.hue})`,
        background: `oklch(${tag.hue} / 13%)`,
      }}
    >
      {tag.short}
    </span>
  )
}

function Board({
  title,
  rows,
  statKey,
  label,
  scope,
}: {
  title: string
  rows: Row[]
  statKey: "goals" | "assists"
  label: string
  scope: string
}) {
  return (
    <section className="surface rounded-2xl bg-card overflow-hidden">
      <header className="flex items-baseline justify-between px-5 pt-5 pb-3">
        <h2
          className="text-lg font-semibold tracking-tight"
          style={{ fontFamily: "var(--font-condensed)" }}
        >
          {title}
        </h2>
        <span className="stat-label">{label}</span>
      </header>
      <div className="px-2 pb-2">
        {rows.map((p, i) => (
          <Link
            key={`${p.slug}-${i}`}
            href={`/player/${p.slug}${scope}`}
            className="row-item flex items-center gap-3 px-3 py-2.5 rounded-xl"
          >
            <span className="rank-badge" data-rank={i + 1}>
              {i + 1}
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-[0.9rem] font-medium leading-tight truncate">
                {p.player}
              </span>
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                {p.team_id != null && (
                  <TeamCrest teamId={p.team_id} name={p.team} size={14} />
                )}
                <span className="truncate">{p.team}</span>
              </span>
            </span>
            <LeagueTag league={p.league} />
            <span
              className="stat-figure text-xl w-9 text-right"
              style={{ color: i < 3 ? "var(--pitch)" : undefined }}
            >
              {p[statKey]}
            </span>
          </Link>
        ))}
      </div>
    </section>
  )
}

async function Upcoming() {
  // connection() opts this leaf into dynamic rendering so new Date() is
  // allowed under Cache Components. The parent Suspense boundary lets the
  // rest of the hero prerender while this streams in.
  await connection()
  const today = new Date()
  const in7 = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000)
  const iso = (d: Date) => d.toISOString().slice(0, 10)
  const { data } = await supabase
    .from("matches")
    .select("event_id, league, date, home, home_id, away, away_id")
    .eq("status", "upcoming")
    .gte("date", iso(today))
    .lte("date", iso(in7))
    .order("date", { ascending: true })
    .limit(50)
  const rows = (data || []) as unknown as UpcomingMatch[]
  return <UpcomingTicker matches={rows} />
}

async function Content({
  searchParams,
}: {
  searchParams: Promise<{ season?: string; comp?: string }>
}) {
  // Awaited here, inside the Suspense boundary: cacheComponents won't let a
  // prerendered route read request data at the top level.
  const sp = await searchParams
  const season = resolveSeason(sp.season)
  const comp = resolveCompetition(sp.comp)
  const scope = scopeQuery(season, comp)
  const label = `${season} · ${COMPETITION_LABEL[comp]}`
  const [{ data: scorers }, { data: assisters }] = await Promise.all([
    scopeLeague(
      supabase
        .from("players")
        .select("player, slug, team, team_id, league, goals")
        .eq("season", season),
      comp,
    )
      .order("goals", { ascending: false })
      .limit(12),
    scopeLeague(
      supabase
        .from("players")
        .select("player, slug, team, team_id, league, assists")
        .eq("season", season),
      comp,
    )
      .order("assists", { ascending: false })
      .limit(12),
  ])

  const topScorers = (scorers || []) as Row[]
  const topAssisters = (assisters || []) as Row[]
  const leader = topScorers[0]
  const creator = topAssisters[0]

  const headline = [
    {
      icon: <BallIcon />,
      label: "Leading scorer",
      figure: leader?.goals ?? 0,
      unit: "goals",
      name: leader?.player,
      team: leader?.team,
      team_id: leader?.team_id,
      slug: leader?.slug,
    },
    {
      icon: <AssistIcon />,
      label: "Most assists",
      figure: creator?.assists ?? 0,
      unit: "assists",
      name: creator?.player,
      team: creator?.team,
      team_id: creator?.team_id,
      slug: creator?.slug,
    },
  ]

  return (
    <>
      <div className="grid sm:grid-cols-2 gap-3 mb-5 stagger">
        {headline.map((s) => (
          <Link
            key={s.label}
            href={s.slug ? `/player/${s.slug}${scope}` : "/"}
            className="card-lift surface-raised rounded-2xl bg-card px-5 py-4 flex items-center gap-4"
          >
            <span style={{ color: "var(--pitch)" }}>{s.icon}</span>
            <span className="flex-1 min-w-0">
              <span className="stat-label block">{s.label}</span>
              <span className="block text-base font-semibold truncate leading-snug">
                {s.name}
              </span>
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                {s.team_id != null && s.team && (
                  <TeamCrest teamId={s.team_id} name={s.team} size={14} />
                )}
                <span className="truncate">{s.team}</span>
              </span>
            </span>
            <span className="text-right shrink-0">
              <span className="stat-figure stat-pop shimmer-text block text-4xl">
                {s.figure}
              </span>
              <span className="stat-label block mt-0.5">{s.unit}</span>
            </span>
          </Link>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-5 stagger">
        <Board title="TOP SCORERS" rows={topScorers} statKey="goals" label={label} scope={scope} />
        <Board title="TOP ASSISTS" rows={topAssisters} statKey="assists" label={label} scope={scope} />
      </div>
    </>
  )
}

export default function Home({
  searchParams,
}: {
  searchParams: Promise<{ season?: string; comp?: string }>
}) {
  return (
    <div className="mx-auto max-w-6xl px-4 py-14">
      <div className="relative z-10 mb-10 grid gap-8 lg:grid-cols-[1fr_22rem] lg:items-start animate-fade-in">
        <div>
          <h1
            className="text-5xl sm:text-6xl tracking-[-0.035em] leading-[0.95] mb-4"
            style={{ fontFamily: "var(--font-condensed)" }}
          >
            <span className="font-bold">Every touch.</span>{" "}
            <span className="font-normal text-muted-foreground">
              Every number.
            </span>
          </h1>
          <p className="text-muted-foreground text-base max-w-md mb-7">
            Per-90 stats and percentile ranks for every player in the Premier
            League, La Liga, and Champions League.
          </p>
          <div className="max-w-md">
            <PlayerSearch linkToProfile placeholder="Search for a player..." />
          </div>
          <div className="mt-4">
            <Suspense fallback={null}>
              <CompetitionToggle />
            </Suspense>
          </div>
        </div>
        <Suspense fallback={<Skeleton className="h-[230px] rounded-2xl" />}>
          <Upcoming />
        </Suspense>
      </div>

      <Suspense
        fallback={
          <>
            <div className="mb-5">
              <HeadlineSkeleton />
            </div>
            <BoardSkeleton />
          </>
        }
      >
        <Content searchParams={searchParams} />
      </Suspense>
    </div>
  )
}
