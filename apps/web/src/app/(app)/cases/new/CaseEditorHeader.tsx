import { UserRound } from "lucide-react"
import { useTranslations } from "next-intl"
import { CaseMeta } from "@/components/CaseMeta"
import { HospitalPatientReference } from "@/components/HospitalPatientReference"

export type CaseSaveStatus = "idle" | "saving" | "saved" | "queued" | "blocked" | "error"

export function CaseEditorHeader({
  caseId,
  caseCode,
  saveStatus,
  saveError,
  maskedIdentifier,
  onPatientRelink,
  patientRelinkDisabled,
}: {
  caseId: string | null
  caseCode: string | null
  saveStatus: CaseSaveStatus
  saveError: string | null
  maskedIdentifier: string | null
  onPatientRelink: (patientNumber: string, correctionReason: string) => Promise<{ ok: true } | { ok: false; error: string }>
  patientRelinkDisabled: boolean
}) {
  const t = useTranslations()
  return (
    <div className="no-print flex items-center gap-4">
      <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full border-2 border-blue-100 bg-blue-50 dark:border-blue-900 dark:bg-blue-950">
        <UserRound className="h-9 w-9 text-blue-500 dark:text-blue-400" strokeWidth={1.5} />
      </div>
      <div className="flex-1">
        <h1 className="text-2xl font-bold text-slate-800">{t("case.newTitle")}</h1>
        <p className="mt-0.5 text-sm text-slate-500">{t("case.newSubtitle")}</p>
        {caseId ? (
          <HospitalPatientReference
            maskedIdentifier={maskedIdentifier}
            onRelink={onPatientRelink}
            disabled={patientRelinkDisabled}
          />
        ) : null}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1.5">
        {caseId && caseCode ? <CaseMeta caseId={caseId} caseCode={caseCode} /> : null}
        <div className="text-xs">
          {saveStatus === "saving" ? <span className="animate-pulse text-slate-400">{t("case.savingDraft")}</span> : null}
          {saveStatus === "saved" ? <span className="text-green-500">{t("case.draftSaved")}</span> : null}
          {saveStatus === "queued" ? <span className="text-amber-500">{t("case.draftQueued")}</span> : null}
          {saveStatus === "blocked" ? <span className="text-red-500">{saveError ?? t("case.draftBlocked")}</span> : null}
          {saveStatus === "error" ? <span className="text-red-400">{saveError ?? t("case.autoSaveFailed")}</span> : null}
        </div>
      </div>
    </div>
  )
}
