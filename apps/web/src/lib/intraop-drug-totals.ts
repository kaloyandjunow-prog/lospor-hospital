import { calculateDrugTotals } from "@lospor/core/intraop-summary"
import type { TimetableData } from "@/types/timetable"

import { deliveredInfusionVolumeMl, formatInfusionTotal, infusionLocalAnaestheticMg } from "@lospor/core/intraop-totals"
import type { TciPatient } from "@lospor/core/tci"

export { infusionsVolumeMl } from "@lospor/core/intraop-totals"
export { tciPatientFrom } from "@lospor/core/tci"
import { calculateMostellerBsa } from "@lospor/core/pediatric-calculators"
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
  heightCm: number | null = null,
  /** The patient a TCI infusion's model is worked out for (2026-10-18). */
  tciPatient: TciPatient | null = null,
) {
  // Per-m² infusions need the body surface area (Mosteller), from the same
  // height and weight the record prints.
  const bsa = heightCm && calcTbw ? calculateMostellerBsa({ heightCm, weightKg: calcTbw }) : null
  const bodySurfaceAreaM2 = bsa?.available ? bsa.value.squareMetres : null
  // Bolus totals come from Core, not a local aggregation. The inline version
  // this replaced rounded to two decimals while Core rounds to three, so the
  // same case could show different totals on the web form and at the bedside.
  const bolusList = calculateDrugTotals({ drugs: timetable.drugs }).map(row => ({
    ...row,
    mgTotal: null as number | null,
  }))

  const infusionList = (timetable.infusions ?? []).map(inf => {
    const total = calcInfusionTotal(inf, calcIbw, calcTbw, infusionWeightBasis, bodySurfaceAreaM2, tciPatient)
    const { amount, unit, weightUsed, weightBasis, bsaUsed } = total
    return {
      name: inf.name,
      total: amount,
      unit,
      // "250 mcg", "2.5 mcg/kg" without a weight, or both totals of a unit switch.
      display: formatInfusionTotal(total),
      mgTotal: infusionLocalAnaestheticMg(inf.name, amount, unit),
      weightUsed,
      weightBasis,
      bsaUsed,
      // Its millilitres, from the pump rates (or a TCI model); none when the syringe was skipped (2026-10-18).
      volumeMl: inf.planned ? null : deliveredInfusionVolumeMl(inf, new Date(), tciPatient),
      // A TCI infusion: the pump's total, the calculation, and why there may be neither.
      ...(total.tci ? { tci: { calculated: total.tci.calculated, pump: total.tci.pump, unavailable: total.tci.unavailable, pumpNeedsStrength: total.tci.pumpNeedsStrength } } : {}),
    }
  })

  // If any infusion used a weight-adjusted calculation, build a footnote
  const weightedEntries = infusionList.filter(r => r.weightUsed != null || r.bsaUsed != null)
  const weightNote = weightedEntries.length > 0 ? (() => {
    const ibwUsed = weightedEntries.some(r => r.weightBasis === "IBW") ? calcIbw : null
    const tbwUsed = weightedEntries.some(r => r.weightBasis === "TBW") ? calcTbw : null
    const parts: string[] = []
    if (ibwUsed) parts.push(`IBW ${Math.round(ibwUsed * 10) / 10} kg`)
    if (tbwUsed) parts.push(`TBW ${Math.round((tbwUsed ?? 0) * 10) / 10} kg`)
    const bsaUsed = weightedEntries.find(r => r.bsaUsed != null)?.bsaUsed
    if (bsaUsed != null) parts.push(`BSA ${bsaUsed} m²`)
    return parts.length ? `† Weight-adjusted totals use ${parts.join(" / ")}` : null
  })() : null

  return { bolusList, infusionList, weightNote }

}
