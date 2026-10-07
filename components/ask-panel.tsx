"use client"

import { useState, useCallback } from "react"
import { useSearchParams } from "next/navigation"
import Link from "next/link"
import { resolveSeason } from "@/lib/seasons"

export type Cited = {
  player: string
  slug: string
  team: string
  score: number
  minutes: number
}

export type AskState = {
  loading: boolean
  answer: string | null
  cited: Cited[]
  error: string | null
}

const EMPTY: AskState = { loading: false, answer: null, cited: [], error: null }

/** Shared by the floating panel and the compare page's "Who's better?" button. */
export function useAsk() {
  const [state, setState] = useState<AskState>(EMPTY)
  const season = resolveSeason(useSearchParams().get("season"))

  const ask = useCallback(async (question: string, slugs: string[] = []) => {
    setState({ ...EMPTY, loading: true })
    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, slugs, season }),
      })
      const json = await res.json()
      if (!res.ok) {
        setState({
          ...EMPTY,
          error: json.error ?? `Request failed (${res.status})`,
        })
        return
      }
      setState({
        loading: false,
        answer: json.answer ?? null,
        cited: json.cited ?? [],
        error: null,
      })
    } catch (e) {
      setState({
        ...EMPTY,
        error: e instanceof Error ? e.message : "Network error",
      })
    }
  }, [season])

  return { ...state, ask }
}

export function AskAnswer({ loading, answer, cited, error }: AskState) {
  if (loading) {
    return (
      <p className="text-muted-foreground text-sm animate-pulse">Thinking…</p>
    )
  }
  if (error) {
    return (
      <p className="text-sm" style={{ color: "oklch(0.70 0.17 25)" }}>
        {error}
      </p>
    )
  }
  if (!answer) return null

  return (
    <div className="space-y-3">
      {answer.split(/\n{2,}/).map((para, i) => (
        <p key={i} className="text-sm leading-relaxed whitespace-pre-wrap">
          {para}
        </p>
      ))}
      {cited.length > 0 && (
        <div className="pt-2 border-t border-white/5">
          <div className="stat-label mb-1.5">Players used</div>
          <div className="flex flex-wrap gap-1.5">
            {cited.slice(0, 12).map((c) => (
              <Link
                key={c.slug + c.player}
                href={`/player/${c.slug}`}
                className="text-xs px-2 py-0.5 rounded bg-secondary/50 hover:bg-secondary transition-colors"
                title={`${c.team} · score ${c.score} · ${c.minutes} min`}
              >
                {c.player}
                <span className="ml-1.5 tabular-nums text-muted-foreground">
                  {c.score}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

const SUGGESTIONS = [
  "Who's the best midfielder?",
  "Top 3 forwards this season",
  "Who's the best defender and why?",
]

export function AskPanel() {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState("")
  const { loading, answer, cited, error, ask } = useAsk()

  function submit(question: string) {
    const text = question.trim()
    if (!text || loading) return
    setQ(text)
    ask(text)
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="fixed bottom-5 right-5 z-50 rounded-full px-4 py-3 text-sm font-medium shadow-lg transition-transform hover:scale-105"
        style={{ background: "var(--brand)", color: "oklch(0.15 0 0)" }}
      >
        {open ? "Close" : "Ask"}
      </button>

      {open && (
        <div className="fixed bottom-20 right-5 z-50 w-[min(26rem,calc(100vw-2.5rem))] max-h-[70vh] overflow-y-auto surface rounded-2xl bg-card p-4 shadow-2xl">
          <div className="stat-label mb-2">Ask about the stats</div>

          <form
            onSubmit={(e) => {
              e.preventDefault()
              submit(q)
            }}
            className="flex gap-2"
          >
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Who's the best midfielder?"
              maxLength={500}
              className="flex-1 min-w-0 rounded-lg bg-secondary/40 px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-white/20"
            />
            <button
              type="submit"
              disabled={loading || !q.trim()}
              className="rounded-lg px-3 py-2 text-sm font-medium disabled:opacity-40"
              style={{ background: "var(--brand)", color: "oklch(0.15 0 0)" }}
            >
              Ask
            </button>
          </form>

          {!answer && !loading && !error && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => submit(s)}
                  className="text-xs px-2 py-1 rounded bg-secondary/40 hover:bg-secondary transition-colors text-muted-foreground"
                >
                  {s}
                </button>
              ))}
            </div>
          )}

          <div className="mt-3">
            <AskAnswer
              loading={loading}
              answer={answer}
              cited={cited}
              error={error}
            />
          </div>
        </div>
      )}
    </>
  )
}
