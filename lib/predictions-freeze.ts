import { after } from "next/server"
import { supabase } from "@/lib/supabase"
import { supabaseAdmin } from "@/lib/supabase-admin"
import type { MatchPrediction } from "@/lib/predictions"

type FrozenRow = {
  event_id: number
  predicted: "home" | "draw" | "away"
  home_win: number
  draw: number
  away_win: number
}

async function fetchFrozen(eventIds: number[]): Promise<Map<number, FrozenRow>> {
  const out = new Map<number, FrozenRow>()
  if (eventIds.length === 0) return out
  for (let i = 0; i < eventIds.length; i += 500) {
    const chunk = eventIds.slice(i, i + 500)
    const { data } = await supabase
      .from("predictions")
      .select("event_id, predicted, home_win, draw, away_win")
      .in("event_id", chunk)
    for (const row of (data ?? []) as FrozenRow[]) out.set(row.event_id, row)
  }
  return out
}

export type PredictionWithFreeze = MatchPrediction & { frozen: boolean }

/**
 * Freeze upcoming predictions once (first-write wins) and overlay frozen rows
 * onto the computed list so settled matches always display what was predicted
 * at kickoff, not what the current model would say with hindsight.
 *
 * Settled matches without a frozen row carry frozen:false; the UI excludes
 * them from the accuracy tracker since we have no honest kickoff record.
 */
export async function withFrozenPredictions(
  computed: MatchPrediction[],
): Promise<PredictionWithFreeze[]> {
  const frozen = await fetchFrozen(computed.map((p) => p.event_id))

  const toFreeze = computed
    .filter((p) => p.actual === null && !frozen.has(p.event_id))
    .map((p) => ({
      event_id: p.event_id,
      predicted: p.predicted,
      home_win: p.homeWin,
      draw: p.draw,
      away_win: p.awayWin,
    }))

  if (toFreeze.length > 0) {
    after(async () => {
      await supabaseAdmin
        .from("predictions")
        .upsert(toFreeze, { onConflict: "event_id", ignoreDuplicates: true })
    })
  }

  return computed.map((p) => {
    const f = frozen.get(p.event_id)
    if (f) {
      return {
        ...p,
        predicted: f.predicted,
        homeWin: f.home_win,
        draw: f.draw,
        awayWin: f.away_win,
        correct: p.actual ? f.predicted === p.actual : null,
        frozen: true,
      }
    }
    return { ...p, frozen: false }
  })
}
