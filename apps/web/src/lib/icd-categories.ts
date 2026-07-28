import {
  getIcd10BodySystem,
  ICD10_BODY_SYSTEM_ORDER,
  type BodySystem,
} from "@lospor/core/preop"

export { suggestASAFromTags, type ASASuggestion } from "@lospor/core/asa"
export type { BodySystem }

// Styling remains web-owned; the clinical classification and order are Core.
export const SYSTEM_COLORS: Record<BodySystem, string> = {
  "Cardiovascular": "bg-red-100 text-red-800 border-red-200",
  "Respiratory": "bg-sky-100 text-sky-800 border-sky-200",
  "Neurological / Psychiatric": "bg-purple-100 text-purple-800 border-purple-200",
  "Endocrine / Metabolic": "bg-yellow-100 text-yellow-800 border-yellow-200",
  "Gastrointestinal / Hepatic": "bg-orange-100 text-orange-800 border-orange-200",
  "Renal / Urological": "bg-teal-100 text-teal-800 border-teal-200",
  "Haematological": "bg-rose-100 text-rose-800 border-rose-200",
  "Musculoskeletal": "bg-lime-100 text-lime-800 border-lime-200",
  "Neoplasms": "bg-pink-100 text-pink-800 border-pink-200",
  "Infectious diseases": "bg-amber-100 text-amber-800 border-amber-200",
  "Ophthalmological / ENT": "bg-cyan-100 text-cyan-800 border-cyan-200",
  "Obstetric": "bg-fuchsia-100 text-fuchsia-800 border-fuchsia-200",
  "Congenital": "bg-indigo-100 text-indigo-800 border-indigo-200",
  "Other": "bg-slate-100 text-slate-700 border-slate-200",
}

export const SYSTEM_ORDER = ICD10_BODY_SYSTEM_ORDER
export const getBodySystem = getIcd10BodySystem
