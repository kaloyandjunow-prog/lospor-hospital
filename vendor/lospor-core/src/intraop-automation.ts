/**
 * Intraoperative automation settings (10.1.0): what a hospital has switched
 * on in Status. The shared Core default keeps reminders on; deployment-specific
 * API defaults may expose additional demo groups without changing this
 * hospital baseline.
 *
 * Only presentation of questions: no case records these settings, and turning
 * a switch off never changes what was already charted.
 */

export const VITAL_BAND_KEYS = [
  "NEWBORN", "INFANT", "TODDLER", "PRESCHOOL", "SCHOOL", "ADOLESCENT", "ADULT", "OLDER",
] as const
export type VitalBandKey = typeof VITAL_BAND_KEYS[number]

export const VITAL_SIGN_KEYS = ["hr", "sbp", "dbp", "map"] as const
export type VitalSignKey = typeof VITAL_SIGN_KEYS[number]

/** The four independent questions the vital-statistics engine can ask. */
export const VITAL_QUESTION_KINDS = ["hypotension", "hypertension", "bradycardia", "tachycardia"] as const
export type VitalQuestionKind = typeof VITAL_QUESTION_KINDS[number]
export const vitalQuestionAutomationId = (kind: VitalQuestionKind) => `vital:${kind}`

/** The share of a band's readings counted as unusual at one end, in percent. */
export const VITAL_TAIL_STEPS = [0.1, 0.25, 0.5, 1, 2, 2.5, 5] as const
export const DEFAULT_VITAL_TAIL = 0.5

export const DEFAULT_VITAL_MIN_CASES = 100
/**
 * Hypertension is judged against the patient's own baseline (10.2.0): the
 * percentage above the preop BP, or the first BP charted in theatre, that
 * asks the question. Status sets it from 10 to 50%.
 */
export const HYPERTENSION_BASELINE_MIN_PERCENT = 10
export const HYPERTENSION_BASELINE_MAX_PERCENT = 50
export const DEFAULT_HYPERTENSION_BASELINE_PERCENT = 20
export const MIN_VITAL_MIN_CASES = 20
export const MAX_VITAL_MIN_CASES = 10_000

export type VitalTail = { low: number; high: number }
export type VitalTails = Record<VitalBandKey, Record<VitalSignKey, VitalTail>>

/**
 * The groups a hospital switches on in Status (10.2.0), each beside the 10.1.0
 * vitals questions. Off in Status is off for everyone; on, each clinician may
 * still turn a group off for themselves (ClinicalPreferences.automationGroups).
 *
 * - treatmentSuggestions: the card or checklist after a complication (A).
 * - reverseQuestions: a rescue drug, fluid or shock asks about its complication (B).
 * - readingQuestions: SpO2, EtCO2, temperature, the MH pattern and TOF (R1-R6).
 * - labQuestions: intraoperative lab results outside their limits (L1-L7).
 * - reminders: the preop facts, the local anaesthetic maximum, extubation,
 *   procedure end and airway questions (P1-P4, E2-E6).
 * - timers: follow-ups after a treatment (arrest, lipid, anaphylaxis,
 *   dantrolene, tourniquet).
 */
export const AUTOMATION_GROUPS = [
  "treatmentSuggestions", "reverseQuestions", "readingQuestions", "labQuestions", "reminders", "timers",
] as const
export type AutomationGroup = typeof AUTOMATION_GROUPS[number]

/** Every switch a clinician can turn off for themselves: the groups and the vitals questions. */
export const USER_AUTOMATION_SWITCHES = ["vitalQuestions", ...AUTOMATION_GROUPS] as const
export type UserAutomationSwitch = typeof USER_AUTOMATION_SWITCHES[number]

export type IntraopAutomationSettings = {
  /** The master switch: off = no questions and no automatic logging anywhere. */
  enabled: boolean
  groups: Record<AutomationGroup, boolean>
  /**
   * The automations Status has switched off one by one (10.2.0), by id: see
   * AUTOMATIONS. Absent means on, so a group switched on runs everything in it
   * until a line is switched off, and a setting saved before this existed
   * keeps every automation it had.
   */
  disabled: string[]
  /**
   * The dantrolene vial the hospital stocks, in mg (10.2.0): the MH checklist
   * shows the dose as vials. 20 mg (Dantrium) unless set.
   */
  dantroleneVialsMg: number[]
  /** Minutes after the last reading that a monitor's next reading is due, per monitor (Status). */
  monitoringDueMinutes: Record<string, number>
  vitalQuestions: {
    enabled: boolean
    /** Cases a band needs before its statistics are used; until then only the fixed rules ask. */
    minCases: number
    tails: VitalTails
    /** Percent above the patient's baseline SBP or MAP that counts as hypertension. */
    hypertensionBaselinePercent: number
  }
}

function defaultTails(): VitalTails {
  return Object.fromEntries(VITAL_BAND_KEYS.map(band => [
    band,
    Object.fromEntries(VITAL_SIGN_KEYS.map(sign => [sign, { low: DEFAULT_VITAL_TAIL, high: DEFAULT_VITAL_TAIL }])),
  ])) as VitalTails
}

/**
 * How long after the last reading a monitor's next one is due (10.2.0), in
 * minutes. The hospital sets each in Status, from 1 to 120.
 */
export const DEFAULT_MONITORING_DUE_MINUTES: Readonly<Record<string, number>> = Object.freeze({
  bis: 15, tofMonitor: 10, cvpMonitor: 15, etco2Monitor: 15, tempMonitor: 30,
})
export const MONITORING_DUE_MIN_MINUTES = 1
export const MONITORING_DUE_MAX_MINUTES = 120

function monitoringDueMinutes(value: unknown): Record<string, number> {
  const input = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}
  return Object.fromEntries(Object.entries(DEFAULT_MONITORING_DUE_MINUTES).map(([field, fallback]) => {
    const minutes = input[field]
    return [field, typeof minutes === "number" && Number.isInteger(minutes)
      && minutes >= MONITORING_DUE_MIN_MINUTES && minutes <= MONITORING_DUE_MAX_MINUTES ? minutes : fallback]
  }))
}

export const DANTROLENE_VIAL_SIZES_MG = [20, 120, 250] as const
export const DEFAULT_DANTROLENE_VIAL_MG = 20

/** The sizes read from saved settings: the stocked list, or an older single size; none valid means 20 mg. */
function stockedVials(list: unknown, single: unknown): number[] {
  const allowed = DANTROLENE_VIAL_SIZES_MG as readonly number[]
  const fromList = Array.isArray(list) ? list.filter((size): size is number => typeof size === "number" && allowed.includes(size)) : []
  const sizes = fromList.length > 0 ? fromList : typeof single === "number" && allowed.includes(single) ? [single] : [DEFAULT_DANTROLENE_VIAL_MG]
  return [...new Set(sizes)].sort((a, b) => a - b)
}

/** The ids switched off, as saved: strings only, each once, a bounded list. */
function disabledAutomations(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const ids = value.filter((id): id is string => typeof id === "string" && id.length > 0 && id.length <= 100)
  return [...new Set(ids)].slice(0, 500).sort()
}

/**
 * Every suggestion is on unless Status switches it off (10.2.0, the maintainer's decision): treatment cards,
 * questions after a rescue, questions from readings and labs, reminders and follow-ups. A hospital narrows this in
 * Status; a clinician narrows it for themselves in Settings.
 */
const ON_BY_DEFAULT: ReadonlySet<AutomationGroup> = new Set<AutomationGroup>(AUTOMATION_GROUPS)
const DEFAULT_GROUPS = (): Record<AutomationGroup, boolean> =>
  Object.fromEntries(AUTOMATION_GROUPS.map(group => [group, ON_BY_DEFAULT.has(group)])) as Record<AutomationGroup, boolean>

export const DEFAULT_INTRAOP_AUTOMATION: IntraopAutomationSettings = Object.freeze({
  enabled: true,
  groups: DEFAULT_GROUPS(),
  disabled: [],
  dantroleneVialsMg: [DEFAULT_DANTROLENE_VIAL_MG],
  monitoringDueMinutes: { ...DEFAULT_MONITORING_DUE_MINUTES },
  vitalQuestions: { enabled: true, minCases: DEFAULT_VITAL_MIN_CASES, tails: defaultTails(), hypertensionBaselinePercent: DEFAULT_HYPERTENSION_BASELINE_PERCENT },
}) as IntraopAutomationSettings

const record = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {}

/** A tail is one of the steps the Status slider offers; anything else is the default. */
function tail(value: unknown): number {
  return typeof value === "number" && (VITAL_TAIL_STEPS as readonly number[]).includes(value) ? value : DEFAULT_VITAL_TAIL
}

/** The stored settings in full; anything absent, malformed or out of range takes its default. */
export function parseIntraopAutomation(value: unknown): IntraopAutomationSettings {
  const input = record(value)
  const vitals = record(input.vitalQuestions)
  const minCases = vitals.minCases
  const tailsInput = record(vitals.tails)
  const groupsInput = record(input.groups)
  const saved = typeof value === "object" && value !== null && !Array.isArray(value)
  return {
    // Nothing saved at all is the default, with the reminders on. Settings that were saved are read as they are: a
    // master switch that is missing is off, and a group that is missing takes its default (only true is on otherwise).
    enabled: saved ? input.enabled === true : DEFAULT_INTRAOP_AUTOMATION.enabled,
    groups: Object.fromEntries(AUTOMATION_GROUPS.map(group => [group, groupsInput[group] === undefined ? ON_BY_DEFAULT.has(group) : groupsInput[group] === true])) as Record<AutomationGroup, boolean>,
    disabled: disabledAutomations(input.disabled),
    dantroleneVialsMg: stockedVials(input.dantroleneVialsMg, input.dantroleneVialMg),
    monitoringDueMinutes: monitoringDueMinutes(input.monitoringDueMinutes),
    vitalQuestions: {
      // Absent is the default (on); a policy that saved it off keeps it off.
      enabled: vitals.enabled === undefined ? DEFAULT_INTRAOP_AUTOMATION.vitalQuestions.enabled : vitals.enabled === true,
      minCases: typeof minCases === "number" && Number.isInteger(minCases)
        && minCases >= MIN_VITAL_MIN_CASES && minCases <= MAX_VITAL_MIN_CASES
        ? minCases
        : DEFAULT_VITAL_MIN_CASES,
      hypertensionBaselinePercent: typeof vitals.hypertensionBaselinePercent === "number"
        && Number.isInteger(vitals.hypertensionBaselinePercent)
        && vitals.hypertensionBaselinePercent >= HYPERTENSION_BASELINE_MIN_PERCENT
        && vitals.hypertensionBaselinePercent <= HYPERTENSION_BASELINE_MAX_PERCENT
        ? vitals.hypertensionBaselinePercent
        : DEFAULT_HYPERTENSION_BASELINE_PERCENT,
      tails: Object.fromEntries(VITAL_BAND_KEYS.map(band => {
        const signs = record(tailsInput[band])
        return [band, Object.fromEntries(VITAL_SIGN_KEYS.map(sign => {
          const pair = record(signs[sign])
          return [sign, { low: tail(pair.low), high: tail(pair.high) }]
        }))]
      })) as VitalTails,
    },
  }
}

/** A clinician's own switches: absent means on, for every line including the context links. */
export type UserAutomationSwitches = Partial<Record<UserAutomationSwitch, boolean>> & {
  automationLines?: Record<string, boolean>
}

/** Personal defaults are part of the product contract, not the hospital policy. */
export function personalAutomationDefaultEnabled(_id: string): boolean {
  return true
}

export function personalAutomationEnabled(
  user: UserAutomationSwitches | null | undefined,
  id: string,
): boolean {
  const explicit = user?.automationLines?.[id]
  return explicit === undefined ? personalAutomationDefaultEnabled(id) : explicit
}

/**
 * Whether the vitals questions run: the master switch and the feature switch
 * both on, and the clinician has not turned them off for themselves.
 */
export function vitalQuestionsEnabled(
  settings: IntraopAutomationSettings | null | undefined,
  user?: UserAutomationSwitches | null,
): boolean {
  return !!settings?.enabled && !!settings.vitalQuestions.enabled && user?.vitalQuestions !== false
}

/** Whether one vital question remains enabled after the hospital, group and clinician switches. */
export function vitalQuestionAutomationEnabled(
  settings: IntraopAutomationSettings | null | undefined,
  user: UserAutomationSwitches | null | undefined,
  kind: VitalQuestionKind,
): boolean {
  return vitalQuestionsEnabled(settings, user)
    && !settings?.disabled?.includes(vitalQuestionAutomationId(kind))
    && personalAutomationEnabled(user, vitalQuestionAutomationId(kind))
}

/** Whether a group runs for this clinician: on in Status, and not turned off by them. */
export function automationGroupEnabled(
  settings: IntraopAutomationSettings | null | undefined,
  group: AutomationGroup,
  user?: UserAutomationSwitches | null,
): boolean {
  return !!settings?.enabled && !!settings.groups?.[group] && user?.[group] !== false
}

/**
 * Whether one automation runs for this clinician: its group is on in Status
 * and for them, and Status has not switched this line off (10.2.0).
 */
export function automationEnabled(
  settings: IntraopAutomationSettings | null | undefined,
  group: AutomationGroup,
  id: string,
  user?: UserAutomationSwitches | null,
): boolean {
  return automationGroupEnabled(settings, group, user)
    && !settings?.disabled?.includes(id)
    && personalAutomationEnabled(user, id)
}
