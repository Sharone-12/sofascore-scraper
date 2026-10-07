import { Suspense } from "react"
import { supabase } from "@/lib/supabase"
import { resolveSeason } from "@/lib/seasons"
import { PlayerSearch } from "@/components/player-search"
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
}

function LeagueTag({ league }: { league: string }) {
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
}: {
  title: string
  rows: Row[]
  statKey: "goals" | "assists"
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
        <span className="stat-label">2026/27</span>
      </header>
      <div className="px-2 pb-2">
        {rows.map((p, i) => (
          <Link
            key={`${p.slug}-${i}`}
            href={`/player/${p.slug}`}
            className="group flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/[0.04] transition-colors duration-150"
          >
            <span
              className="stat-figure w-5 text-sm text-right"
              style={{
                color: i < 3 ? "var(--pitch)" : "var(--muted-foreground)",
                opacity: i < 3 ? 1 : 0.55,
              }}
            >
              {i + 1}
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-[0.9rem] font-medium leading-tight truncate group-hover:text-white transition-colors">
                {p.player}
              </span>
              <span className="block text-xs text-muted-foreground truncate">
                {p.team}
              </span>
            </span>
            <LeagueTag league={p.league} />
            <span className="stat-figure text-xl w-9 text-right">
              {p[statKey]}
            </span>
          </Link>
        ))}
      </div>
    </section>
  )
}

async function Content({
  searchParams,
}: {
  searchParams: Promise<{ season?: string }>
}) {
  // Awaited here, inside the Suspense boundary: cacheComponents won't let a
  // prerendered route read request data at the top level.
  const season = resolveSeason((await searchParams).season)
  const [{ data: scorers }, { data: assisters }] = await Promise.all([
    supabase
      .from("players")
      .select("player, slug, team, league, goals")
      .eq("season", season)
      .order("goals", { ascending: false })
      .limit(12),
    supabase
      .from("players")
      .select("player, slug, team, league, assists")
      .eq("season", season)
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
      slug: leader?.slug,
    },
    {
      icon: <AssistIcon />,
      label: "Most assists",
      figure: creator?.assists ?? 0,
      unit: "assists",
      name: creator?.player,
      team: creator?.team,
      slug: creator?.slug,
    },
  ]

  return (
    <>
      <div className="grid sm:grid-cols-2 gap-3 mb-5 stagger">
        {headline.map((s) => (
          <Link
            key={s.label}
            href={s.slug ? `/player/${s.slug}` : "/"}
            className="surface-raised rounded-2xl bg-card px-5 py-4 flex items-center gap-4 hover:-translate-y-px transition-transform duration-200"
          >
            <span style={{ color: "var(--pitch)" }}>{s.icon}</span>
            <span className="flex-1 min-w-0">
              <span className="stat-label block">{s.label}</span>
              <span className="block text-base font-semibold truncate leading-snug">
                {s.name}
              </span>
              <span className="block text-xs text-muted-foreground truncate">
                {s.team}
              </span>
            </span>
            <span className="text-right shrink-0">
              <span
                className="stat-figure block text-4xl"
                style={{ color: "var(--pitch)" }}
              >
                {s.figure}
              </span>
              <span className="stat-label block mt-0.5">{s.unit}</span>
            </span>
          </Link>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-5 stagger">
        <Board title="TOP SCORERS" rows={topScorers} statKey="goals" />
        <Board title="TOP ASSISTS" rows={topAssisters} statKey="assists" />
      </div>
    </>
  )
}

export default function Home({
  searchParams,
}: {
  searchParams: Promise<{ season?: string }>
}) {
  return (
    <div className="mx-auto max-w-6xl px-4 py-14">
      <div className="relative z-10 mb-10 animate-fade-in">
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
          League and La Liga.
        </p>
        <div className="max-w-md">
          <PlayerSearch linkToProfile placeholder="Search for a player..." />
        </div>
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
