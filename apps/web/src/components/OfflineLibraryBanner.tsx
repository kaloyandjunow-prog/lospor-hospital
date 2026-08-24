"use client"
import { useLocale, useTranslations } from "next-intl"
import { useAnyLibraryFallback } from "@/hooks/useOptionLibrary"

// Shown whenever any option-library category is currently serving
// cached/bundled data instead of a live server fetch — so a clinician never
// silently trusts a picker list without knowing it might be out of date.
// Disappears automatically the moment the background retry in
// useOptionLibrary succeeds. See docs/post-migration-seeds.md and
// scripts/generate-option-library-fallback.ts for how the bundled tier is
// produced and kept in sync.
export function OfflineLibraryBanner() {
  const locale = useLocale()
  const t = useTranslations()
  const { active, snapshotDate } = useAnyLibraryFallback()
  if (!active) return null

  const dateStr = snapshotDate !== "unknown" ? new Date(snapshotDate).toLocaleDateString(locale) : null
  const message = t("intraop.offlineLibrary")

  return (
    <div className="no-print bg-amber-50 dark:bg-amber-950/40 border-b border-amber-200 dark:border-amber-800 px-4 py-1.5 text-center text-xs text-amber-800 dark:text-amber-300">
      {dateStr ? t("intraop.offlineLibraryAsOf", { message, date: dateStr }) : message}
    </div>
  )
}
