/**
 * Does a drug about to be given clash with an allergy the case records?
 *
 * Checks every allergy the preoperative assessment holds -- typed by the
 * clinician or accepted from the hospital system -- against one drug. An
 * allergy picked from the medication list carries an ATC code and an INN and
 * is matched on those; a typed one is matched on keywords in both languages.
 * An allergy that matches nothing is reported as unchecked rather than
 * silently passed, so nobody mistakes "no warning" for "checked".
 *
 * Never blocks. The clinician acknowledges and gives the drug; the
 * acknowledgement is recorded on the dose (`LogEvent.allergyAck`).
 *
 * The families and cross-reactions below were reviewed clinically for 1.5.0.
 * Deliberately not warned, because the evidence does not support it:
 * sulfonamide antibiotics against furosemide, egg or soy against propofol,
 * iodine or seafood against anything in the catalogue, and one opioid family
 * against another.
 */

import { DRUG_CATALOG } from "./catalog/intraop-drugs"
import { INFUSION_CATALOG } from "./catalog/intraop-infusions"

export type AllergyMatchLevel = "same_substance" | "same_class" | "cross_reaction"

export type AllergyFamilyId =
  | "penicillins" | "cephalosporins" | "carbapenems" | "monobactams"
  | "aminoglycosides" | "fluoroquinolones" | "macrolides" | "tetracyclines"
  | "glycopeptides" | "lincosamides"
  | "nsaids" | "coxibs" | "pyrazolones"
  | "amide_local_anaesthetics" | "ester_local_anaesthetics"
  | "nmba_aminosteroid" | "nmba_benzylisoquinolinium" | "nmba_depolarising"
  | "opioid_phenanthrene" | "opioid_phenylpiperidine" | "opioid_methadone" | "opioid_tramadol"
  | "benzodiazepines" | "barbiturates" | "setrons"
  | "fish"

type Family = {
  /** ATC codes or prefixes belonging to the family. */
  atc: readonly string[]
  /** Typed-allergy words, lower case, Bulgarian and English. */
  keywords: readonly string[]
  /** A family a typed allergy can name but no drug belongs to. */
  allergyOnly?: true
}

export const ALLERGY_FAMILIES: Record<AllergyFamilyId, Family> = {
  penicillins: { atc: ["J01C"], keywords: ["penicillin", "пеницилин", "amoxicillin", "амоксицилин", "augmentin", "аугментин", "ampicillin", "ампицилин", "flucloxacillin", "piperacillin", "пиперацилин"] },
  cephalosporins: { atc: ["J01DB", "J01DC", "J01DD", "J01DE", "J01DI"], keywords: ["cephalosporin", "цефалоспорин", "cefazolin", "цефазолин", "ceftriaxone", "цефтриаксон", "cefuroxime", "цефуроксим", "ceftazidime", "цефтазидим", "cefotaxime", "цефотаксим", "cefepime", "цефепим"] },
  carbapenems: { atc: ["J01DH"], keywords: ["carbapenem", "карбапенем", "meropenem", "меропенем", "imipenem", "имипенем", "ertapenem", "ертапенем"] },
  monobactams: { atc: ["J01DF"], keywords: ["aztreonam", "азтреонам"] },
  aminoglycosides: { atc: ["J01GB"], keywords: ["aminoglycoside", "аминогликозид", "gentamicin", "гентамицин", "amikacin", "амикацин", "tobramycin", "тобрамицин"] },
  fluoroquinolones: { atc: ["J01MA"], keywords: ["quinolone", "хинолон", "ciprofloxacin", "ципрофлоксацин", "levofloxacin", "левофлоксацин", "moxifloxacin", "моксифлоксацин"] },
  macrolides: { atc: ["J01FA"], keywords: ["macrolide", "макролид", "azithromycin", "азитромицин", "clarithromycin", "кларитромицин", "erythromycin", "еритромицин"] },
  tetracyclines: { atc: ["J01AA"], keywords: ["tetracycline", "тетрациклин", "doxycycline", "доксициклин"] },
  glycopeptides: { atc: ["J01XA"], keywords: ["vancomycin", "ванкомицин", "teicoplanin", "тейкопланин"] },
  lincosamides: { atc: ["J01FF"], keywords: ["clindamycin", "клиндамицин"] },
  nsaids: { atc: ["M01AA", "M01AB", "M01AC", "M01AE", "M01AG", "M01AX", "N02BA"], keywords: ["nsaid", "нсвп", "нспвс", "нспвп", "aspirin", "аспирин", "ibuprofen", "ибупрофен", "diclofenac", "диклофенак", "ketoprofen", "кетопрофен", "ketorolac", "кеторолак", "dexketoprofen", "декскетопрофен", "lornoxicam", "лорноксикам"] },
  coxibs: { atc: ["M01AH"], keywords: ["parecoxib", "парекоксиб", "celecoxib", "целекоксиб", "etoricoxib", "еторикоксиб"] },
  pyrazolones: { atc: ["N02BB"], keywords: ["metamizole", "метамизол", "analgin", "аналгин", "novalgin"] },
  amide_local_anaesthetics: { atc: ["N01BB"], keywords: ["local anaesthetic", "local anesthetic", "локален анестетик", "местен анестетик", "lidocaine", "лидокаин", "bupivacaine", "бупивакаин", "ropivacaine", "ропивакаин", "mepivacaine", "мепивакаин", "prilocaine", "прилокаин"] },
  ester_local_anaesthetics: { atc: ["N01BA"], keywords: ["procaine", "прокаин", "novocaine", "новокаин", "tetracaine", "тетракаин", "chloroprocaine", "хлоропрокаин", "benzocaine", "бензокаин"] },
  nmba_aminosteroid: { atc: ["M03AC01", "M03AC03", "M03AC06", "M03AC09"], keywords: ["rocuronium", "рокуроний", "рокурониум", "vecuronium", "векуроний", "pancuronium", "панкуроний"] },
  nmba_benzylisoquinolinium: { atc: ["M03AC04", "M03AC10", "M03AC11"], keywords: ["atracurium", "атракуриум", "атракуроний", "cisatracurium", "цисатракуриум", "mivacurium", "мивакуриум"] },
  nmba_depolarising: { atc: ["M03AB"], keywords: ["succinylcholine", "suxamethonium", "сукцинилхолин", "суксаметоний", "листенон", "lysthenon"] },
  opioid_phenanthrene: { atc: ["N02AA", "N02AE01", "N02AF01", "N02AF02", "N07BC06", "R05DA04"], keywords: ["morphine", "морфин", "codeine", "кодеин", "hydromorphone", "хидроморфон", "oxycodone", "оксикодон", "buprenorphine", "бупренорфин", "nalbuphine", "налбуфин"] },
  opioid_phenylpiperidine: { atc: ["N01AH", "N02AB"], keywords: ["fentanyl", "фентанил", "sufentanil", "суфентанил", "remifentanil", "ремифентанил", "alfentanil", "алфентанил", "pethidine", "петидин", "meperidine", "dolantin", "долантин"] },
  opioid_methadone: { atc: ["N07BC02"], keywords: ["methadone", "метадон"] },
  opioid_tramadol: { atc: ["N02AX02"], keywords: ["tramadol", "трамадол"] },
  benzodiazepines: { atc: ["N05BA", "N05CD"], keywords: ["benzodiazepine", "бензодиазепин", "diazepam", "диазепам", "midazolam", "мидазолам", "lorazepam", "лоразепам", "remimazolam", "ремимазолам"] },
  barbiturates: { atc: ["N01AF", "N03AA", "N05CA"], keywords: ["barbiturate", "барбитурат", "thiopental", "тиопентал", "phenobarbital", "фенобарбитал"] },
  setrons: { atc: ["A04AA"], keywords: ["ondansetron", "ондансетрон", "granisetron", "гранисетрон", "palonosetron", "палоносетрон"] },
  fish: { atc: [], keywords: ["fish", "риба", "рибен"], allergyOnly: true },
}

/**
 * Typed words that name every muscle relaxant at once. A clinician who writes
 * "muscle relaxants" means all of them, so each NMBA family matches.
 */
const ALL_NMBA_KEYWORDS = ["muscle relaxant", "neuromuscular", "мускулен релаксант", "мускулни релаксанти", "миорелаксант", "релаксант"]
const NMBA_FAMILIES: readonly AllergyFamilyId[] = ["nmba_aminosteroid", "nmba_benzylisoquinolinium", "nmba_depolarising"]
const ALL_OPIOID_KEYWORDS = ["opioid", "opiate", "опиат", "опиоид"]

/**
 * Weaker cross-reactions, allergy family to drug family. Each is a caution:
 * worth stopping for, not the same as giving the drug itself.
 */
const CROSS_REACTIONS: ReadonlyArray<readonly [AllergyFamilyId, AllergyFamilyId]> = [
  ["penicillins", "cephalosporins"],
  ["penicillins", "carbapenems"],
  ["nsaids", "pyrazolones"],
  ["nsaids", "coxibs"],
  // Any muscle relaxant against every other: cross-sensitisation in NMBA anaphylaxis.
  ...NMBA_FAMILIES.flatMap(from => NMBA_FAMILIES.filter(to => to !== from).map(to => [from, to] as const)),
]

/** Substance-level cross-reactions: a shared side chain. */
const SUBSTANCE_CROSS: ReadonlyArray<readonly [string, string]> = [
  ["J01DD02", "J01DF01"], // ceftazidime, aztreonam
  ["J01DF01", "J01DD02"],
]

/** Protamine, cautioned against a fish allergy. */
const PROTAMINE = "V03AB14"

export type AllergyRecord = { label: string; inn?: string | null; atcCode?: string | null; source?: string | null }

export type DrugIdentity = { name: string; atcCode?: string | null; inn?: string | null }

export type AllergyConflict = {
  /** The allergy as the case records it. */
  allergy: string
  level: AllergyMatchLevel
  /** The family the match came through, absent for a same-substance match. */
  family?: AllergyFamilyId
  /** Where the allergy came from, when it says ("ehr" for the hospital system). */
  source?: string
}

function norm(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : ""
}

/** The names a drug goes by: "Norepinephrine / Noradrenaline" is two. */
function names(value: string | null | undefined): string[] {
  return norm(value).split("/").map(part => part.trim()).filter(Boolean)
}

/** Every allergy the preoperative assessment records, in one shape. */
export function allergyRecords(preop: { allergies?: unknown; allergyDetails?: unknown } | null | undefined): AllergyRecord[] {
  if (!preop || preop.allergies === false) return []
  let raw = preop.allergyDetails
  if (typeof raw === "string") {
    const text = raw.trim()
    if (!text) return []
    try { raw = text.startsWith("[") ? JSON.parse(text) : [text] } catch { raw = [text] }
  }
  if (!Array.isArray(raw)) return []
  return raw.flatMap(item => {
    if (typeof item === "string") return item.trim() ? [{ label: item.trim() }] : []
    if (!item || typeof item !== "object") return []
    const record = item as Record<string, unknown>
    const label = String(record.label ?? record.inn ?? record.atcCode ?? "").trim()
    if (!label) return []
    return [{
      label,
      inn: typeof record.inn === "string" ? record.inn : null,
      atcCode: typeof record.atcCode === "string" ? record.atcCode : null,
      source: typeof record.source === "string" ? record.source : null,
    }]
  })
}

function familiesOfAtc(atc: string | null | undefined): AllergyFamilyId[] {
  const code = norm(atc).toUpperCase()
  if (!code) return []
  return (Object.keys(ALLERGY_FAMILIES) as AllergyFamilyId[])
    .filter(id => ALLERGY_FAMILIES[id].atc.some(prefix => code.startsWith(prefix)))
}

function familiesOfText(text: string): AllergyFamilyId[] {
  const value = norm(text)
  if (!value) return []
  const found = new Set<AllergyFamilyId>()
  for (const id of Object.keys(ALLERGY_FAMILIES) as AllergyFamilyId[]) {
    if (ALLERGY_FAMILIES[id].keywords.some(word => value.includes(word))) found.add(id)
  }
  if (ALL_NMBA_KEYWORDS.some(word => value.includes(word))) NMBA_FAMILIES.forEach(id => found.add(id))
  if (ALL_OPIOID_KEYWORDS.some(word => value.includes(word))) {
    // "Opioids" in a typed allergy is taken as the phenanthrenes it almost
    // always means (morphine, codeine): one family, not every opioid.
    found.add("opioid_phenanthrene")
  }
  return [...found]
}

function allergyFamilies(record: AllergyRecord): AllergyFamilyId[] {
  return [...new Set([
    ...familiesOfAtc(record.atcCode),
    ...familiesOfText(record.label),
    ...familiesOfText(record.inn ?? ""),
  ])]
}

function drugFamilies(drug: DrugIdentity): AllergyFamilyId[] {
  const byAtc = familiesOfAtc(drug.atcCode)
  if (byAtc.length > 0) return byAtc
  // A premedication entry without an ATC code is placed by its name.
  return [...new Set([...names(drug.name), ...names(drug.inn)].flatMap(familiesOfText))]
    .filter(id => !ALLERGY_FAMILIES[id].allergyOnly)
}

const RANK: Record<AllergyMatchLevel, number> = { same_substance: 3, same_class: 2, cross_reaction: 1 }

function matchOne(record: AllergyRecord, drug: DrugIdentity): AllergyConflict | null {
  const conflict = (level: AllergyMatchLevel, family?: AllergyFamilyId): AllergyConflict => ({
    allergy: record.label, level,
    ...(family ? { family } : {}),
    ...(record.source ? { source: record.source } : {}),
  })

  const allergyAtc = norm(record.atcCode).toUpperCase()
  const drugAtc = norm(drug.atcCode).toUpperCase()
  if (allergyAtc && drugAtc && allergyAtc === drugAtc) return conflict("same_substance")
  const allergyNames = new Set([...names(record.label), ...names(record.inn)])
  if ([...names(drug.name), ...names(drug.inn)].some(name => allergyNames.has(name))) return conflict("same_substance")

  const aFamilies = allergyFamilies(record)
  const dFamilies = drugFamilies(drug)
  const shared = aFamilies.find(id => dFamilies.includes(id))
  if (shared) return conflict("same_class", shared)

  for (const [from, to] of CROSS_REACTIONS) {
    if (aFamilies.includes(from) && dFamilies.includes(to)) return conflict("cross_reaction", to)
  }
  if (allergyAtc && drugAtc && SUBSTANCE_CROSS.some(([a, d]) => allergyAtc === a && drugAtc === d)) {
    return conflict("cross_reaction")
  }
  if (aFamilies.includes("fish") && drugAtc === PROTAMINE) return conflict("cross_reaction", "fish")
  return null
}

/** The recorded allergies a drug clashes with, strongest first. */
export function allergyConflicts(allergies: readonly AllergyRecord[], drug: DrugIdentity): AllergyConflict[] {
  return allergies
    .map(record => matchOne(record, drug))
    .filter((found): found is AllergyConflict => found !== null)
    .sort((a, b) => RANK[b.level] - RANK[a.level])
}

/** Every name a drug in the theatre catalogues goes by, for a typed allergy naming one exactly. */
const CATALOG_NAMES = new Set([...DRUG_CATALOG, ...INFUSION_CATALOG].flatMap(entry => names(entry.name)))

/**
 * Allergies nothing here can check: no code, no word this list knows, and no
 * catalogue drug of that name. Shown as such, so a clinician does not take
 * silence for a pass.
 */
export function uncheckedAllergies(allergies: readonly AllergyRecord[]): string[] {
  return allergies
    .filter(record => !norm(record.atcCode)
      && allergyFamilies(record).length === 0
      && ![...names(record.label), ...names(record.inn)].some(name => CATALOG_NAMES.has(name)))
    .map(record => record.label)
}
