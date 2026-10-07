import { Suspense } from "react"
import TeamCompareContent from "./content"

export default function TeamComparePage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-6xl px-4 py-14 text-muted-foreground">
          Loading…
        </div>
      }
    >
      <TeamCompareContent />
    </Suspense>
  )
}
