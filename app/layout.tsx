import type { Metadata } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import Link from "next/link"
import "./globals.css"

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] })
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] })

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
      className={`${geistSans.variable} ${geistMono.variable} dark h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <nav className="border-b border-border">
          <div className="mx-auto max-w-6xl flex items-center justify-between px-4 h-14">
            <Link href="/" className="text-lg font-bold tracking-tight">
              footyy
            </Link>
            <div className="flex gap-4 text-sm">
              <Link
                href="/"
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                Players
              </Link>
              <Link
                href="/compare"
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                Compare
              </Link>
            </div>
          </div>
        </nav>
        <main className="flex-1">{children}</main>
      </body>
    </html>
  )
}
