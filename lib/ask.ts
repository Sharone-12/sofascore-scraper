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

/** Everyday words mapped to the `position` values actually in the table. */
export const POSITION_WORDS: Record<string, string> = {
  forward: "Forward",
  forwards: "Forward",
  striker: "Forward",
  strikers: "Forward",
  attacker: "Forward",
  attackers: "Forward",
  winger: "Forward",
  wingers: "Forward",
  midfielder: "Midfielder",
  midfielders: "Midfielder",
  midfield: "Midfielder",
  playmaker: "Midfielder",
  playmakers: "Midfielder",
  defender: "Defender",
  defenders: "Defender",
  defence: "Defender",
  defense: "Defender",
  defensive: "Defender",
  "centre-back": "Defender",
  "center-back": "Defender",
  centreback: "Defender",
  centerback: "Defender",
  fullback: "Defender",
  "full-back": "Defender",
}

const WORD_NUMBERS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5,
  six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
}

/**
 * Stated verbatim to the model so it never implies worldwide coverage. The
 * data is two full leagues plus two clubs — "best in the world" can only
 * honestly mean "best in here".
 */
export const DATA_SCOPE =
  "Premier League and La Liga (every club), plus Paris Saint-Germain and " +
  "FC Bayern München only. No Serie A, and no other Ligue 1 or Bundesliga clubs."

export function parseIntent(question: string, hasPlayers = false): Intent {
  const q = question.toLowerCase()

  const positions = [
    ...new Set(
      Object.entries(POSITION_WORDS)
        .filter(([word]) =>
          new RegExp(`\\b${word.replace(/-/g, "\\-")}\\b`).test(q),
        )
        .map(([, pos]) => pos),
    ),
  ]

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
