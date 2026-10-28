import {
  getIcd10BodySystem,
  ICD10_BODY_SYSTEM_ORDER,
  type BodySystem,
} from "@lospor/core/preop"

export { asaReasonLabel, suggestASAFromTags, type ASASuggestion } from "@lospor/core/asa"
export type { BodySystem }

// Styling remains web-owned; the clinical classification and order are Core.
// Each has a dark-theme tint as the drug groups do: in the dark theme these were
// bright light chips (10.0.0).
export const SYSTEM_COLORS: Record<BodySystem, string> = {
  "Cardiovascular": "bg-red-100 text-red-800 border-red-200 dark:bg-red-500/15 dark:text-red-300 dark:border-red-500/30",
  "Respiratory": "bg-sky-100 text-sky-800 border-sky-200 dark:bg-sky-500/15 dark:text-sky-300 dark:border-sky-500/30",
  "Neurological / Psychiatric": "bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-500/15 dark:text-purple-300 dark:border-purple-500/30",
  "Endocrine / Metabolic": "bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-500/15 dark:text-yellow-300 dark:border-yellow-500/30",
  "Gastrointestinal / Hepatic": "bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-500/15 dark:text-orange-300 dark:border-orange-500/30",
  "Renal / Urological": "bg-teal-100 text-teal-800 border-teal-200 dark:bg-teal-500/15 dark:text-teal-300 dark:border-teal-500/30",
  "Haematological": "bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-500/15 dark:text-rose-300 dark:border-rose-500/30",
  "Musculoskeletal": "bg-lime-100 text-lime-800 border-lime-200 dark:bg-lime-500/15 dark:text-lime-300 dark:border-lime-500/30",
  "Neoplasms": "bg-pink-100 text-pink-800 border-pink-200 dark:bg-pink-500/15 dark:text-pink-300 dark:border-pink-500/30",
  "Infectious diseases": "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30",
  "Ophthalmological / ENT": "bg-cyan-100 text-cyan-800 border-cyan-200 dark:bg-cyan-500/15 dark:text-cyan-300 dark:border-cyan-500/30",
  "Obstetric": "bg-fuchsia-100 text-fuchsia-800 border-fuchsia-200 dark:bg-fuchsia-500/15 dark:text-fuchsia-300 dark:border-fuchsia-500/30",
  "Congenital": "bg-indigo-100 text-indigo-800 border-indigo-200 dark:bg-indigo-500/15 dark:text-indigo-300 dark:border-indigo-500/30",
  "Other": "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-500/15 dark:text-slate-300 dark:border-slate-500/30",
}

export const SYSTEM_ORDER = ICD10_BODY_SYSTEM_ORDER
export const getBodySystem = getIcd10BodySystem
