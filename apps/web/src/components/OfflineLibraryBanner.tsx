"use client"
import { useAnyLibraryFallback } from "@/hooks/useOptionLibrary"

// Shown whenever any option-library category is currently serving
// cached/bundled data instead of a live server fetch — so a clinician never
// silently trusts a picker list without knowing it might be out of date.
// Disappears automatically the moment the background retry in
// useOptionLibrary succeeds. See docs/post-migration-seeds.md and
// scripts/generate-option-library-fallback.ts for how the bundled tier is
// produced and kept in sync.
export function OfflineLibraryBanner() {
  const { active, snapshotDate } = useAnyLibraryFallback()
  if (!active) return null

  const dateStr = snapshotDate !== "unknown" ? new Date(snapshotDate).toLocaleDateString() : null

  return (
    <div className="no-print bg-amber-50 dark:bg-amber-950/40 border-b border-amber-200 dark:border-amber-800 px-4 py-1.5 text-center text-xs text-amber-800 dark:text-amber-300">
      ⚠ Offline reference list — some option lists may be out of date
      {dateStr ? ` (as of ${dateStr})` : ""}
    </div>
  )
}
