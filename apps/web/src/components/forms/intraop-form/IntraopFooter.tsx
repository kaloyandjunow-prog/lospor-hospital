"use client"

import { Button } from "@/components/ui/button"
import { ChevronLeft, ChevronRight } from "lucide-react"

/** Sticky footer, always visible across all tabs: back, save changes, continue to postop. */
export function IntraopFooter({ t, onBack, onSave, onContinue, showSave, saved }: {
  t: (key: string) => string
  onBack: () => void
  onSave: () => void
  onContinue: () => void
  showSave: boolean
  saved: boolean
}) {
  return (
    <div className="sticky bottom-0 z-20 bg-white dark:bg-[#111] border-t border-slate-200 dark:border-[#2a2a2a] px-4 py-3 flex justify-between items-center gap-3 mt-0">
      <Button type="button" variant="outline" size="lg" className="gap-2" onClick={onBack}>
        <ChevronLeft className="h-4 w-4" /> {t("common.back")}
      </Button>
      <div className="flex items-center gap-3">
        {showSave && (
          <Button type="button" size="lg"
            className={`gap-2 transition-colors ${saved ? "bg-emerald-600 hover:bg-emerald-700" : "bg-slate-600 hover:bg-slate-700"}`}
            onClick={onSave}>
            {saved ? t("intraop.saved") : t("intraop.saveChanges")}
          </Button>
        )}
        <Button type="button" size="lg" className="gap-2 bg-blue-600 hover:bg-blue-700" onClick={onContinue} data-tour="intraop-submit">
          {t("intraop.continuePostop")} <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
