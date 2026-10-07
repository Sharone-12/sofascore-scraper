import { Suspense } from "react"
import CompareContent from "./content"

export default function ComparePage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-6xl px-4 py-8 text-muted-foreground">
          Loading...
        </div>
      }
    >
      <CompareContent />
    </Suspense>
  )
}
