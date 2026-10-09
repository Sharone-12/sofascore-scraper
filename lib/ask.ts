/**
 * Turns a free-text football question into a retrieval plan.
 *
 * Deliberately regex, not an LLM call: it runs in a millisecond, costs nothing
 * and is testable. The model is spent on judgement, not on parsing "top 3".
 */

export type Intent = {
  positions: string[]
  limit: number
  season?: string
  mode: "rank" | "compare"
}

/**
 * Everyday words mapped to the `role` values in the table. Longer phrases are
 * matched first so "defensive midfielder" doesn't resolve as plain "midfielder".
 */
export const POSITION_WORDS: Record<string, string> = {
  // Striker
  striker: "Striker",
  strikers: "Striker",
  "centre-forward": "Striker",
  "center-forward": "Striker",
  "number 9": "Striker",
  forward: "Striker",
  forwards: "Striker",
  finisher: "Striker",
  // Winger
  winger: "Winger",
  wingers: "Winger",
  wide: "Winger",
  // Attacking Mid
  "attacking midfielder": "Attacking Mid",
  "attacking mid": "Attacking Mid",
  playmaker: "Attacking Mid",
  playmakers: "Attacking Mid",
  "number 10": "Attacking Mid",
  // Defensive Mid
  "defensive midfielder": "Central Mid",
  "defensive mid": "Central Mid",
  "holding midfielder": "Central Mid",
  "number 6": "Central Mid",
  anchor: "Central Mid",
  // Central Mid
  "central midfielder": "Central Mid",
  "centre midfielder": "Central Mid",
  "box to box": "Central Mid",
  "number 8": "Central Mid",
  midfielder: "Central Mid",
  midfielders: "Central Mid",
  midfield: "Central Mid",
  // Centre-Back
  "centre-back": "Centre-Back",
  "center-back": "Centre-Back",
  centreback: "Centre-Back",
  centerback: "Centre-Back",
  "centre back": "Centre-Back",
  "center back": "Centre-Back",
  defender: "Centre-Back",
  defenders: "Centre-Back",
  defence: "Centre-Back",
  defense: "Centre-Back",
  // Full-Back
  fullback: "Full-Back",
  "full-back": "Full-Back",
  "full back": "Full-Back",
  "left-back": "Full-Back",
  "right-back": "Full-Back",
  "left back": "Full-Back",
  "right back": "Full-Back",
  "wing-back": "Full-Back",
  "wing back": "Full-Back",
}

const WORD_NUMBERS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5,
  six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
}

/**
 * Stated verbatim to the model so it never implies worldwide coverage. The
 * data is three competitions plus two clubs — "best in the world" can only
 * honestly mean "best in here".
 */
export const DATA_SCOPE =
  "Premier League, La Liga, and Champions League (every club), plus Paris Saint-Germain and " +
  "FC Bayern München only. No Serie A, and no other Ligue 1 or Bundesliga clubs."

export function parseIntent(question: string, hasPlayers = false): Intent {
  const q = question.toLowerCase()

  // Longest phrase wins, and its text is consumed, so "defensive midfielder"
  // resolves to Defensive Mid and not also to Central Mid via "midfielder".
  let rest = q
  const positions: string[] = []
  for (const [word, role] of Object.entries(POSITION_WORDS).sort(
    (a, b) => b[0].length - a[0].length,
  )) {
    const re = new RegExp(`\\b${word.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")}\\b`)
    if (re.test(rest)) {
      rest = rest.replace(re, " ")
      if (!positions.includes(role)) positions.push(role)
    }
  }

  // "top 3", "best five", "3 best" — default 5, capped so the prompt stays small.
  let limit = 5
  const digits =
    q.match(/\b(?:top|best|first)\s+(\d{1,2})\b/) ??
    q.match(/\b(\d{1,2})\s+(?:best|top)\b/)
  const words = q.match(
    /\b(?:top|best)\s+(one|two|three|four|five|six|seven|eight|nine|ten)\b/,
  )
  if (digits) limit = parseInt(digits[1], 10)
  else if (words) limit = WORD_NUMBERS[words[1]]
  limit = Math.min(Math.max(limit, 1), 10)

  // "2025/26" or "25/26".
  let season: string | undefined
  const explicit = q.match(/\b(?:20)?(\d{2})\s*[/-]\s*(?:20)?(\d{2})\b/)
  if (explicit) season = `20${explicit[1]}/${explicit[2]}`

  return { positions, limit, season, mode: hasPlayers ? "compare" : "rank" }
}
