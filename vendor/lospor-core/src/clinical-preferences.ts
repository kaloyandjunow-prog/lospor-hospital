import {
  normalizeAutoFillVitalsPreferences,
  type AutoFillVitalsPreferences,
} from "./intraop-vitals"
import {
  BULGARIAN_NAME_SWITCH_KEYS,
  NO_BULGARIAN_NAMES,
  type BulgarianNameSwitches,
} from "./display/bulgarian-names"
import { USER_AUTOMATION_SWITCHES, type UserAutomationSwitches } from "./intraop-automation"

export const CLINICAL_PREFERENCES_VERSION = 1
export const MAX_INTRAOP_FAVOURITES = 8

export type ClinicalUnits = {
  height: "cm" | "in"
  weight: "kg" | "lb"
  temperature: "C" | "F"
  etco2: "mmHg" | "kPa"
  /**
   * Entry unit for central venous pressure. Display only -- the value is
   * always stored and exported in mmHg, so changing this re-renders existing
   * cases rather than altering them.
   */
  cvp: "cmH2O" | "mmHg"
}

export type DefaultMonitoring = "standard" | "advanced"

/** The three designs of the shock energy knob (10.2.0, Settings → UI). */
export const ENERGY_KNOB_SKINS = ["A", "B", "C"] as const
export type EnergyKnobSkin = typeof ENERGY_KNOB_SKINS[number]

/** The Airway tab a clinician sees: Smart selection or the tab as it was (10.2.0). */
export type AirwayScreen = "smart" | "legacy"

/** The Vascular access tab a clinician sees: Smart selection or the tab as it was (10.2.0). */
export type VascularScreen = "smart" | "legacy"
export type MonitoringScreen = "smart" | "legacy"
export type EquipmentScreen = "smart" | "legacy"
export type TechniqueScreen = "smart" | "legacy"
export type EventsScreen = "smart" | "legacy"
/** The Fluid status tab: the hybrid summary or the tab as it was. */
export type FluidsScreen = "smart" | "legacy"
/** The intraoperative Event log: Timeline stream or the log as it was. */
export type EventLogScreen = "smart" | "legacy"
export type CaseScreenLayout = "tabs" | "scroll"
export type CaseLayoutPreferences = {
  /** The web/tablet sidebar overrides the per-stage layout when enabled. */
  sidebar: boolean
  preop: CaseScreenLayout
  intraop: CaseScreenLayout
  postop: CaseScreenLayout
}
export type TimetableLayout = "expand" | "scroll"
export type ClinicalPreferences = {
  clinicalPreferencesVersion: typeof CLINICAL_PREFERENCES_VERSION
  units: ClinicalUnits
  defaultMonitoring: DefaultMonitoring
  autoFillVitals: AutoFillVitalsPreferences
  intraopFavouriteDrugs: string[]
  intraopFavouriteInfusions: string[]
  /** Which catalogues a Bulgarian reader sees in Bulgarian (Settings → UI). Display only. */
  bulgarianNames: BulgarianNameSwitches
  /**
   * After a yes to a question from the vitals, keep logging the complication
   * while the readings stay out of range (10.1.0). Off: every out-of-range
   * reading asks again. On by default.
   */
  vitalEpisodeAutoLog: boolean
  /**
   * The automation groups this clinician turned off for themselves (10.2.0).
   * Only false is stored: a group the hospital has on runs unless switched off
   * here, and one the hospital has off never runs.
   */
  automationGroups: UserAutomationSwitches
  /** Explicit per-automation overrides for this clinician. Absent means the
   * shared personal default for that line (prebundled on, context links off). */
  automationLines: Record<string, boolean>
  /** The shock energy knob design this clinician picked (10.2.0): A defibrillator knob, B metal knob, C selector. */
  energyKnobSkin: EnergyKnobSkin
  /**
   * Which Airway tab this clinician sees (10.2.0): "smart" opens on what is in
   * place and adds a device in one panel; "legacy" is the tab as it was.
   */
  airwayScreen: AirwayScreen
  /** Which Vascular access tab this clinician sees (10.2.0): "smart" opens on what is in place; "legacy" is the tab as it was. */
  vascularScreen: VascularScreen
  monitoringScreen: MonitoringScreen
  equipmentScreen: EquipmentScreen
  techniqueScreen: TechniqueScreen
  eventsScreen: EventsScreen
  fluidsScreen: FluidsScreen
  eventLogScreen: EventLogScreen
  /** Account-wide case shell layout shared by web and mobile. */
  caseLayout: CaseLayoutPreferences
  /** Account-wide layout for intraoperative timeline rows. */
  timetableLayout: TimetableLayout
  /** Whether the intraoperative vitals chart opens expanded. */
  vitalsChartExpanded: boolean
}

export type ClinicalPreferencesPatch = {
  clinicalPreferencesVersion?: number
  units?: Partial<ClinicalUnits>
  defaultMonitoring?: DefaultMonitoring
  autoFillVitals?: Partial<AutoFillVitalsPreferences>
  intraopFavouriteDrugs?: string[]
  intraopFavouriteInfusions?: string[]
  bulgarianNames?: Partial<BulgarianNameSwitches>
  vitalEpisodeAutoLog?: boolean
  automationGroups?: UserAutomationSwitches
  automationLines?: Record<string, boolean>
  energyKnobSkin?: EnergyKnobSkin
  airwayScreen?: AirwayScreen
  vascularScreen?: VascularScreen
  monitoringScreen?: MonitoringScreen
  equipmentScreen?: EquipmentScreen
  techniqueScreen?: TechniqueScreen
  eventsScreen?: EventsScreen
  fluidsScreen?: FluidsScreen
  eventLogScreen?: EventLogScreen
  caseLayout?: Partial<CaseLayoutPreferences>
  timetableLayout?: TimetableLayout
  vitalsChartExpanded?: boolean
}

export const DEFAULT_CLINICAL_PREFERENCES: ClinicalPreferences = {
  clinicalPreferencesVersion: CLINICAL_PREFERENCES_VERSION,
  units: {
    height: "cm",
    weight: "kg",
    temperature: "C",
    etco2: "mmHg",
    // cmH2O by default: it is what the transducers in this setting are scaled
    // in, so it is what a clinician reads off the monitor.
    cvp: "cmH2O",
  },
  defaultMonitoring: "standard",
  autoFillVitals: normalizeAutoFillVitalsPreferences({}),
  intraopFavouriteDrugs: [],
  intraopFavouriteInfusions: [],
  bulgarianNames: { ...NO_BULGARIAN_NAMES },
  vitalEpisodeAutoLog: true,
  automationGroups: {},
  automationLines: {},
  energyKnobSkin: "A",
  airwayScreen: "smart",
  vascularScreen: "smart",
  monitoringScreen: "smart",
  equipmentScreen: "smart",
  techniqueScreen: "smart",
  eventsScreen: "smart",
  fluidsScreen: "smart",
  eventLogScreen: "smart",
  caseLayout: {
    sidebar: true,
    preop: "scroll",
    intraop: "scroll",
    postop: "scroll",
  },
  timetableLayout: "expand",
  vitalsChartExpanded: true,
}

function record(value: unknown): Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function favourites(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  return [...new Set(
    value
      .filter((item): item is string => typeof item === "string")
      .map(item => item.trim())
      .filter(Boolean),
  )].slice(0, MAX_INTRAOP_FAVOURITES)
}

function automationLines(value: unknown): Record<string, boolean> | undefined {
  const input = record(value)
  const entries = Object.entries(input).filter(([id, on]) =>
    typeof id === "string" && id.length > 0 && id.length <= 160 && typeof on === "boolean",
  )
  if (entries.length === 0) return undefined
  return Object.fromEntries(entries.slice(0, 500)) as Record<string, boolean>
}

export function parseClinicalPreferencesPatch(value: unknown): ClinicalPreferencesPatch {
  const input = record(value)
  const unitsInput = record(input.units)
  const autoFillInput = record(input.autoFillVitals)
  const patch: ClinicalPreferencesPatch = {}
  const units: Partial<ClinicalUnits> = {}

  const height = unitsInput.height ?? input.heightUnit
  if (height === "cm" || height === "in") units.height = height
  const weight = unitsInput.weight ?? input.weightUnit
  if (weight === "kg" || weight === "lb") units.weight = weight
  const temperature = unitsInput.temperature ?? input.temperatureUnit
  if (temperature === "C" || temperature === "F") units.temperature = temperature
  const etco2 = unitsInput.etco2 ?? input.etco2Unit
  if (etco2 === "mmHg" || etco2 === "kPa") units.etco2 = etco2
  const cvp = unitsInput.cvp ?? input.cvpUnit
  if (cvp === "cmH2O" || cvp === "mmHg") units.cvp = cvp
  if (Object.keys(units).length) patch.units = units

  const monitoring = input.defaultMonitoring
  if (monitoring === "standard" || monitoring === "advanced") {
    patch.defaultMonitoring = monitoring
  }

  const enabled = autoFillInput.enabled ?? input.autoFillVitals
  const includeBloodPressure = autoFillInput.includeBloodPressure ?? input.autoFillBP
  const backfillOnReopen = autoFillInput.backfillOnReopen ?? input.autoFillBackground ?? input.autoFillBg
  if (
    typeof enabled === "boolean"
    || typeof includeBloodPressure === "boolean"
    || typeof backfillOnReopen === "boolean"
  ) {
    patch.autoFillVitals = {
      ...(typeof enabled === "boolean" ? { enabled } : {}),
      ...(typeof includeBloodPressure === "boolean" ? { includeBloodPressure } : {}),
      ...(typeof backfillOnReopen === "boolean" ? { backfillOnReopen } : {}),
    }
  }

  const drugs = favourites(input.intraopFavouriteDrugs)
  if (drugs) patch.intraopFavouriteDrugs = drugs
  const infusions = favourites(input.intraopFavouriteInfusions)
  if (infusions) patch.intraopFavouriteInfusions = infusions

  const namesInput = record(input.bulgarianNames)
  const names: Partial<BulgarianNameSwitches> = {}
  for (const key of BULGARIAN_NAME_SWITCH_KEYS) {
    if (typeof namesInput[key] === "boolean") names[key] = namesInput[key]
  }
  if (Object.keys(names).length) patch.bulgarianNames = names
  if (typeof input.vitalEpisodeAutoLog === "boolean") patch.vitalEpisodeAutoLog = input.vitalEpisodeAutoLog
  const groupsInput = record(input.automationGroups)
  const groups: UserAutomationSwitches = {}
  for (const key of USER_AUTOMATION_SWITCHES) {
    if (typeof groupsInput[key] === "boolean") groups[key] = groupsInput[key]
  }
  if (Object.keys(groups).length) patch.automationGroups = groups
  const lines = automationLines(input.automationLines)
  if (lines) patch.automationLines = lines
  const skin = input.energyKnobSkin
  if (skin === "A" || skin === "B" || skin === "C") patch.energyKnobSkin = skin
  if (input.airwayScreen === "smart" || input.airwayScreen === "legacy") patch.airwayScreen = input.airwayScreen
  if (input.vascularScreen === "smart" || input.vascularScreen === "legacy") patch.vascularScreen = input.vascularScreen
  if (input.monitoringScreen === "smart" || input.monitoringScreen === "legacy") patch.monitoringScreen = input.monitoringScreen
  if (input.equipmentScreen === "smart" || input.equipmentScreen === "legacy") patch.equipmentScreen = input.equipmentScreen
  if (input.techniqueScreen === "smart" || input.techniqueScreen === "legacy") patch.techniqueScreen = input.techniqueScreen
  if (input.eventsScreen === "smart" || input.eventsScreen === "legacy") patch.eventsScreen = input.eventsScreen
  if (input.fluidsScreen === "smart" || input.fluidsScreen === "legacy") patch.fluidsScreen = input.fluidsScreen
  if (input.eventLogScreen === "smart" || input.eventLogScreen === "legacy") patch.eventLogScreen = input.eventLogScreen
  const caseLayoutInput = record(input.caseLayout)
  const caseLayout: Partial<CaseLayoutPreferences> = {}
  if (typeof caseLayoutInput.sidebar === "boolean") caseLayout.sidebar = caseLayoutInput.sidebar
  for (const screen of ["preop", "intraop", "postop"] as const) {
    if (caseLayoutInput[screen] === "tabs" || caseLayoutInput[screen] === "scroll") {
      caseLayout[screen] = caseLayoutInput[screen]
    }
  }
  if (Object.keys(caseLayout).length) patch.caseLayout = caseLayout
  if (input.timetableLayout === "expand" || input.timetableLayout === "scroll") {
    patch.timetableLayout = input.timetableLayout
  }
  if (typeof input.vitalsChartExpanded === "boolean") {
    patch.vitalsChartExpanded = input.vitalsChartExpanded
  }
  return patch
}

export function normalizeClinicalPreferences(value: unknown): ClinicalPreferences {
  const patch = parseClinicalPreferencesPatch(value)
  return {
    clinicalPreferencesVersion: CLINICAL_PREFERENCES_VERSION,
    units: { ...DEFAULT_CLINICAL_PREFERENCES.units, ...patch.units },
    defaultMonitoring: patch.defaultMonitoring ?? DEFAULT_CLINICAL_PREFERENCES.defaultMonitoring,
    autoFillVitals: normalizeAutoFillVitalsPreferences({
      ...DEFAULT_CLINICAL_PREFERENCES.autoFillVitals,
      ...patch.autoFillVitals,
    }),
    intraopFavouriteDrugs: patch.intraopFavouriteDrugs ?? [],
    intraopFavouriteInfusions: patch.intraopFavouriteInfusions ?? [],
    bulgarianNames: { ...NO_BULGARIAN_NAMES, ...patch.bulgarianNames },
    vitalEpisodeAutoLog: patch.vitalEpisodeAutoLog ?? DEFAULT_CLINICAL_PREFERENCES.vitalEpisodeAutoLog,
    // Only the groups switched off are kept; on is the default and needs no entry.
    automationGroups: Object.fromEntries(Object.entries(patch.automationGroups ?? {}).filter(([, on]) => on === false)) as UserAutomationSwitches,
    automationLines: patch.automationLines ?? {},
    energyKnobSkin: patch.energyKnobSkin ?? DEFAULT_CLINICAL_PREFERENCES.energyKnobSkin,
    airwayScreen: patch.airwayScreen ?? DEFAULT_CLINICAL_PREFERENCES.airwayScreen,
    vascularScreen: patch.vascularScreen ?? DEFAULT_CLINICAL_PREFERENCES.vascularScreen,
    monitoringScreen: patch.monitoringScreen ?? DEFAULT_CLINICAL_PREFERENCES.monitoringScreen,
    equipmentScreen: patch.equipmentScreen ?? DEFAULT_CLINICAL_PREFERENCES.equipmentScreen,
    techniqueScreen: patch.techniqueScreen ?? DEFAULT_CLINICAL_PREFERENCES.techniqueScreen,
    eventsScreen: patch.eventsScreen ?? DEFAULT_CLINICAL_PREFERENCES.eventsScreen,
    fluidsScreen: patch.fluidsScreen ?? DEFAULT_CLINICAL_PREFERENCES.fluidsScreen,
    eventLogScreen: patch.eventLogScreen ?? DEFAULT_CLINICAL_PREFERENCES.eventLogScreen,
    caseLayout: { ...DEFAULT_CLINICAL_PREFERENCES.caseLayout, ...patch.caseLayout },
    timetableLayout: patch.timetableLayout ?? DEFAULT_CLINICAL_PREFERENCES.timetableLayout,
    vitalsChartExpanded: patch.vitalsChartExpanded ?? DEFAULT_CLINICAL_PREFERENCES.vitalsChartExpanded,
  }
}

// Server values win. Device values only fill fields that have never been
// stored on the account, allowing a one-time import of existing local choices.
export function mergeClinicalPreferences(
  serverValue: unknown,
  deviceValue: unknown,
): ClinicalPreferences {
  const server = parseClinicalPreferencesPatch(serverValue)
  const device = parseClinicalPreferencesPatch(deviceValue)
  return normalizeClinicalPreferences({
    units: { ...device.units, ...server.units },
    defaultMonitoring: server.defaultMonitoring ?? device.defaultMonitoring,
    autoFillVitals: { ...device.autoFillVitals, ...server.autoFillVitals },
    intraopFavouriteDrugs:
      server.intraopFavouriteDrugs ?? device.intraopFavouriteDrugs,
    intraopFavouriteInfusions:
      server.intraopFavouriteInfusions ?? device.intraopFavouriteInfusions,
    bulgarianNames: { ...device.bulgarianNames, ...server.bulgarianNames },
    vitalEpisodeAutoLog: server.vitalEpisodeAutoLog ?? device.vitalEpisodeAutoLog,
    automationGroups: { ...device.automationGroups, ...server.automationGroups },
    automationLines: { ...device.automationLines, ...server.automationLines },
    energyKnobSkin: server.energyKnobSkin ?? device.energyKnobSkin,
    airwayScreen: server.airwayScreen ?? device.airwayScreen,
    vascularScreen: server.vascularScreen ?? device.vascularScreen,
    monitoringScreen: server.monitoringScreen ?? device.monitoringScreen,
    equipmentScreen: server.equipmentScreen ?? device.equipmentScreen,
    techniqueScreen: server.techniqueScreen ?? device.techniqueScreen,
    eventsScreen: server.eventsScreen ?? device.eventsScreen,
    fluidsScreen: server.fluidsScreen ?? device.fluidsScreen,
    eventLogScreen: server.eventLogScreen ?? device.eventLogScreen,
    caseLayout: { ...device.caseLayout, ...server.caseLayout },
    timetableLayout: server.timetableLayout ?? device.timetableLayout,
    vitalsChartExpanded: server.vitalsChartExpanded ?? device.vitalsChartExpanded,
  })
}

export function applyClinicalPreferencesPatch(
  currentValue: unknown,
  patchValue: unknown,
): ClinicalPreferences {
  const current = normalizeClinicalPreferences(currentValue)
  const patch = parseClinicalPreferencesPatch(patchValue)
  return normalizeClinicalPreferences({
    ...current,
    ...patch,
    units: { ...current.units, ...patch.units },
    autoFillVitals: { ...current.autoFillVitals, ...patch.autoFillVitals },
    bulgarianNames: { ...current.bulgarianNames, ...patch.bulgarianNames },
    automationGroups: { ...current.automationGroups, ...patch.automationGroups },
    automationLines: { ...current.automationLines, ...patch.automationLines },
    caseLayout: { ...current.caseLayout, ...patch.caseLayout },
  })
}

export function combineClinicalPreferencesPatches(
  ...values: unknown[]
): ClinicalPreferencesPatch {
  const combined: ClinicalPreferencesPatch = {}
  for (const value of values) {
    const patch = parseClinicalPreferencesPatch(value)
    if (patch.units) {
      combined.units = { ...combined.units, ...patch.units }
    }
    if (patch.defaultMonitoring) {
      combined.defaultMonitoring = patch.defaultMonitoring
    }
    if (patch.autoFillVitals) {
      combined.autoFillVitals = {
        ...combined.autoFillVitals,
        ...patch.autoFillVitals,
      }
    }
    if (patch.intraopFavouriteDrugs !== undefined) {
      combined.intraopFavouriteDrugs = patch.intraopFavouriteDrugs
    }
    if (patch.intraopFavouriteInfusions !== undefined) {
      combined.intraopFavouriteInfusions = patch.intraopFavouriteInfusions
    }
    if (patch.bulgarianNames) {
      combined.bulgarianNames = { ...combined.bulgarianNames, ...patch.bulgarianNames }
    }
    if (patch.vitalEpisodeAutoLog !== undefined) {
      combined.vitalEpisodeAutoLog = patch.vitalEpisodeAutoLog
    }
    if (patch.automationGroups) {
      combined.automationGroups = { ...combined.automationGroups, ...patch.automationGroups }
    }
    if (patch.automationLines) {
      combined.automationLines = { ...combined.automationLines, ...patch.automationLines }
    }
    if (patch.energyKnobSkin) {
      combined.energyKnobSkin = patch.energyKnobSkin
    }
    if (patch.airwayScreen) {
      combined.airwayScreen = patch.airwayScreen
    }
    if (patch.vascularScreen) {
      combined.vascularScreen = patch.vascularScreen
    }
    if (patch.monitoringScreen) {
      combined.monitoringScreen = patch.monitoringScreen
    }
    if (patch.equipmentScreen) {
      combined.equipmentScreen = patch.equipmentScreen
    }
    if (patch.techniqueScreen) {
      combined.techniqueScreen = patch.techniqueScreen
    }
    if (patch.eventsScreen) {
      combined.eventsScreen = patch.eventsScreen
    }
    if (patch.fluidsScreen) {
      combined.fluidsScreen = patch.fluidsScreen
    }
    if (patch.eventLogScreen) {
      combined.eventLogScreen = patch.eventLogScreen
    }
    if (patch.caseLayout) {
      combined.caseLayout = { ...combined.caseLayout, ...patch.caseLayout }
    }
    if (patch.timetableLayout) {
      combined.timetableLayout = patch.timetableLayout
    }
    if (patch.vitalsChartExpanded !== undefined) {
      combined.vitalsChartExpanded = patch.vitalsChartExpanded
    }
  }
  return combined
}
