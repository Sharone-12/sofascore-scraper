import type { Metadata } from "next"
import { Archivo, Oswald } from "next/font/google"
import Link from "next/link"
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
        <nav className="sticky top-0 z-40 border-b border-white/5 bg-background/75 backdrop-blur-xl">
          <div className="mx-auto max-w-6xl flex items-center justify-between px-4 h-16">
            <Link href="/" className="flex items-baseline gap-2 group">
              <span
                className="text-[1.6rem] font-bold tracking-[-0.03em] leading-none"
                style={{ fontFamily: "var(--font-condensed)" }}
              >
                FOOTYY
              </span>
              <span
                className="h-1.5 w-1.5 rounded-full transition-transform duration-200 group-hover:scale-125"
                style={{ background: "var(--pitch)" }}
              />
            </Link>
            <div className="segment flex rounded-full p-1 gap-0.5">
              {[
                { href: "/", label: "Players" },
                { href: "/teams", label: "Teams" },
                { href: "/compare", label: "Compare" },
              ].map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  className="px-3.5 sm:px-4 py-1.5 rounded-full text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors duration-200"
                >
                  {l.label}
                </Link>
              ))}
            </div>
          </div>
        </nav>
        <main className="flex-1">{children}</main>
      </body>
    </html>
  )
}
