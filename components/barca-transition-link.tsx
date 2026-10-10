"use client"

import { useRef, useState, type MouseEvent, type ReactNode } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"

const MAX_WAIT_MS = 3500

/**
 * Barca-only Link. On click, overlays a short video, then routes to href when
 * the video ends (or after MAX_WAIT_MS as a safety net). Modifier-click falls
 * back to a plain Link so middle-click / cmd-click still open in a new tab.
 */
export function BarcaTransitionLink({
  href,
  className,
  children,
}: {
  href: string
  className?: string
  children: ReactNode
}) {
  const router = useRouter()
  const videoRef = useRef<HTMLVideoElement>(null)
  const [playing, setPlaying] = useState(false)
  const navigatedRef = useRef(false)

  function go() {
    if (navigatedRef.current) return
    navigatedRef.current = true
    router.push(href)
  }

  function onClick(e: MouseEvent<HTMLAnchorElement>) {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
    e.preventDefault()
    setPlaying(true)
    window.setTimeout(go, MAX_WAIT_MS)
    const el = videoRef.current
    if (el) {
      el.currentTime = 0
      void el.play().catch(go)
    }
  }

  return (
    <>
      <Link href={href} className={className} onClick={onClick}>
        {children}
      </Link>
      {playing && (
        <div className="fixed inset-0 z-[100] bg-black flex items-center justify-center animate-in fade-in duration-200">
          <video
            ref={videoRef}
            src="/barca-transition.mp4"
            muted
            playsInline
            autoPlay
            onEnded={go}
            onError={go}
            className="max-w-full max-h-full object-contain"
          />
        </div>
      )}
    </>
  )
}
