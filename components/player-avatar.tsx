"use client"

import { useState, useEffect, useRef } from "react"
import {
  playerImage,
  playerImageFallback,
  teamImage,
  teamImageFallback,
  initials,
} from "@/lib/images"

/**
 * Tries the Supabase mirror, then Sofascore direct, then gives up.
 *
 * referrerPolicy="no-referrer" is load-bearing for the Sofascore step, not a
 * nicety: Cloudflare 403s those when the request carries our own domain as the
 * referer. Plain <img> rather than next/image because the images are already
 * 150x150 / ~7 KB and the fallback host isn't in remotePatterns.
 */
function useFallbackChain(sources: string[]) {
  const [step, setStep] = useState(0)
  const ref = useRef<HTMLImageElement>(null)
  const next = () => setStep((s) => s + 1)

  // These pages are server-rendered, so the browser starts (and can finish)
  // loading the <img> before React hydrates. A failure in that window never
  // fires onError — the handler isn't attached yet — which silently stranded
  // the chain on a dead source. complete && naturalWidth === 0 is the only
  // way to spot an already-failed image after the fact.
  useEffect(() => {
    const el = ref.current
    if (el?.complete && el.naturalWidth === 0) next()
  }, [step])

  return { ref, src: sources[step], exhausted: step >= sources.length, next }
}

export function PlayerAvatar({
  playerId,
  name,
  size = 44,
  ring,
}: {
  playerId: number | string
  name: string
  size?: number
  ring?: string
}) {
  const { ref, src, exhausted, next } = useFallbackChain([
    playerImage(playerId),
    playerImageFallback(playerId),
  ])

  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full overflow-hidden bg-secondary/60 text-muted-foreground font-medium select-none"
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.34),
        boxShadow: ring ? `0 0 0 2px ${ring}` : undefined,
      }}
    >
      {exhausted ? (
        initials(name)
      ) : (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          key={src}
          ref={ref}
          src={src}
          alt={name}
          width={size}
          height={size}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={next}
          className="w-full h-full object-cover"
        />
      )}
    </span>
  )
}

export function TeamCrest({
  teamId,
  name,
  size = 18,
}: {
  teamId: number | string
  name: string
  size?: number
}) {
  const { ref, src, exhausted, next } = useFallbackChain([
    teamImage(teamId),
    teamImageFallback(teamId),
  ])
  if (exhausted) return null

  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img
      key={src}
      ref={ref}
      src={src}
      alt={name}
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={next}
      className="inline-block shrink-0 object-contain"
      style={{ width: size, height: size }}
    />
  )
}
