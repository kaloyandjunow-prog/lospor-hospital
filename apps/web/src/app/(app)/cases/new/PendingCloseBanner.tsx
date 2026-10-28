"use client"

import { useTranslations } from "next-intl"
import { CheckCircle2 } from "lucide-react"
import { Button } from "@/components/ui/button"

export function PendingCloseBanner({ seconds, onEdit, onClose }: { seconds: number; onEdit: (step: 0 | 1 | 2) => void; onClose: () => void }) {
  const t = useTranslations()
  return <div className="no-print rounded-xl border border-amber-200 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 px-5 py-4 flex items-center justify-between gap-4 flex-wrap">
    <div className="flex items-center gap-3"><CheckCircle2 className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0" /><div><p className="font-semibold text-amber-800 dark:text-amber-300">{t("case.pendingClose")} <span className="font-bold tabular-nums">{String(Math.floor(seconds / 60)).padStart(2, "0")}:{String(seconds % 60).padStart(2, "0")}</span></p><p className="text-sm text-amber-600 dark:text-amber-400">{t("case.pendingCloseHint")}</p></div></div>
    <div className="flex items-center gap-2 flex-wrap"><span className="text-xs text-amber-600 dark:text-amber-400">{t("settings.edit")}:</span><Button size="sm" variant="outline" className="border-amber-300 text-amber-700 hover:bg-amber-100 dark:border-amber-600 dark:text-amber-300 dark:hover:bg-amber-900/40" onClick={() => onEdit(0)}>{t("case.steps.preop")}</Button><Button size="sm" variant="outline" className="border-amber-300 text-amber-700 hover:bg-amber-100 dark:border-amber-600 dark:text-amber-300 dark:hover:bg-amber-900/40" onClick={() => onEdit(1)}>{t("case.steps.intraop")}</Button><Button size="sm" variant="outline" className="border-amber-300 text-amber-700 hover:bg-amber-100 dark:border-amber-600 dark:text-amber-300 dark:hover:bg-amber-900/40" onClick={() => onEdit(2)}>{t("case.steps.postop")}</Button><Button size="sm" className="bg-amber-600 hover:bg-amber-700 text-white" onClick={onClose}>{t("case.closeNow")}</Button></div>
  </div>
}
