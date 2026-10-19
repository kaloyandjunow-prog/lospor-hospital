import type { InfusionRecord } from "@lospor/core/infusion-entry"
import type { TimetableInfusion } from "@lospor/core/intraop-types"
import { clinicalProvenance } from "@/lib/intraop-provenance"
import { DEFAULT_INF, infusionCalculationBasis } from "./flyout-state"
import type { TtFP } from "./timetable-types"

/**
 * The infusion the start flyout adds to the chart: its rate as entered (or a
 * TCI target with its model and site, 2026-10-18), the strength, route and
 * the catalogue identity and rule audit. The chart edit becomes the start
 * event (Core timetableEditToEventOps).
 */
export function flyoutInfusion(input: {
  fp: TtFP
  record?: InfusionRecord
  id: string
  configs: Record<string, { color: string } | undefined>
  libraryOptions: readonly { label: string; drugId?: string | null; atcCode?: string | null; inn?: string | null }[]
  weightBasis: Parameters<typeof infusionCalculationBasis>[1]
}): TimetableInfusion {
  const { fp, record } = input
  const cfg = input.configs[fp.name] ?? DEFAULT_INF
  // A local anaesthetic's % joins the name; a syringe stays out of it.
  const displayName = fp.name + (fp.concentration?.endsWith("%") ? ` ${fp.concentration}` : "")
  const lib = input.libraryOptions.find(option => option.label === fp.name)
  return {
    id: input.id,
    name: displayName,
    rate: record?.rate ?? fp.rate,
    unit: record?.unit ?? fp.rateUnit,
    volumeRateMlPerHour: record?.volumeRateMlPerHour,
    calculationWeightKg: record?.calculationWeightKg,
    ...(fp.tci ? { tciModel: fp.tci.model, tciSite: fp.tci.site, tciOpioids: fp.tci.opioids } : {}),
    startCol: fp.col,
    endCol: fp.col,
    color: cfg.color,
    concentration: fp.concentration,
    formulation: fp.formulation,
    route: fp.route,
    drugId: lib?.drugId ?? undefined,
    atcCode: lib?.atcCode ?? undefined,
    inn: lib?.inn ?? undefined,
    ...clinicalProvenance(fp),
    calculationBasis: infusionCalculationBasis(fp.name, input.weightBasis),
  }
}
