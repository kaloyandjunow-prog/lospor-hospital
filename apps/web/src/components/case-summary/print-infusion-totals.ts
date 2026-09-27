import { useMemo } from "react"
import { calcInfusionTotals, withInfusionInstants, type WeightBasisMap } from "@lospor/core/intraop-totals"
import { intraopUnconfirmedStops } from "@lospor/core/intraop-commands"
import { parseLogEvents } from "@lospor/core/intraop-types"
import { weightBasisMap } from "@lospor/core/option-library"
import { calculateMostellerBsa } from "@lospor/core/pediatric-calculators"

import { useOptionLibrary } from "@/hooks/useOptionLibrary"
import type { LegacyKeyEvents, TimetableInfusion } from "@/types/timetable"

/**
 * The institution's weight basis per infusion, from its editable drug library
 * -- the same source the intraop form totals with, so the record and the form
 * cannot disagree (9.12.3). Empty while the library loads; the totals then use
 * the catalogue, which is what the library starts as.
 */
export function useInfusionWeightBasis(): WeightBasisMap {
  const { options } = useOptionLibrary("INTRAOP_INFUSION")
  return useMemo(() => weightBasisMap(options), [options])
}

/**
 * Infusion totals for the record, on the patient's own weights and surface
 * area. Passed no weight, a per-kg infusion used to count as 1 kg:
 * remifentanil 0.1 mcg/kg/min for 25 minutes printed as 2.5 mcg (9.12.3).
 * Charts saved before 9.12.3 get their real instants back from the log.
 */
export function calcInfTotals(
  timetable: LegacyKeyEvents,
  patient: {
    ibw?: number | null
    tbw?: number | null
    heightCm?: number | null
    endedAt?: string | Date | null
    weightBasis?: WeightBasisMap
  } = {},
) {
  const infusions: TimetableInfusion[] = Array.isArray(timetable?.infusions) ? timetable.infusions : []
  const bsa = patient.heightCm && patient.tbw
    ? calculateMostellerBsa({ heightCm: patient.heightCm, weightKg: patient.tbw })
    : null
  // From the log, as of the end or now: a stored chart is projected when
  // written and may still show a stop as planned whose time has come.
  const log = parseLogEvents(Array.isArray(timetable?.log) ? timetable.log : [])
  const unconfirmed = new Set(intraopUnconfirmedStops(log, patient.endedAt ?? new Date()).map(event => event.infId))
  return calcInfusionTotals(
    withInfusionInstants(infusions, timetable?.log, patient.endedAt),
    patient.ibw ?? null,
    patient.tbw ?? null,
    patient.weightBasis,
    bsa?.available ? bsa.value.squareMetres : null,
  ).map((total, index) => ({ ...total, stopUnconfirmed: unconfirmed.has(infusions[index].id) }))
}
