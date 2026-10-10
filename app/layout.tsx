import type { Metadata } from "next"
import { Archivo, Oswald } from "next/font/google"
import Link from "next/link"
import { Suspense } from "react"
import { AskPanel } from "@/components/ask-panel"
import { SeasonToggle } from "@/components/season-toggle"
import { MainNav, MainNavFallback } from "@/components/main-nav"
import { TooltipProvider } from "@/components/ui/tooltip"
import "./globals.css"

const sans = Archivo({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
})

const condensed = Oswald({
  subsets: ["latin"],
  variable: "--font-condensed",
  display: "swap",
})

export const metadata: Metadata = {
  title: "footyy — Football Stats & Player Comparison",
  description:
    "Search, compare, and analyze football player stats across Europe's top leagues.",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html
      lang="en"
      className={`${sans.variable} ${condensed.variable} dark h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <TooltipProvider delay={150}>
        <nav className="sticky top-0 z-40 pointer-events-none">
          <div
            aria-hidden
            className="absolute inset-x-0 top-0 h-24 -z-10 bg-gradient-to-b from-background via-background/85 to-transparent"
          />
          <div className="mx-auto max-w-6xl flex items-center justify-between px-4 pt-4 pb-2">
            <Link
              href="/"
              className="pointer-events-auto nav-pill flex items-center gap-2 pl-3 pr-4 py-2 group"
            >
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="var(--pitch)"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="transition-transform duration-500 group-hover:rotate-180"
                aria-hidden
              >
                <circle cx="12" cy="12" r="9.5" />
                <path d="M12 7.5 8.6 10l1.3 4h4.2l1.3-4z" fill="var(--pitch)" stroke="none" />
                <path d="M12 3v4.5M4.2 9.6 8.6 10M19.8 9.6 15.4 10M7.1 19.3 9.9 14M16.9 19.3 14.1 14" />
              </svg>
              <span
                className="text-[1.4rem] font-bold tracking-[-0.03em] leading-none"
                style={{ fontFamily: "var(--font-condensed)" }}
              >
                FOOTYY
              </span>
            </Link>
            <div className="pointer-events-auto flex items-center gap-2">
              <Suspense fallback={null}>
                <SeasonToggle />
              </Suspense>
              <Suspense fallback={<MainNavFallback />}>
                <MainNav />
              </Suspense>
            </div>
          </div>
        </nav>
        <main className="flex-1">{children}</main>
        {/* Reads ?season= to scope its questions, so it needs a boundary or it
            blocks static prerendering of pages like /_not-found. */}
        <Suspense fallback={null}>
          <AskPanel />
        </Suspense>
        </TooltipProvider>
      </body>
    </html>
  )
}
