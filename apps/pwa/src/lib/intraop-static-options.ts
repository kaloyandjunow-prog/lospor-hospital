import type { ClinicalStringKey } from "./preferences-context"
import { COMPLICATION_CATEGORIES } from "@lospor/core/complications"

export const COMPLICATION_TC_TITLES: Record<string, ClinicalStringKey> = {
  cardiovascular: "compCatCardiovascular",
  respiratory: "compCatRespiratory",
  neurological: "compCatNeurological",
  metabolic: "compCatMetabolic",
  drug: "compCatDrug",
  haematological: "compCatHaematological",
  equipment: "compCatEquipment",
  surgical: "compCatSurgical",
}

// Single source of truth is @lospor/core/complications (shared with
// lospor-app). Local shape ({id, title, items}) preserved so existing
// consumers (buildIntraopSheetsProps.ts etc.) don't need to change; the
// English title stays here for the `tc()` fallback, the Bulgarian title
// lives in clinical-strings.ts via COMPLICATION_TC_TITLES above.
export const COMPLICATION_GROUPS = COMPLICATION_CATEGORIES.map(({ id, title, items }) => ({ id, title, items }))
export const COMPLICATION_ITEMS = COMPLICATION_GROUPS.flatMap(g => g.items)
