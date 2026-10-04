import { useEffect } from "react"

/**
 * Where a readiness "Go to" lands in each form (1.5.0).
 *
 * The readiness list names a part of the record (Core's preoperative section
 * or intraoperative area). Each form opens the tab that part lives on and
 * scrolls to the element marked `data-readiness` with that name; a part with
 * no marker of its own lands at the top of its tab.
 */

type PreopTab = "patient" | "case" | "history" | "exam" | "risk"

const PREOP_TAB: Record<string, PreopTab> = {
  demographics: "patient",
  case_details: "case",
  medical_history: "history",
  current_medications: "history",
  anamnesis: "history",
  physical_exam: "exam",
  airway: "exam",
  labs: "risk",
  risk_scores: "risk",
}

const INTRAOP_TAB: Record<string, string> = {
  times: "overview",
  position: "overview",
  monitoring: "anaesthesia",
  technique: "anaesthesia",
  airway: "anaesthesia",
  vascular_access: "anaesthesia",
  vitals: "chart",
  medications: "chart",
  fluids: "chart",
  events: "chart",
  complications: "finish",
}

export function preopFocusTab(focus: string | null | undefined): PreopTab | undefined {
  return focus ? PREOP_TAB[focus] : undefined
}

export function intraopFocusTab(focus: string | null | undefined): string | undefined {
  return focus ? INTRAOP_TAB[focus] : undefined
}

export function scrollToReadiness(focus: string): void {
  setTimeout(() => {
    // Called after a delay, so it can outlive the page or run where the
    // element cannot scroll (jsdom): a missing scroll does nothing.
    document.querySelector<HTMLElement>(`[data-readiness~="${focus}"]`)?.scrollIntoView?.({ behavior: "smooth", block: "center" })
  }, 50)
}

/** Bring the named part into view once, on arrival; after that the clinician drives. */
export function useScrollToReadiness(focus: string | null | undefined): void {
  useEffect(() => {
    if (focus) scrollToReadiness(focus)
  }, [focus])
}

/** The preoperative section an invalid field belongs to, for the invalid-submit jump. */
const FIELD_SECTION: Record<string, string> = {
  patientName: "demographics", patientId: "demographics",
  ageYears: "demographics", ageValue: "demographics", sex: "demographics",
  diagnoses: "case_details", procedures: "case_details",
  bp: "physical_exam", heartRate: "physical_exam", respiratoryRate: "physical_exam",
  airway: "airway", asaScore: "risk_scores",
}
const FIELD_ORDER = Object.keys(FIELD_SECTION)

/** The section of the first invalid field, in form order. */
export function preopSectionForErrors(errors: readonly string[]): string {
  const first = FIELD_ORDER.find(field => errors.includes(field)) ?? errors[0]
  return FIELD_SECTION[first] ?? "risk_scores"
}
