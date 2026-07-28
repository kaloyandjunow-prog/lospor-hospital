"use client"

import { useState, useRef } from "react"
import { Trash2 } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { autosaveManager } from "@/lib/autosave-manager"

export function DeleteDraftButton({ caseId }: { caseId: string }) {
  const t = useTranslations()
  const [stage, setStage] = useState<"idle" | "confirm" | "deleting">("idle")
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const router = useRouter()

  function handleClick(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()

    if (stage === "deleting") return

    if (stage === "idle") {
      setStage("confirm")
      timerRef.current = setTimeout(() => setStage("idle"), 3000)
      return
    }

    if (timerRef.current) clearTimeout(timerRef.current)
    setStage("deleting")
    fetch(`/api/cases/${caseId}`, { method: "DELETE" })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Delete failed (${response.status})`)
        await autosaveManager.discardCase(caseId)
        router.refresh()
      })
      .catch(() => setStage("idle"))
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={stage === "deleting"}
      className={`inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-md border transition-colors ${
        stage === "confirm"
          ? "border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400"
          : "border-slate-200 dark:border-[#3a3a3a] text-slate-400 dark:text-slate-500 hover:border-red-300 hover:text-red-500 dark:hover:border-red-700 dark:hover:text-red-400"
      }`}
    >
      <Trash2 className="h-3.5 w-3.5" />
      {stage === "deleting" ? t("case.deletingBtn") : stage === "confirm" ? t("case.confirmDelete") : t("case.deleteBtn")}
    </button>
  )
}
