import { DRUG_CATALOG, type DrugCatalogEntry } from "./catalog"
import type { PediatricDrugProfileRulePayload } from "./clinical-rules"
import { profilePayload, routeSurface, type BandSeed } from "./pediatric-drug-profiles-v2"
import { allAuto, auto, kg, v3Bands } from "./pediatric-drug-profiles-v3"

/**
 * Paediatric v4 (10.2.0, SPS): the doses the
 * suggestion cards rely on.
 *
 * - Hydrocortisone 4 mg/kg, never above 100 mg, at every age (it was a flat
 *   25 / 50 / 100 mg by age).
 * - Furosemide 1 mg/kg, never above 40 mg (it had no cap).
 * - Sugammadex up to 2,000 mg, for the 16 mg/kg rescue reversal.
 * - Adrenaline gains an IM route: 10 mcg/kg of actual weight, never above
 *   500 mcg (the anaphylaxis dose when there is no IV access).
 * - Salbutamol inhaled adds single puffs (0.1 mg each) beside the nebulised
 *   2.5 and 5 mg.
 *
 * v3 is released and fingerprinted, so nothing here reaches it: the v3
 * builder never calls this file.
 */

type Override = (entry: DrugCatalogEntry, bands: BandSeed[]) => BandSeed[]

const V4_OVERRIDES: Readonly<Record<string, Override>> = {
  "Hydrocortisone": (entry, bands) => {
    // v2 split hydrocortisone into three age bands only to give each its own
    // flat dose; one weight-based dose needs one band.
    const first = bands[0]!
    const profile = routeSurface({
      IV: { routes: ["IV"], unit: "mg", max: 200, step: 5, quickValues: [10, 25, 50, 100], calculation: kg(4, 5, 100) },
      IM: { routes: ["IM"], unit: "mg", max: 200, step: 5, quickValues: [10, 25, 50, 100], calculation: kg(4, 5, 100) },
    }, "IV")
    return [{ ...auto(first, profile), minimumAgeDays: undefined, maximumAgeDaysExclusive: undefined }]
  },
  "Furosemide": allAuto({ "*": { calc: kg(1, 0.5, 40), max: 100, step: 0.5, quick: [1, 2, 5, 10, 20, 40] } }),
  "Sugammadex": allAuto({ IV: { calc: kg(2, 10, undefined, "TBW"), max: 2000, step: 10, quick: [10, 20, 50, 100, 200, 400, 800] } }),
  "Epinephrine / Adrenaline": (_entry, bands) => bands.map(band => auto(band, routeSurface({
    IV: { routes: ["IV"], unit: "mcg", max: 1000, step: 10, quickValues: [10, 50, 100, 250, 500, 1000], calculation: kg(10, 10, 1000, "TBW") },
    INTRAOSSEOUS: { routes: ["INTRAOSSEOUS"], unit: "mcg", max: 1000, step: 10, quickValues: [10, 50, 100, 250, 500, 1000], calculation: kg(10, 10, 1000, "TBW") },
    IM: { routes: ["IM"], unit: "mcg", max: 500, step: 10, quickValues: [50, 100, 150, 300, 500], calculation: kg(10, 10, 500, "TBW") },
  }, "IV"))),
  "Salbutamol / Albuterol": allAuto({ INHALATION: { max: 5, step: 0.1, quick: [0.1, 0.2, 0.4, 2.5, 5] } }),
}

/** The bands for one drug in v4: v3's bands, with the v4 changes above. */
function v4Bands(entry: DrugCatalogEntry): BandSeed[] {
  const bands = v3Bands(entry, "v4")
  return V4_OVERRIDES[entry.name]?.(entry, bands) ?? bands
}

/** The paediatric v4 drug profile bands for every catalogue drug. */
export function createPediatricDrugProfileV4Payloads(
  drugs: readonly DrugCatalogEntry[] = DRUG_CATALOG,
): PediatricDrugProfileRulePayload[] {
  return drugs.flatMap(entry => v4Bands(entry).map(band => profilePayload(entry, band)))
}

export const PEDIATRIC_V4_DRUG_OVERRIDES = Object.keys(V4_OVERRIDES)
