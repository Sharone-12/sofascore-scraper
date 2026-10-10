"use client"

import { useState, useRef, useCallback } from "react"
import { useRouter } from "next/navigation"

export function BarcaTransition({
  href,
  children,
}: {
  href: string
  children: React.ReactNode
}) {
  const router = useRouter()
  const [playing, setPlaying] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      setPlaying(true)
      const vid = videoRef.current
      if (vid) {
        vid.currentTime = 0
        vid.play().catch(() => {
          router.push(href)
        })
      }
    },
    [href, router],
  )

  const handleEnded = useCallback(() => {
    router.push(href)
  }, [href, router])

  return (
    <>
      <div onClick={handleClick} className="cursor-pointer">
        {children}
      </div>

      {playing && (
        <div className="fixed inset-0 z-[9999] bg-black flex items-center justify-center animate-fade-in">
          <video
            ref={videoRef}
            src="/barca-transition.mp4"
            onEnded={handleEnded}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover"
          />
        </div>
      )}
    </>
  )
}
