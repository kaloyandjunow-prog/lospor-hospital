"use client"

import { useTranslations } from "next-intl"
import { ChevronRight } from "lucide-react"
import type { BroselowResult } from "@lospor/core/broselow"
import { Button } from "@/components/ui/button"
import { CaseSidebar, type CaseStages, type SidebarPatient, type SidebarSection } from "@/components/forms/CaseSidebar"

export type { SidebarSection } from "@/components/forms/CaseSidebar"

export type SidebarScore = { label: string; value: number | null; max: number }

export type PreopSidebarProps = {
  sections: SidebarSection[]
  patient: SidebarPatient
  broselow: BroselowResult | null
  scores: SidebarScore[]
  asa: { chosen: string | null; suggested: string | null }
  disabled?: boolean
  stages?: CaseStages
}

export function sectionElement(id: string): HTMLElement | null {
  return typeof document === "undefined" ? null : document.getElementById(`preop-sec-${id}`)
}

/**
 * The preoperative step's view of the case panel (CaseSidebar): its sections,
 * the scores as they are worked out, ASA, and the way on to intraop.
 */
export function PreopSidebar({ sections, patient, broselow, scores, asa, disabled, stages }: PreopSidebarProps) {
  const t = useTranslations()
  const asaValue = asa.chosen
    ? `ASA ${asa.chosen}`
    : asa.suggested ? <span className="font-normal text-blue-600 dark:text-blue-400">{t("preop.sidebar.asaSuggested", { value: asa.suggested })}</span> : "—"
  return (
    <CaseSidebar
      stages={stages ?? { current: 0 }}
      sections={sections}
      anchorPrefix="preop-sec-"
      patient={patient}
      broselow={broselow}
      factsTitle={t("preop.sidebar.scores")}
      facts={[
        { label: "ASA", value: asaValue },
        ...scores.map(score => ({ label: score.label, value: score.value == null ? "—" : `${score.value} / ${score.max}` })),
      ]}
      action={(
        <Button type="submit" disabled={disabled} className="w-full gap-2 bg-blue-600 hover:bg-blue-700">
          {t("preop.continueIntraop")} <ChevronRight className="h-4 w-4" />
        </Button>
      )}
      testId="preop-sidebar"
      stripTestId="preop-section-strip"
    />
  )
}
