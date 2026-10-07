/**
 * Player headshot and team crest URLs.
 *
 * Two sources, tried in order by <PlayerAvatar> / <TeamCrest>:
 *
 * 1. Our Supabase Storage mirror, filled by sync_images.py. Preferred: our own
 *    CDN, and it keeps working if Sofascore tightens its gate.
 * 2. Sofascore direct, for ids the mirror hasn't picked up yet (a player signed
 *    since the last run). Cloudflare serves these ONLY when the request carries
 *    no foreign referer, so consumers must set referrerPolicy="no-referrer" —
 *    a plain <img> from our domain sends our host and gets a 403. The `img.`
 *    host is the one that works; www.sofascore.com/api/... 403s regardless.
 */
const MIRROR = `${process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""}/storage/v1/object/public/images`
const SOURCE = "https://img.sofascore.com/api/v1"

export function playerImage(playerId: number | string): string {
  return `${MIRROR}/players/${playerId}.png`
}

export function playerImageFallback(playerId: number | string): string {
  return `${SOURCE}/player/${playerId}/image`
}

export function teamImage(teamId: number | string): string {
  return `${MIRROR}/teams/${teamId}.png`
}

export function teamImageFallback(teamId: number | string): string {
  return `${SOURCE}/team/${teamId}/image`
}

/** Initials shown when neither source has an image. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return "?"
  const first = parts[0][0] ?? ""
  const last = parts.length > 1 ? (parts[parts.length - 1][0] ?? "") : ""
  return (first + last).toUpperCase()
}
