import type { LibraryCategory } from "./option-contracts"

export const OPTION_CODE_ALIASES: Readonly<
  Partial<Record<LibraryCategory, Readonly<Record<string, string>>>>
> = {
  TECHNIQUE: {
    GENERAL_COMBINED: "GENERAL_BALANCED",
    COMBINED_SPINAL_EPIDURAL: "CSE",
  },
  HANDOVER_ITEM: {
    obs_q15: "obs_freq",
    obs_q30: "spo2_cont",
    obs_bp: "alert_bp",
    obs_temp: "temp_monitor",
    o2_therapy: "o2_supp",
    pain_regular: "analgesia_protocol",
    pain_pca: "pca",
    pain_threshold: "alert_pain",
    antiemetic: "antiemetic_prn",
    regular_meds: "resume_meds",
    dvt_chemical: "dvt_lmwh",
    pending_labs: "bloods",
    pending_imaging: "cxr",
    consult_request: "pain_team",
  },
}

export function normalizeOptionCode(category: LibraryCategory, value: string): string {
  return OPTION_CODE_ALIASES[category]?.[value] ?? value
}

export function normalizeOptionCodes(category: LibraryCategory, values: readonly string[]): string[] {
  return [...new Set(values.map(value => normalizeOptionCode(category, value)))]
}
