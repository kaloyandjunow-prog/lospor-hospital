import { adultPremedDoseForRoute } from "@lospor/core/premedication"

import type { PremDrug } from "@/lib/intraop-types"

/**
 * An adult premedication drug as it applies to one route: that route's dose,
 * range, step, unit and hint (Core, 1.4.9), and the dose to prefill ("" when
 * given as prescribed, or when a weight-based dose has no weight).
 *
 * A route change replaces the dose with this even when it was typed by hand:
 * oral and intravenous doses of the same drug differ up to tenfold. The unit
 * is the unit recorded -- adult ketamine is stored as calculated mg, never
 * "mg/kg".
 */
export function adultPremedForRoute(
  drug: PremDrug,
  route: string,
  weightKg?: number | null,
): { drug: PremDrug; dose: string } {
  const rule = adultPremedDoseForRoute(drug, route, weightKg)
  if (rule.status === "unknown") return { drug, dose: String(drug.dose) }
  const needsWeight = rule.status === "needs-weight"
  return {
    drug: {
      ...drug,
      unit: rule.unit,
      min: rule.min,
      max: needsWeight ? 1000 : rule.max,
      step: rule.step,
      hint: rule.hint,
      dose: rule.dose ?? drug.dose,
    },
    dose: rule.dose == null ? "" : String(rule.dose),
  }
}
