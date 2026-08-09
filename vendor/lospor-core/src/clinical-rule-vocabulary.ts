import type {
  DoseCalc,
  DoseProfile,
  RouteMode,
  WeightBasis,
} from "./catalog/dose-profile"

export const ADMINISTRATION_ROUTE_CODES = [
  "IV",
  "IM",
  "SC",
  "PO",
  "SL",
  "IN",
  "PR",
  "INHALATION",
  "TOPICAL",
  "TRANSDERMAL",
  "INFILTRATION",
  "PERINEURAL",
  "EPIDURAL",
  "INTRATHECAL",
  "INTRAOSSEOUS",
  "ENDOTRACHEAL",
] as const

export type AdministrationRouteCode = typeof ADMINISTRATION_ROUTE_CODES[number]

export const ADMINISTRATION_ROUTES: ReadonlyArray<{
  code: AdministrationRouteCode
  labelEn: string
  labelBg: string
}> = [
  { code: "IV", labelEn: "Intravenous", labelBg: "Интравенозно" },
  { code: "IM", labelEn: "Intramuscular", labelBg: "Интрамускулно" },
  { code: "SC", labelEn: "Subcutaneous", labelBg: "Подкожно" },
  { code: "PO", labelEn: "Oral", labelBg: "Перорално" },
  { code: "SL", labelEn: "Sublingual", labelBg: "Сублингвално" },
  { code: "IN", labelEn: "Intranasal", labelBg: "Интраназално" },
  { code: "PR", labelEn: "Rectal", labelBg: "Ректално" },
  { code: "INHALATION", labelEn: "Inhalation", labelBg: "Инхалаторно" },
  { code: "TOPICAL", labelEn: "Topical", labelBg: "Локално" },
  { code: "TRANSDERMAL", labelEn: "Transdermal", labelBg: "Трансдермално" },
  { code: "INFILTRATION", labelEn: "Infiltration", labelBg: "Инфилтрация" },
  { code: "PERINEURAL", labelEn: "Perineural", labelBg: "Периневрално" },
  { code: "EPIDURAL", labelEn: "Epidural", labelBg: "Епидурално" },
  { code: "INTRATHECAL", labelEn: "Intrathecal", labelBg: "Интратекално" },
  { code: "INTRAOSSEOUS", labelEn: "Intraosseous", labelBg: "Интраосално" },
  { code: "ENDOTRACHEAL", labelEn: "Endotracheal", labelBg: "Ендотрахеално" },
]

const ROUTE_ALIASES: Readonly<Record<string, AdministrationRouteCode | null>> = {
  IV: "IV",
  INTRAVENOUS: "IV",
  IM: "IM",
  INTRAMUSCULAR: "IM",
  SC: "SC",
  SUBCUTANEOUS: "SC",
  PO: "PO",
  ORAL: "PO",
  IN: "IN",
  INTRANASAL: "IN",
  PR: "PR",
  RECTAL: "PR",
  INHALATION: "INHALATION",
  INHALED: "INHALATION",
  TOPICAL: "TOPICAL",
  TRANSDERMAL: "TRANSDERMAL",
  INFILTRATION: "INFILTRATION",
  "LOCAL INFILTRATION": "INFILTRATION",
  PERINEURAL: "PERINEURAL",
  "PERIPHERAL NERVE BLOCK": "PERINEURAL",
  EPIDURAL: "EPIDURAL",
  PD: "EPIDURAL",
  INTRATHECAL: "INTRATHECAL",
  IT: "INTRATHECAL",
  INTRAOSSEOUS: "INTRAOSSEOUS",
  IO: "INTRAOSSEOUS",
  ENDOTRACHEAL: "ENDOTRACHEAL",
  ET: "ENDOTRACHEAL",
  SL: "SL",
  SUBLINGUAL: "SL",
}

export function normalizeAdministrationRoute(
  value: string,
): AdministrationRouteCode | null {
  return ROUTE_ALIASES[value.trim().toUpperCase()] ?? null
}

export function administrationRouteLabel(
  code: AdministrationRouteCode,
  locale: "en" | "bg",
): string {
  const route = ADMINISTRATION_ROUTES.find(item => item.code === code)
  return route?.[locale === "bg" ? "labelBg" : "labelEn"] ?? code
}

export const DOSE_AMOUNT_UNITS = [
  "NG",
  "MCG",
  "MG",
  "G",
  "IU",
  "MMOL",
  "MEQ",
  "ML",
] as const
export type DoseAmountUnit = typeof DOSE_AMOUNT_UNITS[number]

export const DOSE_BODY_BASES = ["NONE", "TBW", "IBW", "BSA_M2"] as const
export type DoseBodyBasis = typeof DOSE_BODY_BASES[number]

export const DOSE_TIME_BASES = ["NONE", "MINUTE", "HOUR"] as const
export type DoseTimeBasis = typeof DOSE_TIME_BASES[number]

export const CONCENTRATION_UNITS = [
  "PERCENT",
  "MCG_PER_ML",
  "MG_PER_ML",
  "IU_PER_ML",
  "MMOL_PER_ML",
  "MEQ_PER_ML",
] as const
export type ConcentrationUnit = typeof CONCENTRATION_UNITS[number]

const AMOUNT_DISPLAY: Readonly<Record<DoseAmountUnit, string>> = {
  NG: "ng",
  MCG: "mcg",
  MG: "mg",
  G: "g",
  IU: "IU",
  MMOL: "mmol",
  MEQ: "mEq",
  ML: "mL",
}

const AMOUNT_UCUM: Readonly<Record<DoseAmountUnit, string>> = {
  NG: "ng",
  MCG: "ug",
  MG: "mg",
  G: "g",
  IU: "[IU]",
  MMOL: "mmol",
  MEQ: "meq",
  ML: "mL",
}

export type CanonicalDoseUnit = {
  amount: DoseAmountUnit
  bodyBasis: DoseBodyBasis
  timeBasis: DoseTimeBasis
  display: string
  ucumCode: string
}

export type CanonicalConcentrationUnit = {
  kind: ConcentrationUnit
  display: string
  ucumCode: string
}

const CONCENTRATION_BY_DISPLAY: Readonly<Record<string, CanonicalConcentrationUnit>> = {
  "%": { kind: "PERCENT", display: "%", ucumCode: "%" },
  "PERCENT": { kind: "PERCENT", display: "%", ucumCode: "%" },
  "MCG/ML": { kind: "MCG_PER_ML", display: "mcg/mL", ucumCode: "ug/mL" },
  "MCG_PER_ML": { kind: "MCG_PER_ML", display: "mcg/mL", ucumCode: "ug/mL" },
  "MG/ML": { kind: "MG_PER_ML", display: "mg/mL", ucumCode: "mg/mL" },
  "MG_PER_ML": { kind: "MG_PER_ML", display: "mg/mL", ucumCode: "mg/mL" },
  "IU/ML": { kind: "IU_PER_ML", display: "IU/mL", ucumCode: "[IU]/mL" },
  "IU_PER_ML": { kind: "IU_PER_ML", display: "IU/mL", ucumCode: "[IU]/mL" },
  "MMOL/ML": { kind: "MMOL_PER_ML", display: "mmol/mL", ucumCode: "mmol/mL" },
  "MMOL_PER_ML": { kind: "MMOL_PER_ML", display: "mmol/mL", ucumCode: "mmol/mL" },
  "MEQ/ML": { kind: "MEQ_PER_ML", display: "mEq/mL", ucumCode: "meq/mL" },
  "MEQ_PER_ML": { kind: "MEQ_PER_ML", display: "mEq/mL", ucumCode: "meq/mL" },
}

function amountUnit(value: string): DoseAmountUnit | null {
  const normalized = value.trim().toUpperCase()
  if (normalized === "NG") return "NG"
  if (normalized === "MCG" || normalized === "UG" || normalized === "ΜG") return "MCG"
  if (normalized === "MG") return "MG"
  if (normalized === "G") return "G"
  if (normalized === "IU" || normalized === "[IU]") return "IU"
  if (normalized === "MMOL") return "MMOL"
  if (normalized === "MEQ") return "MEQ"
  if (normalized === "ML") return "ML"
  return null
}

export function canonicalDoseUnit(
  displayUnit: string,
  calculationBasis: WeightBasis = "none",
): CanonicalDoseUnit | null {
  const parts = displayUnit.trim().replace(/\s+/g, "").split("/")
  const amount = amountUnit(parts[0] ?? "")
  if (!amount) return null

  let bodyBasis: DoseBodyBasis = "NONE"
  let timeBasis: DoseTimeBasis = "NONE"
  for (const part of parts.slice(1)) {
    const normalized = part.toLowerCase()
    if (normalized === "kg") {
      bodyBasis = calculationBasis === "IBW" ? "IBW" : "TBW"
    } else if (normalized === "m2" || normalized === "m^2") {
      bodyBasis = "BSA_M2"
    } else if (normalized === "min") {
      timeBasis = "MINUTE"
    } else if (normalized === "hr" || normalized === "h") {
      timeBasis = "HOUR"
    } else {
      return null
    }
  }

  const displayDenominators = [
    bodyBasis === "NONE" ? null : bodyBasis === "BSA_M2" ? "m2" : "kg",
    timeBasis === "NONE" ? null : timeBasis === "MINUTE" ? "min" : "hr",
  ].filter((item): item is string => !!item)
  const ucumDenominators = [
    bodyBasis === "NONE" ? null : bodyBasis === "BSA_M2" ? "m2" : "kg",
    timeBasis === "NONE" ? null : timeBasis === "MINUTE" ? "min" : "h",
  ].filter((item): item is string => !!item)

  const display = [AMOUNT_DISPLAY[amount], ...displayDenominators].join("/")
  const ucumCode = ucumDenominators.length
    ? `${AMOUNT_UCUM[amount]}/(${ucumDenominators.join(".")})`
    : AMOUNT_UCUM[amount]
  return { amount, bodyBasis, timeBasis, display, ucumCode }
}

export function canonicalConcentrationUnit(
  value: string,
): CanonicalConcentrationUnit | null {
  return CONCENTRATION_BY_DISPLAY[value.trim().toUpperCase()] ?? null
}

function canonicalDoseCalc(calc: DoseCalc | undefined): DoseCalc | undefined {
  return calc ? { ...calc } : undefined
}

function canonicalRouteMode(mode: RouteMode): RouteMode {
  return {
    ...mode,
    quickValues: [...mode.quickValues],
    variableStep: mode.variableStep?.map(item => ({ ...item })),
    doseCalc: canonicalDoseCalc(mode.doseCalc),
    concentrationOptions: mode.concentrationOptions
      ? [...mode.concentrationOptions]
      : undefined,
    formulationOptions: mode.formulationOptions
      ? [...mode.formulationOptions]
      : undefined,
    prepStrength: mode.prepStrength ? { ...mode.prepStrength } : undefined,
  }
}

function canonicalRouteRecord<T>(
  record: Record<string, T> | undefined,
  clone: (value: T) => T,
): Record<string, T> | undefined {
  if (!record) return undefined
  return Object.fromEntries(
    Object.entries(record).flatMap(([route, value]) => {
      const canonical = normalizeAdministrationRoute(route)
      return canonical ? [[canonical, clone(value)]] : []
    }),
  )
}

export function canonicalizeDoseProfile(profile: DoseProfile): DoseProfile {
  const routes = [...new Set(profile.routes.flatMap(route => {
    const canonical = normalizeAdministrationRoute(route)
    return canonical ? [canonical] : []
  }))]
  const defaultRoute = profile.defaultRoute
    ? normalizeAdministrationRoute(profile.defaultRoute)
    : null
  return {
    ...profile,
    routes: routes.length ? routes : ["IV"],
    defaultRoute: defaultRoute && routes.includes(defaultRoute)
      ? defaultRoute
      : routes[0] ?? "IV",
    quickValues: [...profile.quickValues],
    variableStep: profile.variableStep?.map(item => ({ ...item })),
    concentrationOptions: profile.concentrationOptions
      ? [...profile.concentrationOptions]
      : undefined,
    formulationOptions: profile.formulationOptions
      ? [...profile.formulationOptions]
      : undefined,
    doseCalc: canonicalDoseCalc(profile.doseCalc),
    prepStrength: profile.prepStrength ? { ...profile.prepStrength } : undefined,
    fluidEntryModes: profile.fluidEntryModes
      ? [...profile.fluidEntryModes]
      : undefined,
    fluidRate: profile.fluidRate ? { ...profile.fluidRate } : undefined,
    suggestedVolumeByRoute: canonicalRouteRecord(
      profile.suggestedVolumeByRoute,
      value => value,
    ),
    doseCalcByRoute: canonicalRouteRecord(
      profile.doseCalcByRoute,
      value => ({ ...value }),
    ),
    routeModes: canonicalRouteRecord(profile.routeModes, canonicalRouteMode),
  }
}

export type CanonicalDoseProfileMetadata = {
  profile: DoseProfile
  unit: CanonicalDoseUnit | null
  routeUnits: Record<string, CanonicalDoseUnit | null>
}

export function canonicalDoseProfileMetadata(
  profile: DoseProfile,
): CanonicalDoseProfileMetadata {
  const canonical = canonicalizeDoseProfile(profile)
  return {
    profile: canonical,
    unit: canonical.unit
      ? canonicalDoseUnit(canonical.unit, canonical.weightBasis)
      : null,
    routeUnits: Object.fromEntries(
      Object.entries(canonical.routeModes ?? {}).map(([route, mode]) => [
        route,
        canonicalDoseUnit(mode.unit, mode.weightBasis),
      ]),
    ),
  }
}
