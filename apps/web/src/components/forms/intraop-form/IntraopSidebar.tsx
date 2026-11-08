"use client"

import { broselowZone } from "@lospor/core/broselow"
import { CaseSidebar, sidebarPatientOf, type CaseStages } from "@/components/forms/CaseSidebar"
import { techniqueDisplayLabel, type buildTree } from "@/components/TechniqueTree"
import type { PreopSummary } from "@/components/forms/preop-summary"

const minutesOf = (time: string | null | undefined) => {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time ?? "")
  return match ? Number(match[1]) * 60 + Number(match[2]) : null
}

/**
 * The case panel (10.0.0): the same one as preop and postop, with this step's
 * parts, what is needed to finalise, and its times.
 */
export function IntraopSidebar({ t, locale, stages, preop, isPediatric, startTime, endTime, techniques, techniqueTree }: {
  t: (key: string) => string
  locale: string
  stages?: CaseStages
  preop?: PreopSummary | null
  isPediatric: boolean
  startTime: string | null | undefined
  endTime: string | null | undefined
  techniques: string[]
  techniqueTree: ReturnType<typeof buildTree>
}) {
  const startMinutes = minutesOf(startTime)
  const endMinutes = minutesOf(endTime)
  const durationMinutes = startMinutes != null && endMinutes != null ? (endMinutes - startMinutes + 1440) % 1440 : null
  return (
    <CaseSidebar
      stages={stages ?? { current: 1 }}
      sections={[
        { id: "overview", label: t("intraop.tabs.overview"), missing: !startTime || !endTime },
        { id: "anaesthesia", label: t("intraop.tabs.anaesthesia"), missing: techniques.length === 0 },
        { id: "chart", label: t("intraop.tabs.chart"), missing: false },
        { id: "finish", label: t("intraop.tabs.finish"), missing: false },
      ]}
      anchorPrefix="intraop-sec-"
      patient={sidebarPatientOf(preop, locale)}
      broselow={isPediatric ? broselowZone({ clinicalMode: "PEDIATRIC", heightCm: preop?.heightCm ?? null, weightKg: preop?.weightKg ?? null }) : null}
      factsTitle={t("intraop.sidebar.title")}
      facts={[
        { label: t("intraop.startTime"), value: startTime || "—" },
        { label: t("intraop.endTime"), value: endTime || "—" },
        { label: t("intraop.sidebar.duration"), value: durationMinutes == null ? "—" : `${Math.floor(durationMinutes / 60)} h ${durationMinutes % 60} min` },
        { label: t("intraop.sidebar.technique"), value: techniques.length ? techniques.slice(0, 2).map(value => techniqueDisplayLabel(value, techniqueTree)).join(", ") : "—" },
        ...(preop?.asaScore ? [{ label: "ASA", value: preop.asaScore }] : []),
      ]}
      // The footer below already carries Continue; the panel stays clear of it.
      clearFooter
      testId="intraop-sidebar"
      stripTestId="intraop-section-strip"
    />
  )
}
