import { NextResponse } from "next/server"
import { supabase } from "@/lib/supabase"
import { rankPlayers, POSITION_PROFILES, type Scored } from "@/lib/rank"
import { parseIntent, DATA_SCOPE } from "@/lib/ask"

// The model gets facts, never a database. Everything it is allowed to assert is
// computed here first, so it ranks nothing and recalls nothing on its own.

const CURRENT_SEASON = "2026/27"
const MODEL = "deepseek-chat"
const ENDPOINT = "https://api.deepseek.com/chat/completions"

const SYSTEM = `You are a football analyst for a stats site. You answer ONLY from the DATA block supplied with each question.

Hard rules:
- Never invent a player, club or number. If a name is not in DATA, say you don't have them.
- Every claim cites a number from DATA. No numbers from memory, no arithmetic of your own.
- DATA covers: ${DATA_SCOPE} So "best in the world" means best within that set — say so once, briefly, and do not imply wider coverage.
- "score" is a 0-100 weighted percentile for the player's position, already adjusted for minutes played: a small sample is pulled toward 50. A low-minutes player with a flashy rate ranks below a proven one, and that is correct. Mention minutes when a sample is thin.
- Percentiles are within the player's own position and season.

Style: direct and confident, like a good analyst. Lead with the answer, then the two or three numbers that justify it. Short paragraphs or a tight list. No preamble, no restating the question, no hedging about being an AI.`

type Body = { question?: string; slugs?: string[] }

/** Only the fields the model should see — keeps the prompt small and factual. */
function brief(s: Scored) {
  return {
    player: s.player,
    team: s.team,
    league: s.league,
    position: s.position,
    season: s.season,
    minutes: s.minutes,
    score: s.score,
    sample_confidence: s.confidence,
    percentiles: s.percentiles,
  }
}

async function cohort(position: string, season: string): Promise<Scored[]> {
  const { data, error } = await supabase
    .from("players")
    .select("*")
    .eq("position", position)
    .eq("season", season)
  if (error) throw new Error(error.message)
  return rankPlayers(data ?? [], position)
}

export async function POST(req: Request) {
  const key = process.env.DEEPSEEK_API
  if (!key) {
    return NextResponse.json(
      { error: "DEEPSEEK_API is not set on this environment." },
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
  const season = intent.season ?? CURRENT_SEASON

  try {
    const sections: string[] = []
    let cited: Scored[] = []

    if (slugs.length) {
      // Compare mode: score each named player inside their own position cohort,
      // so "who is better" is answered against their real peers.
      const { data, error } = await supabase
        .from("players")
        .select("player, slug, position, season")
        .in("slug", slugs)
        .eq("season", season)
      if (error) throw new Error(error.message)

      const byPosition = new Map<string, Scored[]>()
      for (const pos of new Set((data ?? []).map((r) => r.position as string))) {
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
        sections.push(
          `PLAYERS BEING COMPARED (each scored against their own position in ${season}):\n` +
            JSON.stringify(cited.map(brief), null, 1),
        )
        const positions = [...new Set(cited.map((c) => c.position))]
        sections.push(
          `METRICS THAT DEFINE THESE POSITIONS (weight = importance):\n` +
            JSON.stringify(
              Object.fromEntries(
                positions.map((p) => [p, POSITION_PROFILES[p]]),
              ),
              null,
              1,
            ),
        )
      }
    }

    if (!cited.length) {
      // Rank mode. No position named means rank every position and show each
      // one's leaders, which is the honest reading of "best player".
      const positions = intent.positions.length
        ? intent.positions
        : Object.keys(POSITION_PROFILES)

      for (const pos of positions) {
        const ranked = await cohort(pos, season)
        const top = ranked.slice(0, intent.limit)
        cited.push(...top)
        sections.push(
          `TOP ${top.length} ${pos.toUpperCase()}S, ${season} (weighted percentile, minutes-adjusted):\n` +
            JSON.stringify(top.map(brief), null, 1),
        )
      }
      sections.push(
        `METRICS THAT DEFINE EACH POSITION (weight = importance):\n` +
          JSON.stringify(
            Object.fromEntries(positions.map((p) => [p, POSITION_PROFILES[p]])),
            null,
            1,
          ),
      )
    }

    if (!sections.length) {
      return NextResponse.json({
        answer: `I don't have those players. Coverage is ${DATA_SCOPE}`,
        cited: [],
      })
    }

    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.3,
        max_tokens: 700,
        messages: [
          { role: "system", content: SYSTEM },
          {
            role: "user",
            content: `DATA:\n${sections.join("\n\n")}\n\nQUESTION: ${question}`,
          },
        ],
      }),
    })

    if (!res.ok) {
      const detail = await res.text()
      // 402 is DeepSeek's prepaid-balance error and the likeliest failure here,
      // so name it rather than leaving the user staring at a status code.
      const msg =
        res.status === 402
          ? "DeepSeek rejected the request: insufficient balance. Top up at platform.deepseek.com."
          : `DeepSeek error ${res.status}: ${detail.slice(0, 200)}`
      return NextResponse.json({ error: msg }, { status: 502 })
    }

    const json = await res.json()
    const answer = json?.choices?.[0]?.message?.content?.trim()
    if (!answer) {
      return NextResponse.json(
        { error: "DeepSeek returned an empty answer." },
        { status: 502 },
      )
    }

    return NextResponse.json({
      answer,
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
