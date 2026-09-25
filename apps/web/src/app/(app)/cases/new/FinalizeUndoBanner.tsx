"use client"

import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { CheckCircle2 } from "lucide-react"
import { Button } from "@/components/ui/button"

/** Shown for five minutes after finalizing: the countdown, print, and undo. */
export function FinalizeUndoBanner({ undoSecsLeft, undoExpired, finalizedCaseId, onUndo }: {
  undoSecsLeft: number | null
  undoExpired: boolean
  finalizedCaseId: string | null
  onUndo: () => void
}) {
  const t = useTranslations()
  const router = useRouter()
  if (undoSecsLeft === null && !undoExpired) return null
  return (
    <div className={`no-print rounded-lg border px-4 py-3 flex items-center justify-between gap-3 ${
      undoExpired
        ? "border-slate-200 dark:border-[#333] bg-slate-50 dark:bg-[#1a1a1a]"
        : "border-green-200 dark:border-green-700/50 bg-green-50 dark:bg-green-950/20"
    }`}>
      <div className="flex items-center gap-2">
        <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400 shrink-0" />
        {undoExpired ? (
          <span className="text-sm text-slate-600 dark:text-slate-400">{t("case.undoExpired")}</span>
        ) : (
          <span className="text-sm font-bold tabular-nums text-green-700 dark:text-green-300">
            {t("case.finalizedCountdown", {
              time: `${String(Math.floor((undoSecsLeft ?? 0) / 60)).padStart(2, "0")}:${String((undoSecsLeft ?? 0) % 60).padStart(2, "0")}`,
            })}
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        {/* Case is finished — offer the two-page record straight away */}
        {finalizedCaseId && (
          <Button
            size="sm"
            className="bg-blue-600 hover:bg-blue-700 text-white"
            onClick={() => router.push(`/cases/${finalizedCaseId}/print`)}
          >
            {t("common.printCase")}
          </Button>
        )}
        {!undoExpired && undoSecsLeft !== null && (
          <Button
            size="sm"
            variant="outline"
            className="border-green-300 text-green-700 hover:bg-green-100 dark:border-green-600 dark:text-green-300 dark:hover:bg-green-900/40"
            onClick={onUndo}
          >
            {t("case.undo")}
          </Button>
        )}
      </div>
    </div>
  )
}
