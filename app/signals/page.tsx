import { Suspense } from "react"
import Link from "next/link"
import { supabase } from "@/lib/supabase"
import { resolveSeason } from "@/lib/seasons"
import {
  resolveCompetition,
  scopeLeague,
  scopeQuery,
  COMPETITION_LABEL,
} from "@/lib/competition"
import { CompetitionToggle } from "@/components/competition-toggle"
import { TeamCrest, LeagueCrest } from "@/components/player-avatar"
import { LEAGUE_TOURNAMENT_ID } from "@/lib/teams"
import { Skeleton } from "@/components/ui/skeleton"
import { SignalInfo } from "@/components/signal-info"
import { SignalExpand, type SignalExpandRow, type SignalFmt } from "@/components/signal-expand"

type PlayerRow = {
  player: string
  slug: string
  team: string
  team_id: number | null
  league: string
  minutes: number
  goals_p90: number | null
  xg_p90: number | null
  xa_p90: number | null
  key_passes_p90: number | null
  big_chances_created_p90: number | null
  touches_p90: number | null
  dispossessed_p90: number | null
  dribbles_p90: number | null
  final_third_passes_p90: number | null
  total_passes_p90: number | null
  tackles_won_p90: number | null
  aerials_won_p90: number | null
  interceptions_p90: number | null
}

const n = (v: number | null | undefined) => (v == null ? 0 : Number(v))

type Signal = {
  key: string
  label: string
  hint: string
  formula: string
  what: string
  signifies: string
  why: string
  compute: (p: PlayerRow) => number
  fmt: (v: number) => string
  /** Serializable formatter key for the client-side expand dialog. */
  fmtKey: SignalFmt
  higherIsBetter: boolean
}

const SIGNALS: Signal[] = [
  {
    key: "finishing_edge",
    label: "Finishing Edge",
    hint: "Clinical finishing above expected",
    formula: "goals − xG, per 90",
    what: "The gap between the goals a player actually scores and the xG of the chances they take, averaged over 90 minutes.",
    signifies: "A positive number means the player beats their chances — clinical. A negative one means they waste good positions.",
    why: "xG rewards getting into shooting positions. This metric isolates the finishing on top of that: who's converting better than the average striker would from the same spots.",
    compute: (p) => n(p.goals_p90) - n(p.xg_p90),
    fmt: (v) => (v > 0 ? `+${v.toFixed(2)}` : v.toFixed(2)),
    fmtKey: "signed2",
    higherIsBetter: true,
  },
  {
    key: "progression_resistance",
    label: "Progression Resistance",
    hint: "Moves the ball forward without losing it",
    formula: "(dribbles + final-third passes) ÷ (dispossessed + 0.5)",
    what: "Advancing actions per turnover: successful dribbles and final-third passes divided by times dispossessed.",
    signifies: "High values = the player moves play forward and keeps the ball. Low values = either doesn't progress play, or loses it when they try.",
    why: "A plain touches-per-turnover ratio flatters centre-backs who recycle sideways in safe areas. This counts only progressive actions in the numerator, so the leaderboard surfaces midfielders and attackers who carry and pass through pressure.",
    compute: (p) =>
      (n(p.dribbles_p90) + n(p.final_third_passes_p90)) /
      (n(p.dispossessed_p90) + 0.5),
    fmt: (v) => v.toFixed(1),
    fmtKey: "fixed1",
    higherIsBetter: true,
  },
  {
    key: "line_breaker",
    label: "Line Breaker",
    hint: "Share of passes that advance play",
    formula: "final-third passes ÷ total passes",
    what: "The percentage of a player's passes that reach the attacking third.",
    signifies: "High share = vertical, progressive player. Low share = recycler who moves the ball sideways.",
    why: "Pass completion % rewards short, safe passing. This rewards passes that actually move play forward — the ones that unlock defences.",
    compute: (p) => {
      const total = n(p.total_passes_p90)
      return total > 0 ? (n(p.final_third_passes_p90) / total) * 100 : 0
    },
    fmt: (v) => `${v.toFixed(1)}%`,
    fmtKey: "pct1",
    higherIsBetter: true,
  },
  {
    key: "creator_index",
    label: "Creator Index",
    hint: "Playmaking without assist-luck",
    formula: "xA + big chances created + ½ key passes",
    what: "A composite of expected assists, big chances created, and key passes (weighted half, since they include lower-quality chances).",
    signifies: "Measures the player's chance-creation output regardless of whether teammates finished them.",
    why: "Assists depend on strikers converting. This isolates how good the player is at manufacturing chances — the part they actually control.",
    compute: (p) =>
      n(p.xa_p90) + n(p.big_chances_created_p90) + n(p.key_passes_p90) * 0.5,
    fmt: (v) => v.toFixed(2),
    fmtKey: "fixed2",
    higherIsBetter: true,
  },
  {
    key: "duel_dominance",
    label: "Duel Dominance",
    hint: "Composite ball-winner score",
    formula: "tackles + aerials + interceptions, per 90",
    what: "The sum of successful tackles, aerial duels won, and interceptions per 90 minutes.",
    signifies: "How often the player ends an opposition attack, whether on the ground, in the air, or by reading passes.",
    why: "Tackles alone miss readers of the game who intercept. Aerials alone miss ground-duel specialists. Combined, this surfaces complete defensive midfielders and centre-backs.",
    compute: (p) =>
      n(p.tackles_won_p90) + n(p.aerials_won_p90) + n(p.interceptions_p90),
    fmt: (v) => v.toFixed(1),
    fmtKey: "fixed1",
    higherIsBetter: true,
  },
]

const LEAGUE_TAG: Record<string, { short: string; hue: string }> = {
  "Premier League": { short: "PL", hue: "0.78 0.13 290" },
  "La Liga": { short: "LL", hue: "0.80 0.14 60" },
  "Ligue 1": { short: "L1", hue: "0.78 0.13 240" },
  Bundesliga: { short: "BL", hue: "0.78 0.14 15" },
  "Champions League": { short: "UCL", hue: "0.78 0.14 230" },
}

function LeagueTag({ league }: { league: string }) {
  const tid = LEAGUE_TOURNAMENT_ID[league]
  if (tid) return <LeagueCrest tournamentId={tid} name={league} size={18} />
  const tag = LEAGUE_TAG[league] ?? LEAGUE_TAG["Premier League"]
  return (
    <span
      className="stat-label text-[0.6rem] px-1.5 py-0.5 rounded"
      style={{ color: `oklch(${tag.hue})`, background: `oklch(${tag.hue} / 13%)` }}
    >
      {tag.short}
    </span>
  )
}

function SignalBoard({
  signal,
  rows,
  allRows,
  scope,
}: {
  signal: Signal
  rows: Array<PlayerRow & { value: number }>
  allRows: SignalExpandRow[]
  scope: string
}) {
  return (
    <section className="surface rounded-2xl bg-card overflow-hidden">
      <header className="px-5 pt-5 pb-3">
        <div className="flex items-baseline justify-between gap-3">
          <div className="flex items-center gap-2">
            <h2
              className="text-lg font-semibold tracking-tight uppercase"
              style={{ fontFamily: "var(--font-condensed)" }}
            >
              {signal.label}
            </h2>
            <SignalInfo
              label={signal.label}
              formula={signal.formula}
              what={signal.what}
              signifies={signal.signifies}
              why={signal.why}
            />
            <SignalExpand
              label={signal.label}
              formula={signal.formula}
              rows={allRows}
              fmt={signal.fmtKey}
              scope={scope}
            />
          </div>
          <span className="stat-label truncate">{signal.formula}</span>
        </div>
        <p className="text-xs text-muted-foreground mt-1">{signal.hint}</p>
      </header>
      <div className="px-2 pb-2">
        {rows.map((p, i) => (
          <Link
            key={`${p.slug}-${i}`}
            href={`/player/${p.slug}${scope}`}
            className={`row-item flex items-center gap-3 px-3 py-2.5 rounded-xl ${
              p.team === "FC Barcelona" ? "barca-stripes" : ""
            }`}
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
              className="stat-figure text-xl w-14 text-right"
              style={{ color: i < 3 ? "var(--pitch)" : undefined }}
            >
              {signal.fmt(p.value)}
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
  searchParams: Promise<{ season?: string; comp?: string }>
}) {
  const sp = await searchParams
  const season = resolveSeason(sp.season)
  const comp = resolveCompetition(sp.comp)
  const scope = scopeQuery(season, comp)
  const label = `${season} · ${COMPETITION_LABEL[comp]}`

  const { data } = await scopeLeague(
    supabase
      .from("players")
      .select(
        "player, slug, team, team_id, league, minutes, " +
          "goals_p90, xg_p90, xa_p90, key_passes_p90, big_chances_created_p90, " +
          "touches_p90, dispossessed_p90, dribbles_p90, final_third_passes_p90, total_passes_p90, " +
          "tackles_won_p90, aerials_won_p90, interceptions_p90",
      )
      .eq("season", season),
    comp,
  ).limit(2000)

  const all = (data || []) as unknown as PlayerRow[]
  // ponytail: hard sample-size filter at 30% of max minutes; upgrade to
  // confidence-shrinkage from lib/rank.ts if the tails look noisy.
  const maxMin = Math.max(0, ...all.map((p) => Number(p.minutes) || 0))
  const minMin = Math.max(300, maxMin * 0.3)
  const eligible = all.filter((p) => Number(p.minutes) >= minMin)

  const boards = SIGNALS.map((s) => {
    const scored = eligible
      .map((p) => ({ ...p, value: s.compute(p) }))
      .filter((p) => Number.isFinite(p.value))
    scored.sort((a, b) => (s.higherIsBetter ? b.value - a.value : a.value - b.value))
    // Slim shape sent to the client expand dialog — drops the raw p90 columns.
    const allRows: SignalExpandRow[] = scored.map((p) => ({
      slug: p.slug,
      player: p.player,
      team: p.team,
      team_id: p.team_id,
      league: p.league,
      value: p.value,
    }))
    return { signal: s, rows: scored.slice(0, 10), allRows }
  })

  return (
    <>
      <p className="stat-label mb-4">
        {label} · min {Math.round(minMin)} minutes · {eligible.length} players ranked
      </p>
      <div className="grid lg:grid-cols-2 gap-5 stagger">
        {boards.map((b) => (
          <SignalBoard
            key={b.signal.key}
            signal={b.signal}
            rows={b.rows}
            allRows={b.allRows}
            scope={scope}
          />
        ))}
      </div>
    </>
  )
}

function BoardsSkeleton() {
  return (
    <div className="grid lg:grid-cols-2 gap-5">
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-[520px] rounded-2xl" />
      ))}
    </div>
  )
}

export default function SignalsPage({
  searchParams,
}: {
  searchParams: Promise<{ season?: string; comp?: string }>
}) {
  return (
    <div className="mx-auto max-w-6xl px-4 py-14">
      <div className="relative z-10 mb-8 animate-fade-in">
        <h1
          className="text-5xl sm:text-6xl tracking-[-0.035em] leading-[0.95] mb-4"
          style={{ fontFamily: "var(--font-condensed)" }}
        >
          <span className="font-bold">Signals.</span>{" "}
          <span className="font-normal text-muted-foreground">
            Metrics the raw stats don&apos;t show.
          </span>
        </h1>
        <p className="text-muted-foreground text-base max-w-xl mb-5">
          Derived from per-90 production. Each board ranks the players who
          separate themselves on one dimension — finishing above xG, keeping the
          ball under pressure, breaking lines, creating chances, or winning
          duels.
        </p>
        <Suspense fallback={null}>
          <CompetitionToggle />
        </Suspense>
      </div>

      <Suspense fallback={<BoardsSkeleton />}>
        <Content searchParams={searchParams} />
      </Suspense>
    </div>
  )
}
