"use client"

import type { ReactNode } from "react"
import { SectionJumpStrip, useActiveJumpSection } from "@/components/forms/SectionJumpStrip"
import { useLocale, useTranslations } from "next-intl"
import { AlertTriangle, CheckCircle2 } from "lucide-react"
import type { BroselowResult } from "@lospor/core/broselow"
import { BroselowBadge } from "@/components/BroselowBadge"
import { useUnitPreferences } from "@/hooks/useUnitPreferences"
import { cmToInches, kgToLb } from "@/lib/unit-conversion"

export type SidebarSection = {
  /** The anchor on the page is `<anchorPrefix><id>`. */
  id: string
  label: string
  /** A required field in this section is still empty. */
  missing: boolean
}

export type SidebarPatient = {
  ageText: string | null
  sexText: string | null
  heightCm: number | null
  weightKg: number | null
  bmi: number | null
  allergy: boolean
  allergyDetails: string[]
}

export type SidebarFact = { label: string; value: ReactNode }

/** Where the case is: preop, intraop, postop, summary. Earlier steps can be opened again. */
export type CaseStages = { current: number; onSelect?: (step: number) => void }

export type CaseSidebarProps = {
  stages?: CaseStages
  sections: SidebarSection[]
  anchorPrefix: string
  patient: SidebarPatient | null
  broselow: BroselowResult | null
  factsTitle: string
  facts: SidebarFact[]
  /** The step's way on: its continue or save button. */
  action?: ReactNode
  /** The step has a sticky footer of its own (intraop): keep the panel clear of it. */
  clearFooter?: boolean
  /** Test ids of the panel and of the narrow-screen strip. */
  testId?: string
  stripTestId?: string
}

/**
 * The case's side panel (10.0.0): one panel beside preop, intraop and postop
 * that stays as the case moves on. Where the case is, the patient's key facts
 * with the allergy warning always in view, the current step's sections and
 * what is still missing, its figures, and the way on. Under a wide screen's
 * width it becomes a strip of jump links, with the allergy warning kept.
 */
export function CaseSidebar({ stages, sections, anchorPrefix, patient, broselow, factsTitle, facts, action, clearFooter = false, testId = "case-sidebar", stripTestId = "case-section-strip" }: CaseSidebarProps) {
  const t = useTranslations()
  const locale = useLocale()
  const { heightUnit, weightUnit } = useUnitPreferences()
  const active = useActiveJumpSection(sections.map(section => section.id), anchorPrefix)
  const missingCount = sections.filter(section => section.missing).length
  const jumpTo = (id: string) => document.getElementById(`${anchorPrefix}${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" })
  const heightText = patient?.heightCm ? (heightUnit === "in" ? `${Math.round(cmToInches(patient.heightCm) * 10) / 10} in` : `${patient.heightCm} cm`) : null
  const weightText = patient?.weightKg ? (weightUnit === "lb" ? `${Math.round(kgToLb(patient.weightKg) * 10) / 10} lb` : `${patient.weightKg} kg`) : null
  const stageLabels = [t("case.stepsShort.preop"), t("case.stepsShort.intraop"), t("case.stepsShort.postop"), t("case.stepsShort.summary")]

  const allergyBanner = patient?.allergy ? (
    <div className="flex items-start gap-2 rounded-lg border-2 border-red-500 bg-red-50 px-2.5 py-1.5 text-xs font-bold text-red-700 dark:bg-red-950/40 dark:text-red-300" data-testid="sidebar-allergy">
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span>{t("preop.sidebar.allergy")}{patient.allergyDetails.length > 0 ? `: ${patient.allergyDetails.join(", ")}` : ""}</span>
    </div>
  ) : null

  return (
    <>
      {/* Narrow screens: a strip of jump links, the allergy warning kept. */}
      <SectionJumpStrip sections={sections} anchorPrefix={anchorPrefix} testId={stripTestId} className="lg:hidden">{allergyBanner}</SectionJumpStrip>

      {/* Wide screens: the panel beside the form. */}
      <aside className="hidden lg:col-start-2 lg:row-span-[99] lg:row-start-1 lg:block" aria-label={t("preop.sidebar.title")} data-testid={testId}>
        {/* The way on is pinned to the panel's foot: a long section list scrolls above it
            instead of pushing it out of sight (10.0.0). */}
        <div className={`sticky top-24 flex flex-col rounded-xl border border-slate-200 bg-white dark:border-[#2a2a2a] dark:bg-[#141414] ${clearFooter ? "max-h-[calc(100vh-20rem)]" : "max-h-[calc(100vh-15rem)]"}`}>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3">
          {stages ? (
            <ol className="grid grid-cols-4 gap-1" aria-label={t("case.sidebarStages")} data-testid="sidebar-stages">
              {stageLabels.map((label, index) => {
                const done = index < stages.current
                const current = index === stages.current
                const open = done && index < 3 && !!stages.onSelect
                return (
                  <li key={label}>
                    <button
                      type="button"
                      disabled={!open}
                      onClick={() => stages.onSelect?.(index)}
                      aria-current={current ? "step" : undefined}
                      className={`flex w-full flex-col items-center gap-0.5 rounded-md px-1 py-1 text-[10px] font-semibold ${
                        current ? "bg-blue-600 text-white" : done ? "text-green-700 hover:bg-green-50 dark:text-green-400 dark:hover:bg-green-950/30" : "text-slate-400"
                      } ${open ? "cursor-pointer" : "cursor-default"}`}
                    >
                      {done ? <CheckCircle2 className="h-3.5 w-3.5" /> : <span className={`h-3.5 w-3.5 rounded-full border-2 ${current ? "border-white" : "border-slate-300 dark:border-slate-600"}`} />}
                      <span className="truncate">{label}</span>
                    </button>
                  </li>
                )
              })}
            </ol>
          ) : null}

          {patient ? (
            <section aria-label={t("preop.sidebar.patient")} className="space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{t("preop.sidebar.patient")}</p>
              {allergyBanner}
              <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                {patient.ageText ? <><dt className="text-slate-400">{t("preop.sidebar.age")}</dt><dd className="text-right font-semibold">{patient.ageText}</dd></> : null}
                {patient.sexText ? <><dt className="text-slate-400">{t("preop.sidebar.sex")}</dt><dd className="text-right font-semibold">{patient.sexText}</dd></> : null}
                {heightText ? <><dt className="text-slate-400">{t("preop.sidebar.height")}</dt><dd className="text-right font-semibold">{heightText}</dd></> : null}
                {weightText ? <><dt className="text-slate-400">{t("preop.sidebar.weight")}</dt><dd className="text-right font-semibold">{weightText}</dd></> : null}
                {patient.bmi ? <><dt className="text-slate-400">{t("preop.sidebar.bmi")}</dt><dd className="text-right font-semibold">{Math.round(patient.bmi * 10) / 10}</dd></> : null}
              </dl>
              {broselow ? (
                <BroselowBadge
                  result={broselow}
                  language={locale}
                  label={t("intraop.equipment.broselow")}
                  basis={t(broselow.basis === "HEIGHT" ? "intraop.equipment.broselowByHeight" : "intraop.equipment.broselowByWeight")}
                  size="sm"
                />
              ) : null}
            </section>
          ) : null}

          <section aria-label={t("preop.sidebar.sections")} className="space-y-1.5">
            <p className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              <span>{t("preop.sidebar.sections")}</span>
              {missingCount > 0 ? <span className="text-red-500">{t("preop.sidebar.missing", { count: missingCount })}</span> : null}
            </p>
            <ul className="space-y-0.5">
              {sections.map(section => (
                <li key={section.id}>
                  <button
                    type="button"
                    onClick={() => jumpTo(section.id)}
                    aria-current={active === section.id ? "true" : undefined}
                    className={`flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left text-sm transition-colors ${
                      active === section.id
                        ? "bg-slate-900 font-semibold text-white dark:bg-slate-100 dark:text-slate-900"
                        : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-[#222]"
                    }`}
                  >
                    <span className="truncate">{section.label}</span>
                    {section.missing ? <span className="h-2 w-2 shrink-0 rounded-full bg-red-500" title={t("preop.sidebar.required")} aria-label={t("preop.sidebar.required")} /> : null}
                  </button>
                </li>
              ))}
            </ul>
          </section>

          {facts.length > 0 ? (
            <section aria-label={factsTitle} className="space-y-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{factsTitle}</p>
              <dl className="space-y-1 text-xs" data-testid="sidebar-scores">
                {facts.map(fact => (
                  <div key={fact.label} className="flex items-baseline justify-between gap-2">
                    <dt className="text-slate-400">{fact.label}</dt>
                    <dd className="text-right font-semibold">{fact.value}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ) : null}

        </div>
        {action ? <div className="shrink-0 border-t border-slate-200 p-3 dark:border-[#2a2a2a]" data-testid="sidebar-action">{action}</div> : null}
        </div>
      </aside>
    </>
  )
}

/** The patient block from the preoperative summary the later steps are given. */
export function sidebarPatientOf(preop: {
  ageValue?: number | null; ageUnit?: string | null; ageYears?: number | null; sex?: string | null
  heightCm?: number | null; weightKg?: number | null; bmi?: number | null
  allergies?: boolean | null; allergyDetails?: { label: string }[] | null
} | null | undefined, locale: string): SidebarPatient | null {
  if (!preop) return null
  const bg = locale === "bg"
  const unit = (value: string | null | undefined) => value === "MONTHS" ? (bg ? "м." : "mo") : value === "DAYS" ? (bg ? "д." : "d") : (bg ? "г." : "y")
  return {
    ageText: preop.ageValue != null && preop.ageUnit ? `${preop.ageValue} ${unit(preop.ageUnit)}` : preop.ageYears != null ? `${preop.ageYears} ${unit("YEARS")}` : null,
    sexText: preop.sex === "MALE" ? (bg ? "М" : "M") : preop.sex === "FEMALE" ? (bg ? "Ж" : "F") : null,
    heightCm: preop.heightCm ?? null,
    weightKg: preop.weightKg ?? null,
    bmi: preop.bmi ?? (preop.heightCm && preop.weightKg ? preop.weightKg / ((preop.heightCm / 100) ** 2) : null),
    allergy: preop.allergies === true,
    allergyDetails: (preop.allergyDetails ?? []).map(item => item.label).filter(Boolean),
  }
}
