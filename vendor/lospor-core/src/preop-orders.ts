/**
 * The preoperative form's switchable sections, and the two sections that
 * leave instructions for the ward: preoperative ward orders and medication
 * instructions.
 *
 * Everything here is shared by the API, the web form, the phone and Status.
 * A hospital's choices -- which sections are on, which rows each list offers,
 * which specialties a consultation can name -- are stored per population
 * (adult, paediatric) beside the preop question profile. Without them (an
 * older server, or before the case read arrives) the bundled defaults below
 * apply.
 *
 * An order or instruction on a case keeps its own copy of the row's code,
 * both labels and concept, so a row the hospital later renames or removes
 * still reads as it was ordered.
 */

import { DEFAULT_CONSULT_SPECIALTY_KEYS, NHIS_SPECIALTY_BY_KEY } from "./nhis-specialties"
import { LAB_LIBRARY } from "./labs"

export type PreopPopulation = "ADULT" | "PEDIATRIC"
export type PreopLanguage = "en" | "bg"

// ── Sections ──────────────────────────────────────────────────────────────

export type PreopSectionKey =
  | "MEDICAL_HISTORY"
  | "CURRENT_MEDICATIONS"
  | "LABS"
  | "PLANNED_ANAESTHESIA"
  | "PEDIATRIC_FASTING"
  | "WARD_ORDERS"
  | "MEDICATION_INSTRUCTIONS"
  | "PREMEDICATION"
  | "POSTOP_RECOVERY_VITALS"
  | "POSTOP_PAIN"
  | "POSTOP_DELIRIUM"
  | "POSTOP_PONV"
  | "POSTOP_HANDOVER"

export type PreopSectionDefinition = {
  key: PreopSectionKey
  labelEn: string
  labelBg: string
  populations: readonly PreopPopulation[]
  /**
   * The form the section belongs to. The postoperative form's switches (10.0.0)
   * are kept in the same rows as the preoperative ones, per population.
   */
  form?: "PREOP" | "POSTOP"
  /** The form section whose catalogue questions go with it: off, they are not asked. */
  formSection?: "medical_history" | "current_medications" | "labs"
  /** A section that cannot be on without this one. */
  requires?: PreopSectionKey
}

/**
 * The sections a hospital may switch off. Nothing here is needed to continue
 * to the summary or the intraoperative record.
 */
export const PREOP_SWITCHABLE_SECTIONS: readonly PreopSectionDefinition[] = Object.freeze([
  { key: "MEDICAL_HISTORY", labelEn: "Medical history", labelBg: "Придружаващи заболявания", populations: ["ADULT", "PEDIATRIC"], formSection: "medical_history" },
  { key: "CURRENT_MEDICATIONS", labelEn: "Current medications", labelBg: "Приемани медикаменти", populations: ["ADULT", "PEDIATRIC"], formSection: "current_medications" },
  { key: "LABS", labelEn: "Laboratory", labelBg: "Лаборатория", populations: ["ADULT", "PEDIATRIC"], formSection: "labs" },
  { key: "PLANNED_ANAESTHESIA", labelEn: "Planned anaesthesia", labelBg: "Планирана анестезия", populations: ["ADULT", "PEDIATRIC"] },
  { key: "PEDIATRIC_FASTING", labelEn: "Nil by mouth", labelBg: "Гладуване", populations: ["PEDIATRIC"] },
  { key: "WARD_ORDERS", labelEn: "Preoperative ward orders", labelBg: "Назначения в предоперативното отделение", populations: ["ADULT", "PEDIATRIC"] },
  { key: "MEDICATION_INSTRUCTIONS", labelEn: "Medication instructions", labelBg: "Указания за медикаментите", populations: ["ADULT", "PEDIATRIC"], requires: "CURRENT_MEDICATIONS" },
  { key: "PREMEDICATION", labelEn: "Premedication", labelBg: "Премедикация", populations: ["ADULT", "PEDIATRIC"] },
  // Postoperative: nothing here is needed to finalise a case.
  { key: "POSTOP_RECOVERY_VITALS", labelEn: "Recovery vital signs", labelBg: "Витални показатели при възстановяване", populations: ["ADULT", "PEDIATRIC"], form: "POSTOP" },
  { key: "POSTOP_PAIN", labelEn: "Pain", labelBg: "Болка", populations: ["ADULT", "PEDIATRIC"], form: "POSTOP" },
  { key: "POSTOP_DELIRIUM", labelEn: "Emergence delirium (PAED)", labelBg: "Делир при събуждане (PAED)", populations: ["PEDIATRIC"], form: "POSTOP" },
  { key: "POSTOP_PONV", labelEn: "Postoperative nausea and vomiting", labelBg: "Постоперативно гадене и повръщане (ПОГП)", populations: ["ADULT", "PEDIATRIC"], form: "POSTOP" },
  { key: "POSTOP_HANDOVER", labelEn: "Handover instructions", labelBg: "Указания при предаване", populations: ["ADULT", "PEDIATRIC"], form: "POSTOP" },
])

/** The postoperative sections that are always on: both are needed to finalise. */
export const POSTOP_FIXED_SECTIONS: readonly { key: string; labelEn: string; labelBg: string; reasonEn: string; reasonBg: string }[] = Object.freeze([
  { key: "RECOVERY_SCORE", labelEn: "Recovery score (Aldrete / Steward)", labelBg: "Скор при възстановяване (Aldrete / Steward)", reasonEn: "Required to finalise", reasonBg: "Задължителен за приключване" },
  { key: "DISPOSITION", labelEn: "Disposition", labelBg: "Насочване", reasonEn: "Required to finalise", reasonBg: "Задължителен за приключване" },
])

/** A section's form; the preoperative one unless it says otherwise. */
export function sectionForm(section: PreopSectionDefinition): "PREOP" | "POSTOP" {
  return section.form ?? "PREOP"
}

/**
 * The sections that are always on, and why, for Status to show beside the
 * switches. The risk scores have switches of their own (their questions).
 */
export const PREOP_FIXED_SECTIONS: readonly { key: string; labelEn: string; labelBg: string; reasonEn: string; reasonBg: string }[] = Object.freeze([
  { key: "DEMOGRAPHICS", labelEn: "Demographics", labelBg: "Демографски данни", reasonEn: "Required to continue", reasonBg: "Задължителен за продължаване" },
  { key: "CASE_DETAILS", labelEn: "Case details", labelBg: "Данни за случая", reasonEn: "Required to continue", reasonBg: "Задължителен за продължаване" },
  { key: "ANAMNESIS", labelEn: "Anamnesis", labelBg: "Анамнеза", reasonEn: "Holds the allergies; its questions switch one by one", reasonBg: "Съдържа алергиите; въпросите му се включват поотделно" },
  { key: "VITALS", labelEn: "Vital signs", labelBg: "Витални показатели", reasonEn: "Required to continue", reasonBg: "Задължителен за продължаване" },
  { key: "AIRWAY", labelEn: "Airway", labelBg: "Дихателни пътища", reasonEn: "Required to continue", reasonBg: "Задължителен за продължаване" },
  { key: "RISK", labelEn: "Risk scores (ASA)", labelBg: "Рискови скорове (ASA)", reasonEn: "ASA is required to continue", reasonBg: "ASA е задължителен за продължаване" },
])

export function preopSectionsFor(population: PreopPopulation): PreopSectionDefinition[] {
  return PREOP_SWITCHABLE_SECTIONS.filter(section => section.populations.includes(population))
}

export function preopSectionDefinition(key: string): PreopSectionDefinition | undefined {
  return PREOP_SWITCHABLE_SECTIONS.find(section => section.key === key)
}

// ── Order and instruction rows ────────────────────────────────────────────

export type PreopOrderList = "WARD_ORDER" | "MEDICATION_INSTRUCTION"

/**
 * What a row asks for when it is ticked or added:
 * NONE -- "no additional orders", which stands alone;
 * SIMPLE -- nothing more;
 * CONSULT -- a specialty;
 * LAB -- a laboratory test (fixed by the row, or picked);
 * MEDICATION -- one of the patient's current medications, and hours if the row takes them.
 */
export type PreopOrderKind = "NONE" | "SIMPLE" | "CONSULT" | "LAB" | "MEDICATION"
export type PreopHoursMode = "REQUIRED" | "OPTIONAL" | "NONE"

export type PreopOrderOption = {
  key: string
  list: PreopOrderList
  kind: PreopOrderKind
  labelEn: string
  labelBg: string
  /**
   * The OMOP concept of what is ordered; 0 where none says it. A lab row holds
   * Laboratory test requested and a consultation Patient referral to
   * specialist: the test and the specialty go alongside.
   */
  conceptId: number
  /** Shipped with the software: can be switched off, not removed or renamed. */
  bundled: boolean
  enabled: boolean
  sortOrder: number
  /** MEDICATION rows: whether the row takes "hours before surgery". */
  hoursMode: PreopHoursMode
  /** LAB rows with a fixed test (the morning glucose). Null: the test is picked. */
  labTest: string | null
}

type BundledRow = Omit<PreopOrderOption, "enabled" | "sortOrder" | "bundled" | "hoursMode" | "labTest"> & Partial<Pick<PreopOrderOption, "hoursMode" | "labTest">>

/** SNOMED Laboratory test requested (165332000): every investigation the ward is asked to do. */
export const LAB_REQUESTED_CONCEPT_ID = 4013385
/** The morning glucose is serum glucose: LOINC 14749-6, OMOP 3013826. */
export const MORNING_GLUCOSE_LOINC = "14749-6"
export const MORNING_GLUCOSE_CONCEPT_ID = 3013826

const BUNDLED_WARD_ORDERS: readonly BundledRow[] = [
  { key: "NO_ADDITIONAL_ORDERS", list: "WARD_ORDER", kind: "NONE", labelEn: "No additional orders", labelBg: "Без допълнителни назначения", conceptId: 0 },
  // SNOMED Electrolyte regulation (276025008)
  { key: "CORRECT_ELECTROLYTES", list: "WARD_ORDER", kind: "SIMPLE", labelEn: "Correct electrolyte disturbances", labelBg: "Корекция на дисйонемия", conceptId: 4171615 },
  // SNOMED Fluid balance regulation (276026009)
  { key: "CORRECT_WATER_BALANCE", list: "WARD_ORDER", kind: "SIMPLE", labelEn: "Correct water balance", labelBg: "Корекция на водния баланс", conceptId: 4175359 },
  // No standard concept says "correct anaemia" (only transfusion, which is one way of doing it).
  { key: "CORRECT_ANAEMIA", list: "WARD_ORDER", kind: "SIMPLE", labelEn: "Correct anaemia", labelBg: "Корекция на анемия", conceptId: 0 },
  // Likewise: albumin infusion is one way, not the order.
  { key: "CORRECT_HYPOPROTEINAEMIA", list: "WARD_ORDER", kind: "SIMPLE", labelEn: "Correct hypoproteinaemia", labelBg: "Корекция на хипопротеинемия", conceptId: 0 },
  // SNOMED Acid-base balance regulation (386501002)
  { key: "CORRECT_ACID_BASE", list: "WARD_ORDER", kind: "SIMPLE", labelEn: "Correct acid–base disorders", labelBg: "Корекция на алкално-киселинните нарушения", conceptId: 4303565 },
  // SNOMED Patient referral to specialist (103696004); the specialty is the NHIS CL006 code.
  { key: "CONSULTATION", list: "WARD_ORDER", kind: "CONSULT", labelEn: "Consultation with", labelBg: "Консултация с", conceptId: 4304361 },
  { key: "MORNING_SERUM_GLUCOSE", list: "WARD_ORDER", kind: "LAB", labelEn: "Serum glucose on the morning of surgery", labelBg: "Серумна глюкоза сутринта в деня на операцията", conceptId: LAB_REQUESTED_CONCEPT_ID, labTest: "Glucose" },
  { key: "INVESTIGATE", list: "WARD_ORDER", kind: "LAB", labelEn: "Investigate", labelBg: "Изследване на", conceptId: LAB_REQUESTED_CONCEPT_ID },
]

const BUNDLED_MEDICATION_INSTRUCTIONS: readonly BundledRow[] = [
  // SNOMED Recommendation to discontinue medication (4701000124104)
  { key: "STOP_BEFORE_SURGERY", list: "MEDICATION_INSTRUCTION", kind: "MEDICATION", labelEn: "Stop taking", labelBg: "Спрете приема на", conceptId: 764611, hoursMode: "REQUIRED" },
  // No standard concept says "continue this medication".
  { key: "DO_NOT_STOP", list: "MEDICATION_INSTRUCTION", kind: "MEDICATION", labelEn: "Don't stop taking", labelBg: "Не спирайте приема на", conceptId: 0, hoursMode: "NONE" },
]

function bundledRows(rows: readonly BundledRow[]): PreopOrderOption[] {
  return rows.map((row, sortOrder) => ({
    ...row,
    bundled: true,
    enabled: true,
    sortOrder,
    hoursMode: row.hoursMode ?? "NONE",
    labTest: row.labTest ?? null,
  }))
}

export const BUNDLED_PREOP_ORDER_OPTIONS: readonly PreopOrderOption[] = Object.freeze([
  ...bundledRows(BUNDLED_WARD_ORDERS),
  ...bundledRows(BUNDLED_MEDICATION_INSTRUCTIONS),
])

export function bundledPreopOrderOption(key: string): PreopOrderOption | undefined {
  return BUNDLED_PREOP_ORDER_OPTIONS.find(option => option.key === key)
}

/** A row a hospital adds has a key of this form, so it can never take a bundled one's. */
export const CUSTOM_ORDER_KEY_PREFIX = "CUSTOM_"
export function isCustomOrderKey(key: string): boolean {
  return key.startsWith(CUSTOM_ORDER_KEY_PREFIX)
}

/**
 * The hours a "stop taking" row offers: every hour through the first day, then
 * the holds drugs actually need (SGLT2 inhibitors 72 h, warfarin and
 * clopidogrel 5-7 days, irreversible MAO inhibitors 2 weeks).
 */
export const MEDICATION_HOLD_HOURS: readonly number[] = Object.freeze([
  ...Array.from({ length: 24 }, (_, index) => index + 1),
  36, 48, 72, 96, 120, 144, 168, 240, 336,
])
export const MAX_MEDICATION_HOLD_HOURS = 336

// ── A population's configuration ──────────────────────────────────────────

export type PreopSectionConfig = {
  sections: Record<PreopSectionKey, boolean>
  /** Every row of both lists, switched-off ones included, in order. */
  orderOptions: PreopOrderOption[]
  /** The CL006 keys a consultation can name. */
  consultSpecialtyKeys: string[]
}

export function defaultPreopSectionConfig(population: PreopPopulation): PreopSectionConfig {
  const sections = {} as Record<PreopSectionKey, boolean>
  for (const section of PREOP_SWITCHABLE_SECTIONS) sections[section.key] = section.populations.includes(population)
  return {
    sections,
    orderOptions: BUNDLED_PREOP_ORDER_OPTIONS.map(option => ({ ...option })),
    consultSpecialtyKeys: [...DEFAULT_CONSULT_SPECIALTY_KEYS],
  }
}

/**
 * The configuration a case's form follows. A section that does not belong to
 * the population is off; one that needs another section is off without it.
 */
export function preopSectionConfigFor(
  configs: Partial<Record<PreopPopulation, PreopSectionConfig>> | null | undefined,
  population: PreopPopulation,
): PreopSectionConfig {
  const config = configs?.[population] ?? defaultPreopSectionConfig(population)
  const sections = {} as Record<PreopSectionKey, boolean>
  for (const section of PREOP_SWITCHABLE_SECTIONS) {
    sections[section.key] = section.populations.includes(population) && config.sections[section.key] !== false
  }
  for (const section of PREOP_SWITCHABLE_SECTIONS) {
    if (section.requires && !sections[section.requires]) sections[section.key] = false
  }
  return { ...config, sections }
}

export function isPreopSectionOn(config: PreopSectionConfig, key: PreopSectionKey): boolean {
  return config.sections[key] === true
}

/** The rows a list offers on the form, in order. */
export function preopOrderOptionsFor(config: PreopSectionConfig, list: PreopOrderList): PreopOrderOption[] {
  return config.orderOptions
    .filter(option => option.list === list && option.enabled)
    .sort((a, b) => a.sortOrder - b.sortOrder)
}

/** Whether a question in this form section is asked: not when its section is off. */
export function isFormSectionOn(config: PreopSectionConfig, formSection: string): boolean {
  const section = PREOP_SWITCHABLE_SECTIONS.find(item => item.formSection === formSection)
  return !section || config.sections[section.key] === true
}

// ── What a case holds ─────────────────────────────────────────────────────

/** A ward order as the form sends it. */
export type PreopWardOrderInput = {
  optionKey: string
  /** CONSULT: the CL006 key. */
  specialtyKey?: string | null
  /** LAB rows without a fixed test: the bundled lab test's name. */
  labTest?: string | null
}

/** A medication instruction as the form sends it. The id is the form's, so autosave never doubles a row. */
export type PreopMedicationInstructionInput = {
  id: string
  optionKey: string
  medicationLabel: string
  medicationInn?: string | null
  medicationAtc?: string | null
  hoursBefore?: number | null
}

/** A ward order as stored and read back: its own copy of what was ordered. */
export type PreopWardOrder = {
  id: string
  optionKey: string
  kind: PreopOrderKind
  labelEn: string
  labelBg: string
  conceptId: number
  specialtyKey: string | null
  specialtyLabelEn: string | null
  specialtyLabelBg: string | null
  labTest: string | null
  labLoinc: string | null
}

export type PreopMedicationInstruction = {
  id: string
  optionKey: string
  labelEn: string
  labelBg: string
  conceptId: number
  medicationLabel: string
  medicationInn: string | null
  medicationAtc: string | null
  hoursBefore: number | null
}

/** Two ward orders that are the same order: the same row, specialty and test. */
export function wardOrderIdentity(order: Pick<PreopWardOrderInput, "optionKey" | "specialtyKey" | "labTest">): string {
  return [order.optionKey, order.specialtyKey ?? "", order.labTest ?? ""].join("|")
}

export type PreopOrderProblem =
  | { code: "UNKNOWN_OPTION"; optionKey: string }
  | { code: "WRONG_LIST"; optionKey: string }
  | { code: "NONE_WITH_OTHERS" }
  | { code: "DUPLICATE_ORDER"; optionKey: string }
  | { code: "SPECIALTY_REQUIRED"; optionKey: string }
  | { code: "UNKNOWN_SPECIALTY"; specialtyKey: string }
  | { code: "LAB_REQUIRED"; optionKey: string }
  | { code: "UNKNOWN_LAB"; labTest: string }
  | { code: "MEDICATION_REQUIRED"; id: string }
  | { code: "HOURS_REQUIRED"; id: string }
  | { code: "HOURS_NOT_TAKEN"; id: string }
  | { code: "HOURS_OUT_OF_RANGE"; id: string }
  | { code: "DUPLICATE_ID"; id: string }

const LAB_NAMES = new Set(LAB_LIBRARY.map(test => test.name))

export function isBundledLabTest(name: string): boolean {
  return LAB_NAMES.has(name)
}

/**
 * What is wrong with a case's ward orders against the hospital's rows. A row
 * the hospital has since switched off is still accepted when the case already
 * holds it (`held`): an order placed stays placed.
 */
export function wardOrderProblems(
  orders: readonly PreopWardOrderInput[],
  config: PreopSectionConfig,
  held: ReadonlySet<string> = new Set(),
): PreopOrderProblem[] {
  const problems: PreopOrderProblem[] = []
  const byKey = new Map(config.orderOptions.map(option => [option.key, option]))
  const specialties = new Set(config.consultSpecialtyKeys)
  const seen = new Set<string>()
  let none = false
  for (const order of orders) {
    const option = byKey.get(order.optionKey)
    const identity = wardOrderIdentity(order)
    if (!option || (!option.enabled && !held.has(identity))) { problems.push({ code: "UNKNOWN_OPTION", optionKey: order.optionKey }); continue }
    if (option.list !== "WARD_ORDER") { problems.push({ code: "WRONG_LIST", optionKey: order.optionKey }); continue }
    if (seen.has(identity)) problems.push({ code: "DUPLICATE_ORDER", optionKey: order.optionKey })
    seen.add(identity)
    if (option.kind === "NONE") none = true
    if (option.kind === "CONSULT") {
      if (!order.specialtyKey) problems.push({ code: "SPECIALTY_REQUIRED", optionKey: order.optionKey })
      else if (!NHIS_SPECIALTY_BY_KEY.has(order.specialtyKey) || (!specialties.has(order.specialtyKey) && !held.has(identity))) {
        problems.push({ code: "UNKNOWN_SPECIALTY", specialtyKey: order.specialtyKey })
      }
    }
    if (option.kind === "LAB" && !option.labTest) {
      if (!order.labTest) problems.push({ code: "LAB_REQUIRED", optionKey: order.optionKey })
      else if (!isBundledLabTest(order.labTest)) problems.push({ code: "UNKNOWN_LAB", labTest: order.labTest })
    }
  }
  if (none && orders.length > 1) problems.push({ code: "NONE_WITH_OTHERS" })
  return problems
}

export function medicationInstructionProblems(
  instructions: readonly PreopMedicationInstructionInput[],
  config: PreopSectionConfig,
  held: ReadonlySet<string> = new Set(),
): PreopOrderProblem[] {
  const problems: PreopOrderProblem[] = []
  const byKey = new Map(config.orderOptions.map(option => [option.key, option]))
  const ids = new Set<string>()
  for (const instruction of instructions) {
    if (ids.has(instruction.id)) problems.push({ code: "DUPLICATE_ID", id: instruction.id })
    ids.add(instruction.id)
    const option = byKey.get(instruction.optionKey)
    if (!option || (!option.enabled && !held.has(instruction.id))) { problems.push({ code: "UNKNOWN_OPTION", optionKey: instruction.optionKey }); continue }
    if (option.list !== "MEDICATION_INSTRUCTION") { problems.push({ code: "WRONG_LIST", optionKey: instruction.optionKey }); continue }
    if (!instruction.medicationLabel.trim()) problems.push({ code: "MEDICATION_REQUIRED", id: instruction.id })
    const hours = instruction.hoursBefore ?? null
    if (hours == null && option.hoursMode === "REQUIRED") problems.push({ code: "HOURS_REQUIRED", id: instruction.id })
    if (hours != null && option.hoursMode === "NONE") problems.push({ code: "HOURS_NOT_TAKEN", id: instruction.id })
    if (hours != null && (!Number.isInteger(hours) || hours < 1 || hours > MAX_MEDICATION_HOLD_HOURS)) {
      problems.push({ code: "HOURS_OUT_OF_RANGE", id: instruction.id })
    }
  }
  return problems
}

/**
 * The instructions a save carries. A row added with (+) has no drug until one
 * is picked, and the server refuses a row without one, so it stays in the
 * form and off the wire until then.
 */
export function medicationInstructionsToSend<T extends { medicationLabel: string }>(rows: T[]): T[] {
  return rows.filter(row => row.medicationLabel.trim() !== "")
}

/**
 * Whether an instruction's drug is still on the current medication list.
 * Matched on the INN where both have one, else on the label, ignoring case.
 */
export function isInstructionMedicationCurrent(
  instruction: Pick<PreopMedicationInstruction, "medicationLabel" | "medicationInn">,
  currentMedications: readonly { label?: unknown; inn?: unknown }[],
): boolean {
  const norm = (value: unknown) => typeof value === "string" ? value.trim().toLowerCase() : ""
  const inn = norm(instruction.medicationInn)
  const label = norm(instruction.medicationLabel)
  return currentMedications.some(item =>
    (inn !== "" && norm(item.inn) === inn) || (label !== "" && norm(item.label) === label))
}

/** The instructions whose drug has since been taken off the current medication list. */
export function instructionsWithRemovedMedication<T extends Pick<PreopMedicationInstruction, "medicationLabel" | "medicationInn">>(
  instructions: readonly T[],
  currentMedications: readonly { label?: unknown; inn?: unknown }[],
): T[] {
  return instructions.filter(instruction => !isInstructionMedicationCurrent(instruction, currentMedications))
}

// ── Text ──────────────────────────────────────────────────────────────────

/** "Consultation with Cardiology", "Investigate Potassium (K⁺)", "Correct anaemia". */
export function wardOrderText(
  order: Pick<PreopWardOrder, "labelEn" | "labelBg" | "kind" | "specialtyLabelEn" | "specialtyLabelBg" | "labTest" | "optionKey">,
  language: PreopLanguage,
): string {
  const label = language === "bg" ? order.labelBg : order.labelEn
  if (order.kind === "CONSULT") {
    const specialty = language === "bg" ? order.specialtyLabelBg : order.specialtyLabelEn
    return specialty ? `${label} ${specialty}` : label
  }
  // A fixed-test row already names its test.
  if (order.kind === "LAB" && order.labTest && !bundledPreopOrderOption(order.optionKey)?.labTest) return `${label} ${order.labTest}`
  return label
}

/** "72 h (3 days)" / "72 h (3 дни)": units are Latin in every language. */
export function holdHoursText(hours: number, language: PreopLanguage): string {
  if (hours < 48 || hours % 24 !== 0) return `${hours} h`
  return `${hours} h (${hours / 24} ${language === "bg" ? "дни" : "days"})`
}

/** "Stop taking Metformin 72 h (3 days) before surgery". */
export function medicationInstructionText(
  instruction: Pick<PreopMedicationInstruction, "labelEn" | "labelBg" | "medicationLabel" | "hoursBefore">,
  language: PreopLanguage,
): string {
  const label = language === "bg" ? instruction.labelBg : instruction.labelEn
  const hours = instruction.hoursBefore
  if (hours == null) return `${label} ${instruction.medicationLabel}`
  return language === "bg"
    ? `${label} ${instruction.medicationLabel} ${holdHoursText(hours, language)} преди операцията`
    : `${label} ${instruction.medicationLabel} ${holdHoursText(hours, language)} before surgery`
}
