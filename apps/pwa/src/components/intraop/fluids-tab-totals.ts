import { calculateDrugTotals } from "@lospor/core/intraop-summary"
import { totalsProvisional } from "@lospor/core/intraop-save-state"
// Core's own totals, not the case-detail wrapper: that wrapper narrows `rate`
// to string, while a live timetable's rate is NumericText. Core accepts both.
import {
  calcInfusionTotals,
  calculateDeliveredFluidTotals, deliveredInfusionVolumesByName,
  formatInfusionTotal,
  infusionLocalAnaestheticMg,
  type WeightBasisMap,
} from "@lospor/core/intraop-totals"
import { tciPatientFromPreop } from "@/lib/intraop-preop-summary"
import { tciTotalNote } from "@/components/intraop/TciSheetFields"
import type { IntraopTabContentBuilderProps } from "./buildIntraopTabContentProps"

type Builder = IntraopTabContentBuilderProps

/**
 * The Fluids tab's totals. Derived, not held in state: a pure function of the
 * timetable, computed only while that tab is shown.
 */
export function fluidsTabTotals({ timetable, preop, caseIbw, caseTbw, caseBsa, infusionWeightBasis, tc, attention }: {
  timetable: Builder["timetable"]
  preop: Builder["preop"]
  caseIbw: number | null
  caseTbw: number | null
  caseBsa: number | null
  infusionWeightBasis: WeightBasisMap
  tc: Builder["tc"]
  attention: Builder["attention"]
}) {
  const infusionRows = calcInfusionTotals(
    timetable.infusions ?? [], caseIbw, caseTbw, infusionWeightBasis, caseBsa, tciPatientFromPreop(preop),
  )
  const weighted = infusionRows.filter(row => row.weightUsed != null)
  const ibwUsed = weighted.some(row => row.weightBasis === "IBW") ? caseIbw : null
  const tbwUsed = weighted.some(row => row.weightBasis === "TBW") ? caseTbw : null
  const weightParts: string[] = []
  if (ibwUsed != null) weightParts.push(`IBW ${Math.round(ibwUsed * 10) / 10} kg`)
  if (tbwUsed != null) weightParts.push(`TBW ${Math.round(tbwUsed * 10) / 10} kg`)
  const bsaUsed = infusionRows.find(row => row.bsaUsed != null)?.bsaUsed
  if (bsaUsed != null) weightParts.push(`BSA ${bsaUsed} m²`)
  // Delivered volume, not the stored `volume` (written only when a fluid stops, so a running one read 0).
  // Infusions count in the balance by their pump rates, each drug's mL beside its amount (2026-10-18).
  const fluidTotals = calculateDeliveredFluidTotals(timetable.fluids, new Date(), timetable.infusions ?? [], tciPatientFromPreop(preop))
  const volumeByName = deliveredInfusionVolumesByName(timetable.infusions ?? [], new Date(), tciPatientFromPreop(preop))
  return {
    infusionTotals: infusionRows.map(row => ({
      ...row,
      mgTotal: infusionLocalAnaestheticMg(row.name, row.total, row.unit),
      // Per kg without a weight, both totals of a unit switch, and which
      // weight was used when the drug's own could not be (9.12.3).
      display: [formatInfusionTotal(row), volumeByName.get(row.name) != null ? `${volumeByName.get(row.name)} mL` : null, row.tci ? tciTotalNote(row.tci, row.unit, tc) : null].filter(Boolean).join(" · "),
    })),
    bolusTotals: calculateDrugTotals(timetable), provisional: !!attention?.saveState && totalsProvisional(timetable, attention.saveState),
    weightNote: weightParts.length ? `† ${weightParts.join(" / ")}` : null,
    crystalloidsMl: fluidTotals.crystalloids, colloidsMl: fluidTotals.colloids, bloodMl: fluidTotals.blood, infusionsMl: fluidTotals.infusions,
  }
}
