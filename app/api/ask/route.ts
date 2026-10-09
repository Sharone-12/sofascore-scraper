import { NextResponse } from "next/server"
import { supabase } from "@/lib/supabase"
import { rankPlayers, rankAllRoles, ROLE_PROFILES, ATTACKING_IMPACT, type Scored } from "@/lib/rank"
import { parseIntent, DATA_SCOPE } from "@/lib/ask"
import { resolveSeason } from "@/lib/seasons"

// The model gets facts, never a database. Everything it is allowed to assert is
// computed here first, so it ranks nothing and recalls nothing on its own.


// OpenRouter. Chosen by bake-off against the real prompt, not by reputation:
// of the free models, this one answered in ~3s, spotted a genuine tie on score,
// and correctly refused a question about a player absent from the data. The
// larger nemotron-ultra and nemotron-lightning both leaked their chain of
// thought into the answer; the gemma free tiers were rate-limited upstream.
// Tried in order. Free tiers get rate-limited upstream and sometimes answer 200
// with an empty body, so one model is a single point of failure; falling
// through to the next costs nothing and keeps the feature up. Ordered by
// measured quality: the ultra and lightning variants both leak their reasoning
// into the answer, so they are a fallback, not a default.
// ASK_MODEL overrides the whole chain with one id.
const MODELS = process.env.ASK_MODEL
  ? [process.env.ASK_MODEL]
  : [
      "nvidia/nemotron-3-super-120b-a12b:free",
      "google/gemma-4-31b-it:free",
      "nvidia/nemotron-3-ultra-550b-a55b:free",
    ]
const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions"

const SYSTEM = `You are a football analyst for a stats site. You answer ONLY from the DATA block supplied with each question.

Hard rules:
- Never invent a player, club or number. If a name is not in DATA, say you don't have them.
- Every claim cites a number from DATA. No numbers from memory, no arithmetic of your own.
- DATA covers: ${DATA_SCOPE} So "best in the world" means best within that set — say so once, briefly, and do not imply wider coverage.
- Every score is a 0-100 weighted percentile, already adjusted for minutes played: a small sample is pulled toward 50. A low-minutes player with a flashy rate ranks below a proven one, and that is correct. Mention minutes when a sample is thin.
- There are two kinds of score, and the DATA block says which you were given:
  1. ROLE score — percentile against players in the SAME role only. Use it for "best winger", "best striker", etc. Role scores are NOT comparable across roles: a striker on 70 is not better than a centre-back on 64, because they are different pools measured on different metrics. Never rank different roles against each other using role scores.
  2. ATTACKING IMPACT — percentile against every outfield player in one cohort on the same attacking metrics (goals, xG, assists, xA, key passes, chances created, dribbles, shots on target). This IS comparable across roles, so use it to answer "best player" and "top N players". It measures attacking production only; note that when a defender appears it is because they contribute going forward, and a dominant defender who rarely attacks will rank low here.
- A high score means "dominant relative to that cohort this season", not "world class in absolute terms". Coverage is two leagues plus two clubs.
- Judge the season in front of you, never a reputation. A famous player having a quiet season ranks low, and that is the correct answer — say so rather than defending them.

Comparing players of DIFFERENT roles:
- The ROLE score is the PRIMARY measure — it says how well each player performs the job their position demands. A central midfielder scoring 82 among central midfielders is outperforming his role more than an attacking midfielder scoring 75 among attacking midfielders.
- Judge each player by THEIR role's key metrics. A central mid should be evaluated on passing, recoveries, tackles, progression — not goals. An attacking mid on chance creation, key passes, final third impact. A striker on goals and xG. The METRICS block tells you what matters for each role.
- ATTACKING IMPACT is supplementary context for cross-role comparisons, not the main verdict. A central mid with low attacking impact but elite role performance is doing his job brilliantly — say that.
- When roles differ, frame the answer around "who is better at what they're asked to do" using role scores and role-specific percentiles, not who scores more goals.

Style: direct and confident, like a good analyst. Lead with the answer, then the two or three numbers that justify it. Short paragraphs or a tight list. No preamble, no restating the question, no hedging about being an AI, and never show your reasoning steps — give the finished answer only. Write the numbers inline as plain prose: never emit citation markers, bracket references or raw JSON.`

/**
 * Strip artefacts models sometimes append: 【…】 citation blocks and stray
 * inline JSON. Prompting alone doesn't reliably suppress these, and a reader
 * should never see them.
 */
function clean(text: string): string {
  return text
    .replace(/【[^】]*】/g, "")
    .replace(/\[\s*\{[^\]]*\}\s*\]/g, "")
    .replace(/[ \t]+([.,;:)])/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

type Body = { question?: string; slugs?: string[]; season?: string }

/** Only the fields the model should see — keeps the prompt small and factual. */
function brief(s: Scored) {
  return {
    player: s.player,
    team: s.team,
    league: s.league,
    role: s.position,
    plays: s.detailedPosition,
    season: s.season,
    minutes: s.minutes,
    score: s.score,
    sample_confidence: s.confidence,
    percentiles: s.percentiles,
  }
}

async function cohort(role: string, season: string): Promise<Scored[]> {
  const { data, error } = await supabase
    .from("players")
    .select("*")
    .eq("role", role)
    .eq("season", season)
  if (error) throw new Error(error.message)
  return rankPlayers(data ?? [], role)
}

export async function POST(req: Request) {
  // API_KEY is what the project currently sets; the explicit names are
  // preferred because API_KEY is generic enough to collide with anything.
  const key =
    process.env.OPENROUTER_API_KEY ??
    process.env.ASK_API_KEY ??
    process.env.API_KEY
  if (!key) {
    return NextResponse.json(
      { error: "No OpenRouter key set (OPENROUTER_API_KEY or API_KEY)." },
      { status: 503 },
    )
  }

  let body: Body
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 })
  }

  const question = (body.question ?? "").trim()
  const slugs = (body.slugs ?? []).filter(Boolean).slice(0, 3)
  if (!question) {
    return NextResponse.json({ error: "Ask a question." }, { status: 400 })
  }
  if (question.length > 500) {
    return NextResponse.json({ error: "Question too long." }, { status: 400 })
  }

  const intent = parseIntent(question, slugs.length > 0)
  // A season named in the question wins; otherwise whatever the page is
  // showing; otherwise the default (26/27).
  const season = intent.season ?? resolveSeason(body.season)

  try {
    const sections: string[] = []
    let cited: Scored[] = []

    if (slugs.length) {
      // Compare mode: score each named player inside their own position cohort,
      // so "who is better" is answered against their real peers.
      const { data, error } = await supabase
        .from("players")
        .select("player, slug, role, season")
        .in("slug", slugs)
        .eq("season", season)
      if (error) throw new Error(error.message)

      const byPosition = new Map<string, Scored[]>()
      for (const pos of new Set((data ?? []).map((r) => r.role as string))) {
        byPosition.set(pos, await cohort(pos, season))
      }
      cited = slugs
        .map((slug) => {
          for (const ranked of byPosition.values()) {
            const hit = ranked.find((r) => r.slug === slug)
            if (hit) return hit
          }
          return null
        })
        .filter(Boolean) as Scored[]

      if (cited.length) {
        const sameRole = new Set(cited.map((c) => c.position)).size === 1
        sections.push(
          `PLAYERS BEING COMPARED — "score" is their ROLE score (percentile within their own role's cohort, ${season}). ${sameRole ? "Same role, so scores are directly comparable." : "DIFFERENT ROLES — each score measures how well they perform their specific position's job. Judge each player by their role's metrics below, not by who scores more goals."}:\n` +
            JSON.stringify(cited.map(brief), null, 1),
        )
        const { data: all } = await supabase
          .from("players")
          .select("*")
          .eq("season", season)
        const overall = rankAllRoles(all ?? [])
        const theirs = cited
          .map((c) => {
            const i = overall.findIndex((p: Scored) => p.slug === c.slug)
            return i < 0
              ? null
              : {
                  player: overall[i].player,
                  role: overall[i].position,
                  attacking_impact: overall[i].score,
                  overall_rank: i + 1,
                  of: overall.length,
                }
          })
          .filter(Boolean)
        if (theirs.length) {
          sections.push(
            `ATTACKING IMPACT (supplementary) — attacking production against ALL outfield players. ${sameRole ? "Comparable since same role." : "Use as context only — role scores above are the primary measure for different positions."}:\n` +
              JSON.stringify(theirs, null, 1),
          )
        }
        const positions = [...new Set(cited.map((c) => c.position))]
        sections.push(
          `METRICS THAT DEFINE EACH ROLE (weight = importance in that role's score). ${sameRole ? "" : "Each player should be judged on THEIR role's metrics:"}:\n` +
            JSON.stringify(
              Object.fromEntries(
                positions.map((p) => [p, ROLE_PROFILES[p]]),
              ),
              null,
              1,
            ),
        )
      }
    }

    if (!cited.length && intent.positions.length) {
      // A role was named: rank inside that role's cohort.
      for (const role of intent.positions) {
        const top = (await cohort(role, season)).slice(0, intent.limit)
        cited.push(...top)
        sections.push(
          `TOP ${top.length} ${role.toUpperCase()}S, ${season} (percentile within this role, minutes-adjusted):\n` +
            JSON.stringify(top.map(brief), null, 1),
        )
      }
      sections.push(
        `METRICS THAT DEFINE THESE ROLES (weight = importance):\n` +
          JSON.stringify(
            Object.fromEntries(intent.positions.map((r) => [r, ROLE_PROFILES[r]])),
            null,
            1,
          ),
      )
    } else if (!cited.length) {
      // No role named — "best player", "top 3". Everyone is scored inside their
      // own role first, then ranked against each other.
      const { data, error } = await supabase
        .from("players")
        .select("*")
        .eq("season", season)
      if (error) throw new Error(error.message)
      const top = rankAllRoles(data ?? []).slice(0, intent.limit)
      cited.push(...top)
      sections.push(
        `TOP ${top.length} PLAYERS BY ATTACKING IMPACT, ${season} — every outfield player scored on the SAME attacking metrics in one pool. "score" IS comparable across roles:\n` +
          JSON.stringify(top.map(brief), null, 1),
      )
      sections.push(
        `ATTACKING IMPACT METRICS (weight = importance):\n` +
          JSON.stringify(ATTACKING_IMPACT, null, 1),
      )
    }

    if (!sections.length) {
      return NextResponse.json({
        answer: `I don't have those players. Coverage is ${DATA_SCOPE}`,
        cited: [],
      })
    }

    const prompt = `DATA:\n${sections.join("\n\n")}\n\nQUESTION: ${question}`

    // Walk the chain: a rate-limited or empty-bodied model falls through to the
    // next rather than failing the request. Both happen routinely on free tiers.
    let answer = ""
    let used = ""
    let lastStatus = 0

    for (const model of MODELS) {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
          // Optional on OpenRouter, but it attributes usage to this app.
          "HTTP-Referer": "https://footyy-three.vercel.app",
          "X-Title": "footyy",
        },
        body: JSON.stringify({
          model,
          temperature: 0.3,
          max_tokens: 700,
          messages: [
            { role: "system", content: SYSTEM },
            { role: "user", content: prompt },
          ],
        }),
      })

      if (!res.ok) {
        lastStatus = res.status
        // 402 means the account itself can't pay — no other model will help.
        if (res.status === 402) break
        continue
      }

      const json = await res.json()
      const raw = json?.choices?.[0]?.message?.content
      answer = raw ? clean(raw) : ""
      if (answer) {
        used = model
        break
      }
    }

    if (!answer) {
      const msg =
        lastStatus === 402
          ? "OpenRouter rejected the request: insufficient credits."
          : "Every free model is rate-limited or returned nothing. Try again shortly."
      return NextResponse.json({ error: msg }, { status: 502 })
    }

    return NextResponse.json({
      answer,
      model: used,
      season,
      cited: cited.map((c) => ({
        player: c.player,
        slug: c.slug,
        team: c.team,
        score: c.score,
        minutes: c.minutes,
      })),
    })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 },
    )
  }
}
