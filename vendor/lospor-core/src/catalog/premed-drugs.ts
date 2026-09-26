// PREMED_DRUG — premedication categories and adult dosing, per route.
//
// 1.4.9: each route carries its own default dose, range and step, and every
// range starts at 0 (decision 2026-09-26). Before,
// a drug had one dose whatever the route, so midazolam 7.5 mg PO switched to
// IV stayed 7.5 mg IV. Steps are only 0.1, 1, 10 or 50, and every range starts
// on a multiple of its step. A tablet strength the stepper cannot reach
// (midazolam 7.5 mg, carvedilol 6.25 mg) stays the default where approved and
// can always be typed on the keypad. Adults are assumed to be about 70 kg and
// not frail.
export const PREMED_CATS: { cat: string; drugs: string[] }[] = [
  { cat: "Anxiolytics", drugs: ["Midazolam", "Diazepam", "Lorazepam", "Temazepam", "Oxazepam", "Alprazolam"] },
  { cat: "Analgesics", drugs: ["Paracetamol", "Ibuprofen", "Celecoxib", "Gabapentin", "Pregabalin", "Tramadol", "Codeine", "Etoricoxib"] },
  { cat: "Antiemetics", drugs: ["Metoclopramide", "Ondansetron", "Domperidone", "Promethazine", "Dexamethasone"] },
  { cat: "Antacids / GI", drugs: ["Omeprazole", "Pantoprazole", "Esomeprazole", "Sodium citrate", "Lansoprazole"] },
  { cat: "Anticholinergics", drugs: ["Atropine", "Glycopyrrolate", "Hyoscine", "Scopolamine"] },
  { cat: "Beta-blockers", drugs: ["Atenolol", "Metoprolol", "Bisoprolol", "Carvedilol", "Labetalol"] },
  { cat: "Antihistamines", drugs: ["Hydroxyzine", "Diphenhydramine", "Cetirizine", "Loratadine", "Promethazine"] },
  { cat: "Opioids", drugs: ["Morphine", "Oxycodone", "Tramadol", "Pethidine", "Buprenorphine", "Fentanyl"] },
  { cat: "Other", drugs: ["Clonidine", "Dexmedetomidine", "Aspirin", "Clopidogrel", "Warfarin", "Ketamine", "Insulin", "Levothyroxine"] },
]

export const PREMED_DOSE_STEPS = [0.1, 1, 10, 50] as const
export type PremedDoseStep = (typeof PREMED_DOSE_STEPS)[number]

export type PremedRouteDose = {
  /** The suggested dose; null for a home medicine given "as prescribed". */
  dose: number | null
  unit: string
  min: number
  max: number
  step: PremedDoseStep
  /**
   * Weight-based (adult ketamine): dose, min and max are per kilogram, and
   * the dose recorded is always the calculated amount in `unit`, never
   * "mg/kg" text.
   */
  perKg?: boolean
}

export type PremedDrugConfig = {
  /** The default route's values, for readers that predate routeDoses. */
  dose: number
  unit: string
  min: number
  max: number
  step: number
  routes: string[]
  defaultRoute: string
  hint: string
  routeDoses: Record<string, PremedRouteDose>
}

type RouteRow = [dose: number | null, min: number, max: number, step: PremedDoseStep, unit?: string]

export function premedRouteHint(route: string, rule: PremedRouteDose): string {
  const unit = rule.perKg ? `${rule.unit}/kg` : rule.unit
  const range = `${rule.min}–${rule.max} ${unit}`
  return rule.dose == null ? `As prescribed (${range})` : `${rule.dose} ${unit} ${route} (${range})`
}

function premed(
  unit: string,
  defaultRoute: string,
  rows: Record<string, RouteRow>,
  options: { perKg?: boolean } = {},
): PremedDrugConfig {
  const routeDoses: Record<string, PremedRouteDose> = {}
  for (const [route, [dose, min, max, step, routeUnit]] of Object.entries(rows)) {
    routeDoses[route] = { dose, unit: routeUnit ?? unit, min, max, step, ...(options.perKg ? { perKg: true } : {}) }
  }
  const main = routeDoses[defaultRoute]
  return {
    dose: main.dose ?? main.min,
    unit: options.perKg ? `${main.unit}/kg` : main.unit,
    min: main.min,
    max: main.max,
    step: main.step,
    routes: Object.keys(rows),
    defaultRoute,
    hint: premedRouteHint(defaultRoute, main),
    routeDoses,
  }
}

export const PREMED_DOSES: Record<string, PremedDrugConfig> = {
  // Anxiolytics
  "Midazolam": premed("mg", "PO", { PO: [7.5, 0, 15, 1], IM: [5, 0, 7.5, 0.1], IV: [1, 0, 2.5, 0.1], Intranasal: [5, 0, 7.5, 0.1], Buccal: [5, 0, 10, 0.1] }),
  "Diazepam": premed("mg", "PO", { PO: [5, 0, 10, 1], IV: [2.5, 0, 5, 0.1], IM: [5, 0, 10, 1] }),
  "Lorazepam": premed("mg", "PO", { PO: [1, 0, 2, 0.1], IM: [1, 0, 2, 0.1], IV: [0.5, 0, 2, 0.1] }),
  "Temazepam": premed("mg", "PO", { PO: [10, 0, 20, 10] }),
  "Oxazepam": premed("mg", "PO", { PO: [15, 0, 30, 1] }),
  "Alprazolam": premed("mg", "PO", { PO: [0.5, 0, 1, 0.1] }),
  // Analgesics
  "Paracetamol": premed("mg", "PO", { PO: [1000, 0, 1000, 50], IV: [1000, 0, 1000, 50], PR: [1000, 0, 1000, 50] }),
  "Ibuprofen": premed("mg", "PO", { PO: [400, 0, 800, 50] }),
  "Celecoxib": premed("mg", "PO", { PO: [400, 0, 400, 50] }),
  "Gabapentin": premed("mg", "PO", { PO: [300, 0, 600, 50] }),
  "Pregabalin": premed("mg", "PO", { PO: [75, 0, 150, 1] }),
  "Tramadol": premed("mg", "PO", { PO: [50, 0, 100, 50], IM: [50, 0, 100, 50], IV: [50, 0, 100, 50] }),
  "Codeine": premed("mg", "PO", { PO: [30, 0, 60, 1] }),
  "Etoricoxib": premed("mg", "PO", { PO: [90, 0, 120, 10] }),
  // Antiemetics
  "Metoclopramide": premed("mg", "PO", { PO: [10, 0, 10, 1], IM: [10, 0, 10, 1], IV: [10, 0, 10, 1] }),
  "Ondansetron": premed("mg", "PO", { PO: [8, 0, 8, 1], IM: [4, 0, 8, 1], IV: [4, 0, 8, 1] }),
  "Domperidone": premed("mg", "PO", { PO: [10, 0, 10, 10] }),
  "Promethazine": premed("mg", "PO", { PO: [25, 0, 50, 1], IM: [25, 0, 50, 1] }),
  "Dexamethasone": premed("mg", "PO", { PO: [8, 0, 8, 1], IV: [4, 0, 8, 1], IM: [4, 0, 8, 1] }),
  // Antacids / GI
  "Omeprazole": premed("mg", "PO", { PO: [20, 0, 40, 10], IV: [40, 0, 40, 10] }),
  "Pantoprazole": premed("mg", "PO", { PO: [40, 0, 40, 10], IV: [40, 0, 80, 10] }),
  "Esomeprazole": premed("mg", "PO", { PO: [40, 0, 40, 10], IV: [40, 0, 40, 10] }),
  "Lansoprazole": premed("mg", "PO", { PO: [30, 0, 30, 1] }),
  "Sodium citrate": premed("mL", "PO", { PO: [30, 0, 30, 1] }),
  // Anticholinergics
  "Atropine": premed("mg", "SC", { SC: [0.6, 0, 0.6, 0.1], IM: [0.6, 0, 0.6, 0.1], IV: [0.3, 0, 0.6, 0.1] }),
  "Glycopyrrolate": premed("mg", "IM", { IM: [0.2, 0, 0.4, 0.1], IV: [0.2, 0, 0.2, 0.1], SC: [0.2, 0, 0.4, 0.1] }),
  "Hyoscine": premed("mg", "SC", { SC: [0.4, 0, 0.6, 0.1], IM: [0.4, 0, 0.6, 0.1] }),
  "Scopolamine": premed("patch", "Transdermal", { Transdermal: [1, 0, 1, 1] }),
  // Beta-blockers (usually continuing a home medicine)
  "Atenolol": premed("mg", "PO", { PO: [50, 0, 100, 1] }),
  "Metoprolol": premed("mg", "PO", { PO: [50, 0, 100, 1], IV: [2.5, 0, 5, 0.1] }),
  "Bisoprolol": premed("mg", "PO", { PO: [5, 0, 10, 1] }),
  "Carvedilol": premed("mg", "PO", { PO: [6.25, 0, 25, 1] }),
  "Labetalol": premed("mg", "PO", { PO: [100, 0, 200, 50], IV: [10, 0, 20, 1] }),
  // Antihistamines
  "Hydroxyzine": premed("mg", "PO", { PO: [25, 0, 100, 1], IM: [25, 0, 50, 1] }),
  "Diphenhydramine": premed("mg", "PO", { PO: [25, 0, 50, 1], IV: [25, 0, 50, 1], IM: [25, 0, 50, 1] }),
  "Cetirizine": premed("mg", "PO", { PO: [10, 0, 10, 10] }),
  "Loratadine": premed("mg", "PO", { PO: [10, 0, 10, 10] }),
  // Opioids
  "Morphine": premed("mg", "SC", { SC: [5, 0, 10, 0.1], IM: [10, 0, 10, 1], IV: [2, 0, 5, 1], PO: [10, 0, 20, 10] }),
  "Oxycodone": premed("mg", "PO", { PO: [5, 0, 10, 1] }),
  "Pethidine": premed("mg", "IM", { IM: [50, 0, 100, 1], SC: [50, 0, 100, 1], IV: [25, 0, 50, 1] }),
  "Buprenorphine": premed("mcg", "IM", { IM: [300, 0, 300, 10], IV: [300, 0, 300, 10], SL: [200, 0, 400, 10] }),
  "Fentanyl": premed("mcg", "IV", { IV: [50, 0, 100, 1], IM: [50, 0, 100, 10], Intranasal: [50, 0, 100, 1], Buccal: [100, 0, 200, 50] }),
  // Other
  "Clonidine": premed("mcg", "PO", { PO: [150, 0, 300, 10], Transdermal: [null, 0, 300, 50, "mcg/24h"] }),
  // Intranasal only as a premedication; the intravenous product is an intraop
  // infusion and already lives in the intraop catalogue.
  "Dexmedetomidine": premed("mcg", "Intranasal", { Intranasal: [75, 0, 100, 1] }),
  "Aspirin": premed("mg", "PO", { PO: [75, 0, 300, 1] }),
  "Clopidogrel": premed("mg", "PO", { PO: [75, 0, 75, 1] }),
  "Warfarin": premed("mg", "PO", { PO: [null, 0, 10, 0.1] }),
  // Rare as an adult premedication; the dose recorded is the calculated mg.
  "Ketamine": premed("mg", "PO", { PO: [1, 0, 2, 0.1], IV: [0.25, 0, 0.5, 0.1], IM: [1, 0, 2, 0.1] }, { perKg: true }),
  "Insulin": premed("units", "SC", { SC: [null, 0, 50, 1], IV: [null, 0, 50, 1] }),
  "Levothyroxine": premed("mcg", "PO", { PO: [null, 0, 200, 1] }),
}

/**
 * The WHO ATC code of each premedication drug, checked against the Athena ATC
 * vocabulary of 2026-02-01. It is what gives a premedication its research code:
 * the ATC code maps to the drug's standard RxNorm ingredient.
 *
 * Gabapentin and pregabalin carry their current codes (N02BF, gabapentinoids);
 * WHO retired N03AX12 and N03AX16. Two are left uncoded on purpose: "Insulin"
 * names no particular insulin, and sodium citrate's only ATC code is an
 * irrigation solution, not the oral antacid given before surgery.
 */
export const PREMED_ATC_CODES: Readonly<Record<string, string>> = {
  "Midazolam": "N05CD08", "Diazepam": "N05BA01", "Lorazepam": "N05BA06", "Temazepam": "N05CD07",
  "Oxazepam": "N05BA04", "Alprazolam": "N05BA12", "Paracetamol": "N02BE01", "Ibuprofen": "M01AE01",
  "Celecoxib": "M01AH01", "Gabapentin": "N02BF01", "Pregabalin": "N02BF02", "Tramadol": "N02AX02",
  "Codeine": "R05DA04", "Etoricoxib": "M01AH05", "Metoclopramide": "A03FA01", "Ondansetron": "A04AA01",
  "Domperidone": "A03FA03", "Promethazine": "R06AD02", "Dexamethasone": "H02AB02", "Omeprazole": "A02BC01",
  "Pantoprazole": "A02BC02", "Esomeprazole": "A02BC05", "Lansoprazole": "A02BC03",
  "Atropine": "A03BA01", "Glycopyrrolate": "A03AB02", "Hyoscine": "A04AD01", "Scopolamine": "A04AD01",
  "Atenolol": "C07AB03", "Metoprolol": "C07AB02", "Bisoprolol": "C07AB07", "Carvedilol": "C07AG02",
  "Labetalol": "C07AG01", "Hydroxyzine": "N05BB01", "Diphenhydramine": "R06AA02", "Cetirizine": "R06AE07",
  "Loratadine": "R06AX13", "Morphine": "N02AA01", "Oxycodone": "N02AA05", "Pethidine": "N02AB02",
  "Buprenorphine": "N02AE01", "Fentanyl": "N02AB03", "Clonidine": "C02AC01", "Dexmedetomidine": "N05CM18",
  "Aspirin": "B01AC06", "Clopidogrel": "B01AC04", "Warfarin": "B01AA03", "Ketamine": "N01AX03",
  "Levothyroxine": "H03AA01",
}
