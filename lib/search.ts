/** Index position is the wire format for `l` — append only, never reorder. */
export const LEAGUE_CODES = [
  "Premier League",
  "La Liga",
  "Ligue 1",
  "Bundesliga",
  "Champions League",
] as const

export type LeagueCode = 0 | 1 | 2 | 3 | 4

export const LEAGUE_SHORT: Record<LeagueCode, string> = {
  0: "PL",
  1: "LL",
  2: "L1",
  3: "BL",
  4: "UCL",
}

export const LEAGUE_TOURNAMENT: Record<LeagueCode, number> = {
  0: 17,  // Premier League
  1: 8,   // La Liga
  2: 34,  // Ligue 1
  3: 35,  // Bundesliga
  4: 7,   // Champions League
}

export function leagueCode(name: string): LeagueCode {
  const i = LEAGUE_CODES.indexOf(name as (typeof LEAGUE_CODES)[number])
  return (i === -1 ? 0 : i) as LeagueCode
}

export type IndexedPlayer = {
  i: number // player_id
  n: string // name
  s: string // slug
  t: string // team
  p: string // position
  l: LeagueCode // index into LEAGUE_CODES
  m: number // minutes, used only to break scoring ties
}

export type Ranked = IndexedPlayer & { hit: [number, number] | null }

/**
 * Strip diacritics so "atletico" matches "Atlético" and "odegaard" matches
 * "Ødegaard". La Liga names make this mandatory, not a nicety.
 */
export function fold(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ø/gi, "o")
    .replace(/đ/gi, "d")
    .replace(/ł/gi, "l")
    .replace(/ß/gi, "ss")
    .toLowerCase()
}

const FULL_PREFIX = 1000
const WORD_PREFIX = 800
const SUBSTRING = 500
const TEAM_MATCH = 200

/** Minutes played, as a bounded 0-10 bonus. Caps so a full season doesn't
 *  outrank a materially better textual match. */
function prominence(minutes: number): number {
  return Math.min(minutes, 3000) / 300
}

/**
 * Football search is surname-led: "yamal" must find "Lamine Yamal", so a match
 * at any word boundary scores nearly as high as one at the start of the name.
 */
function scoreName(folded: string, q: string): { score: number; at: number } | null {
  const at = folded.indexOf(q)
  if (at === -1) return null
  if (at === 0) return { score: FULL_PREFIX, at }
  if (folded[at - 1] === " " || folded[at - 1] === "-")
    return { score: WORD_PREFIX, at }
  return { score: SUBSTRING, at }
}

export function searchPlayers(
  players: IndexedPlayer[],
  query: string,
  limit = 8,
): Ranked[] {
  const q = fold(query.trim())
  if (!q) return []

  const out: { p: IndexedPlayer; score: number; hit: [number, number] | null }[] =
    []

  for (const p of players) {
    const name = scoreName(fold(p.n), q)
    if (name) {
      // Among equally-good textual matches, minutes played decides: typing "mo"
      // should surface Mohamed Salah over a fringe player with a shorter name.
      // Length stays a mild tiebreak, never the dominant term.
      const score = name.score - p.n.length * 0.2 + prominence(p.m)
      out.push({ p, score, hit: [name.at, name.at + q.length] })
      continue
    }
    if (fold(p.t).includes(q)) {
      out.push({ p, score: TEAM_MATCH + prominence(p.m), hit: null })
    }
  }

  out.sort((a, b) => b.score - a.score)
  return out.slice(0, limit).map((r) => ({ ...r.p, hit: r.hit }))
}
