import type { ClinicalIssueCode } from "@lospor/core/clinical-validation"

export const INTRAOP_ISSUE_KEYS: Partial<Record<ClinicalIssueCode, string>> = {
  missing_start_time: "intraop.issues.missing_start_time",
  missing_end_time: "intraop.issues.missing_end_time",
  missing_technique: "intraop.issues.missing_technique",
  invalid_intraop_times: "intraop.issues.invalid_intraop_times",
  missing_airway_documentation: "intraop.issues.missing_airway_documentation",
  missing_position: "intraop.issues.missing_position",
  missing_monitoring: "intraop.issues.missing_monitoring",
  missing_vascular_access: "intraop.issues.missing_vascular_access",
  missing_vitals: "intraop.issues.missing_vitals",
  missing_medications: "intraop.issues.missing_medications",
  missing_fluids: "intraop.issues.missing_fluids",
  missing_complication_documentation: "intraop.issues.missing_complication_documentation",
}
