"use client"

import { useLocale } from "next-intl"
import { Users } from "lucide-react"
import { casePresenceLabel } from "@lospor/core/case-presence"
import { useCasePresence } from "@/hooks/useCasePresence"

/** "Case open by: ..." above a case while more than one screen is on it (10.8.0). Not a lock: only a notice. */
export function CasePresenceBanner({ caseId, enabled = true }: { caseId: string | null; enabled?: boolean }) {
  const locale = useLocale()
  const label = casePresenceLabel(useCasePresence(caseId, enabled), locale === "bg" ? "bg" : "en")
  if (!label) return null
  return (
    <div role="status" data-testid="case-presence" className="no-print flex items-center gap-2 rounded-lg border border-sky-300/50 bg-sky-50 px-3 py-2 text-sm font-semibold text-sky-800 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-200">
      <Users className="h-4 w-4 shrink-0" aria-hidden />
      <span className="min-w-0 break-words">{label}</span>
    </div>
  )
}
