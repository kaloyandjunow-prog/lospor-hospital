import { calculateDrugTotals } from "@lospor/core/intraop-summary"
import type { TimetableData } from "@/types/timetable"

import { infusionLocalAnaestheticMg } from "@lospor/core/intraop-totals"
import { calcInfusionTotal, type WeightBasisMap } from "@/lib/infusion-calc"

/**
 * Running drug and infusion totals for the intraoperative form.
 *
 * Out of the component because it is arithmetic, not interface: bolus totals
 * from Core, infusion totals from the weight basis in force, and the footnote
 * that says which weight was used. The inline version this grew from rounded
 * to two decimals while Core rounds to three, so the same case showed
 * different totals on the web form and at the bedside — the kind of drift that
 * only stops recurring once the calculation has one home and a test.
 */
export function computeLiveDrugTotals(
  timetable: Pick<TimetableData, "drugs" | "infusions">,
  calcIbw: number | null,
  calcTbw: number | null,
  infusionWeightBasis: WeightBasisMap,
) {
  // Bolus totals come from Core, not a local aggregation. The inline version
  // this replaced rounded to two decimals while Core rounds to three, so the
  // same case could show different totals on the web form and at the bedside.
  const bolusList = calculateDrugTotals({ drugs: timetable.drugs }).map(row => ({
    ...row,
    mgTotal: null as number | null,
  }))

  const infusionList = (timetable.infusions ?? []).map(inf => {
    const { amount, unit, weightUsed, weightBasis } = calcInfusionTotal(inf, calcIbw, calcTbw, infusionWeightBasis)
    return {
      name: inf.name,
      total: amount,
      unit,
      mgTotal: infusionLocalAnaestheticMg(inf.name, amount, unit),
      weightUsed,
      weightBasis,
    }
  })

  // If any infusion used a weight-adjusted calculation, build a footnote
  const weightedEntries = infusionList.filter(r => r.weightUsed != null)
  const weightNote = weightedEntries.length > 0 ? (() => {
    const ibwUsed = weightedEntries.some(r => r.weightBasis === "IBW") ? calcIbw : null
    const tbwUsed = weightedEntries.some(r => r.weightBasis === "TBW") ? calcTbw : null
    const parts: string[] = []
    if (ibwUsed) parts.push(`IBW ${Math.round(ibwUsed * 10) / 10} kg`)
    if (tbwUsed) parts.push(`TBW ${Math.round((tbwUsed ?? 0) * 10) / 10} kg`)
    return parts.length ? `† Weight-adjusted totals use ${parts.join(" / ")}` : null
  })() : null

  return { bolusList, infusionList, weightNote }

}
