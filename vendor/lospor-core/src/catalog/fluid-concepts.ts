import { FLUID_CATALOG } from "./intraop-fluids"

/**
 * The research concept of every catalogue fluid and blood product, checked by
 * hand against OHDSI Athena (RxNorm 20260601, RxNorm Extension, SNOMED).
 *
 * The ATC code cannot do this for fluids. Saline, Hartmann's, Plasma-Lyte and
 * Ringer's acetate all share B05BB01, the dextrose mixes share B05BB02, and
 * B05AX01 maps in OMOP to a technetium red-cell tracer rather than to a
 * transfusion, so a fluid coded through its ATC exported either nothing or the
 * wrong substance. Each entry here names the clinical drug at the strength the
 * bag carries.
 *
 * Blood products are not drugs in OMOP. The bag is a Device-domain product and
 * giving it is a procedure, so they carry both. Cell salvage has no product
 * concept and is only the procedure. The SNOMED ids are numbers only.
 */
export type IntraopFluidConcept =
  | { table: "drug"; conceptId: number }
  | { table: "device"; conceptId: number; transfusionConceptId: number }
  | { table: "procedure"; conceptId: number }

// Keyed by catalogue name. A fluid offered at several strengths is keyed by
// strength in percent, as the concentration picker writes it.
const DRUG_CONCEPTS: Record<string, number | Record<string, number>> = {
  // hydroxyethyl starch 130/0.4 60 mg/mL; pentastarch (HES 200/0.5) 100 mg/mL,
  // the European 10% starch.
  "HES": { "6": 43012054, "10": 40161356 },
  // succinylated gelatin 40 mg/mL
  "Gelatin 4%": 19011164,
  // albumin human 50, 200 and 250 mg/mL
  "Albumin 5%": 42925127,
  "Albumin 20%": 42481519,
  "Albumin 25%": 36890659,
  // mannitol 100 and 150 mg/mL
  "Mannitol": { "10": 42482029, "15": 36883846 },
  // soybean oil 200 mg/mL
  "Lipid emulsion 20%": 19023521,
  // sodium chloride 2.25, 4.5, 9, 30 and 200 mg/mL
  "Saline": { "0.225": 36879948, "0.45": 36894518, "0.9": 19079524, "3": 42482740, "20": 36894513 },
  // calcium chloride 0.268 / potassium chloride 0.4 / sodium lactate 3.2 /
  // sodium chloride 6 mg/mL: Ringer's lactate as sold in Europe
  "Lactated Ringer's / Hartmann's": 43027244,
  // Plasma-Lyte 148 / Plasma-Lyte A
  "Plasma-Lyte": 19131116,
  // calcium chloride 0.134 / magnesium chloride 0.2 / potassium chloride 0.4 /
  // sodium acetate 3.4 / sodium chloride 6 mg/mL. OMOP has no acetated Ringer's
  // without magnesium; this is the nearest.
  "Ringer's acetate": 36887858,
  // glucose 50 mg/mL
  "Dextrose 5% (D5W)": 19076324,
  // glucose 50 / sodium chloride 9 mg/mL
  "Dextrose 5% in 0.9% saline (D5NS)": 42481293,
  // glucose 50 / sodium chloride 4.5 mg/mL
  "Dextrose 5% in 0.45% saline (D5 1/2NS)": 42481294,
  // calcium chloride 0.2 / glucose 50 / potassium chloride 0.3 / sodium
  // chloride 6 / sodium lactate 3.1 mg/mL
  "Dextrose 5% in Lactated Ringer's (D5LR)": 968985,
  // glucose 100 mg/mL
  "Dextrose 10% (D10W)": 42937947,
}

// Product, then the transfusion of it. Matched on the words a clinician or an
// older client uses as well as the catalogue name, in this order, so "cell
// salvage" is never read as red cells.
const BLOOD_CONCEPTS: { pattern: RegExp; concept: IntraopFluidConcept }[] = [
  { pattern: /\b(CELL SALVAGE|AUTOLOGOUS BLOOD|AUTOTRANSFUSION)\b/, concept: { table: "procedure", conceptId: 4037780 } },
  { pattern: /\b(PRBC|PACKED RED|RED BLOOD CELLS?|RED CELLS?|ERYTHROCYTES?)\b/, concept: { table: "device", conceptId: 4336080, transfusionConceptId: 4323715 } },
  { pattern: /\b(FRESH FROZEN PLASMA|FFP)\b/, concept: { table: "device", conceptId: 4223728, transfusionConceptId: 4022171 } },
  { pattern: /\bPLATELETS?\b/, concept: { table: "device", conceptId: 4103615, transfusionConceptId: 4130829 } },
  { pattern: /\bCRYOPRECIPITATE\b/, concept: { table: "device", conceptId: 4106319, transfusionConceptId: 4023918 } },
  { pattern: /\bWHOLE BLOOD\b/, concept: { table: "device", conceptId: 4046508, transfusionConceptId: 4142651 } },
]

const normalize = (value: string) => value.trim().toLocaleLowerCase("en").replace(/\s+/g, " ")

const catalogByName = new Map(FLUID_CATALOG.map(entry => [normalize(entry.name), entry]))

const TRAILING_STRENGTH = /\s+\d+(?:[.,]\d+)?\s*%$/

function percent(value: string | null | undefined): number | null {
  const match = value?.match(/(\d+(?:[.,]\d+)?)\s*%/)
  if (!match) return null
  const parsed = Number(match[1].replace(",", "."))
  return Number.isFinite(parsed) ? parsed : null
}

/**
 * The research concept for a fluid as an event records it, or undefined when
 * the name is not a catalogue fluid, or when a fluid offered at several
 * strengths names none the table knows. Undefined is the honest answer: the
 * caller falls back to the ATC code, which at worst leaves the row uncoded.
 *
 * The strength comes from the concentration the clinician picked, then from a
 * strength written into the name ("Saline 0.9%"), then from the catalogue's
 * own default -- the value the picker shows before anyone touches it.
 */
export function intraopFluidConcept(input: {
  name?: string | null
  concentration?: string | null
  category?: string | null
}): IntraopFluidConcept | undefined {
  const name = input.name?.trim()
  if (!name) return undefined

  const upper = name.toUpperCase().replace(/\s+/g, " ")
  const isBlood = normalize(input.category ?? "") === "blood products"
    || BLOOD_CONCEPTS.some(({ pattern }) => pattern.test(upper))
  if (isBlood) return BLOOD_CONCEPTS.find(({ pattern }) => pattern.test(upper))?.concept

  const direct = catalogByName.get(normalize(name))
  const stripped = direct ? undefined : catalogByName.get(normalize(name.replace(TRAILING_STRENGTH, "")))
  const entry = direct ?? stripped
  if (!entry) return undefined
  const concepts = DRUG_CONCEPTS[entry.name]
  if (concepts == null) return undefined
  if (typeof concepts === "number") return { table: "drug", conceptId: concepts }

  const defaultConcentration = (entry.profile as { defaultConcentration?: string }).defaultConcentration
  const strength = percent(input.concentration)
    ?? (stripped ? percent(name) : null)
    ?? percent(defaultConcentration)
  if (strength == null) return undefined
  const conceptId = Object.entries(concepts).find(([key]) => Math.abs(Number(key) - strength) < 1e-9)?.[1]
  return conceptId ? { table: "drug", conceptId } : undefined
}

/** Every concept id the table can return, for tests and the data dictionary. */
export const INTRAOP_FLUID_CONCEPT_IDS: readonly number[] = [...new Set([
  ...Object.values(DRUG_CONCEPTS).flatMap(value => typeof value === "number" ? [value] : Object.values(value)),
  ...BLOOD_CONCEPTS.flatMap(({ concept }) => concept.table === "device"
    ? [concept.conceptId, concept.transfusionConceptId]
    : [concept.conceptId]),
])].sort((a, b) => a - b)
