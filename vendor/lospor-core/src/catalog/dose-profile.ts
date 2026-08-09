import {
  FLUID_ENTRY_MODES,
  FLUID_RATE_CALCULATIONS,
  type FluidEntryMode,
  type FluidEntryModeProfile,
  type FluidRateSliderProfile,
} from "../intraop-fluids"

export const DOSE_KIND = ["bolus", "infusion", "fluid", "agent"] as const
export type DoseKind = (typeof DOSE_KIND)[number]

export const ROUNDING = ["nearest_step", "floor_step", "ceil_step"] as const
export type Rounding = (typeof ROUNDING)[number]

export const WEIGHT_BASIS = ["TBW", "IBW", "BSA_M2", "none"] as const
export type WeightBasis = (typeof WEIGHT_BASIS)[number]

export const LOCAL_ANAESTHETIC_FORMULATIONS = [
  "HYPOBARIC",
  "ISOBARIC",
  "HYPERBARIC",
] as const
export type LocalAnaestheticFormulation = typeof LOCAL_ANAESTHETIC_FORMULATIONS[number]

export const DOSE_MODE = ["dose", "rate", "concentration", "concentration-rate"] as const
export type DoseModeKind = (typeof DOSE_MODE)[number]

export type DoseCalc = {
  perKg?: number
  perM2?: number
  flat?: number
  basis?: Exclude<WeightBasis, "none">
  roundTo?: number
  cap?: number
  capAtActualWeight?: boolean
}

export type VariableStep = {
  upTo: number
  step: number
}

export type PrepStrength = {
  mg: number
  mL: number
}

export type RouteMode = {
  mode: DoseModeKind
  min: number
  max: number
  step: number
  variableStep?: VariableStep[]
  quickValues: number[]
  unit: string
  weightBasis: WeightBasis
  doseCalc?: DoseCalc
  concentrationOptions?: string[]
  concentrationUnit?: string
  defaultConcentration?: string
  suggestedConcentration?: string
  formulationOptions?: LocalAnaestheticFormulation[]
  defaultFormulation?: LocalAnaestheticFormulation
  suggestedVolume?: number
  suggestedRate?: number
  prepStrength?: PrepStrength
}

export type RouteModeInput = Omit<RouteMode, "mode" | "quickValues" | "weightBasis"> & {
  mode?: DoseModeKind
  quickValues?: number[]
  weightBasis?: WeightBasis
}

export type DoseProfile = FluidEntryModeProfile & {
  kind: DoseKind
  mode: DoseModeKind
  min?: number
  max?: number
  step?: number
  variableStep?: VariableStep[]
  rounding: Rounding
  quickValues: number[]
  unit?: string
  routes: string[]
  defaultRoute?: string
  concentrationOptions?: string[]
  concentrationUnit?: string
  defaultConcentration?: string
  formulationOptions?: LocalAnaestheticFormulation[]
  defaultFormulation?: LocalAnaestheticFormulation
  weightBasis: WeightBasis
  hint?: string
  doseCalc?: DoseCalc
  suggestedConcentration?: string
  suggestedVolume?: number
  suggestedVolumeByRoute?: Record<string, number>
  suggestedRate?: number
  prepStrength?: PrepStrength
  doseCalcByRoute?: Record<string, DoseCalc>
  routeModes?: Record<string, RouteMode>
}

export type DoseProfileInput = Omit<
  DoseProfile,
  "kind" | "mode" | "rounding" | "quickValues" | "routes" | "defaultRoute" | "weightBasis" | "routeModes"
> & {
  mode?: DoseModeKind
  rounding?: Rounding
  quickValues?: number[]
  routes?: string[]
  defaultRoute?: string
  weightBasis?: WeightBasis
  routeModes?: Record<string, RouteModeInput>
}

function fail(name: string, kind: DoseKind, path: string, message: string): never {
  throw new Error(`Invalid dose profile for "${name}" (${kind}): ${path}: ${message}`)
}

function finiteNumber(
  value: unknown,
  name: string,
  kind: DoseKind,
  path: string,
  positive = false,
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    fail(name, kind, path, "must be a finite number")
  }
  if (positive && value <= 0) fail(name, kind, path, "must be greater than zero")
  return value
}

function optionalNumber(
  value: unknown,
  name: string,
  kind: DoseKind,
  path: string,
  positive = false,
): number | undefined {
  return value == null ? undefined : finiteNumber(value, name, kind, path, positive)
}

function stringArray(value: unknown, name: string, kind: DoseKind, path: string): string[] {
  if (!Array.isArray(value) || value.some(item => typeof item !== "string")) {
    fail(name, kind, path, "must be an array of strings")
  }
  return [...value]
}

function numberArray(value: unknown, name: string, kind: DoseKind, path: string): number[] {
  if (!Array.isArray(value)) fail(name, kind, path, "must be an array of numbers")
  return value.map((item, index) => finiteNumber(item, name, kind, `${path}.${index}`))
}

function formulationArray(
  value: unknown,
  name: string,
  kind: DoseKind,
  path: string,
): LocalAnaestheticFormulation[] {
  return stringArray(value, name, kind, path).map((item, index) => oneOf(
    item.trim().toUpperCase(),
    LOCAL_ANAESTHETIC_FORMULATIONS,
    name,
    kind,
    `${path}.${index}`,
  ))
}

function fluidEntryModeArray(
  value: unknown,
  name: string,
  kind: DoseKind,
  path: string,
): FluidEntryMode[] {
  const modes = stringArray(value, name, kind, path).map((item, index) => oneOf(
    item.trim().toUpperCase(),
    FLUID_ENTRY_MODES,
    name,
    kind,
    `${path}.${index}`,
  ))
  if (new Set(modes).size !== modes.length) fail(name, kind, path, "must not contain duplicates")
  if (!modes.length) fail(name, kind, path, "must not be empty")
  return modes
}

function optionalBoolean(
  value: unknown,
  name: string,
  kind: DoseKind,
  path: string,
): boolean | undefined {
  if (value == null) return undefined
  if (typeof value !== "boolean") fail(name, kind, path, "must be a boolean")
  return value
}

function oneOf<T extends string>(
  value: unknown,
  values: readonly T[],
  name: string,
  kind: DoseKind,
  path: string,
): T {
  if (typeof value !== "string" || !values.includes(value as T)) {
    fail(name, kind, path, `must be one of ${values.join(", ")}`)
  }
  return value as T
}

function parseVariableSteps(
  value: unknown,
  name: string,
  kind: DoseKind,
  path: string,
): VariableStep[] | undefined {
  if (value == null) return undefined
  if (!Array.isArray(value)) fail(name, kind, path, "must be an array")
  return value.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      fail(name, kind, `${path}.${index}`, "must be an object")
    }
    const record = item as Record<string, unknown>
    return {
      upTo: finiteNumber(record.upTo, name, kind, `${path}.${index}.upTo`),
      step: finiteNumber(record.step, name, kind, `${path}.${index}.step`, true),
    }
  })
}

function parseDoseCalc(
  value: unknown,
  name: string,
  kind: DoseKind,
  path: string,
): DoseCalc | undefined {
  if (value == null) return undefined
  if (typeof value !== "object" || Array.isArray(value)) fail(name, kind, path, "must be an object")
  const record = value as Record<string, unknown>
  const basis = record.basis == null
    ? undefined
    : oneOf(record.basis, ["IBW", "TBW", "BSA_M2"] as const, name, kind, `${path}.basis`)
  return {
    perKg: optionalNumber(record.perKg, name, kind, `${path}.perKg`),
    perM2: optionalNumber(record.perM2, name, kind, `${path}.perM2`),
    flat: optionalNumber(record.flat, name, kind, `${path}.flat`),
    basis,
    roundTo: optionalNumber(record.roundTo, name, kind, `${path}.roundTo`, true),
    cap: optionalNumber(record.cap, name, kind, `${path}.cap`, true),
    capAtActualWeight: optionalBoolean(
      record.capAtActualWeight,
      name,
      kind,
      `${path}.capAtActualWeight`,
    ) ?? (basis === "IBW" ? true : undefined),
  }
}

function parsePrepStrength(
  value: unknown,
  name: string,
  kind: DoseKind,
  path: string,
): PrepStrength | undefined {
  if (value == null) return undefined
  if (typeof value !== "object" || Array.isArray(value)) fail(name, kind, path, "must be an object")
  const record = value as Record<string, unknown>
  return {
    mg: finiteNumber(record.mg, name, kind, `${path}.mg`),
    mL: finiteNumber(record.mL, name, kind, `${path}.mL`, true),
  }
}

function parseFluidRate(
  value: unknown,
  name: string,
  kind: DoseKind,
  path: string,
): FluidRateSliderProfile | undefined {
  if (value == null) return undefined
  if (kind !== "fluid") fail(name, kind, path, "is only supported for fluid profiles")
  if (typeof value !== "object" || Array.isArray(value)) fail(name, kind, path, "must be an object")
  const record = value as Record<string, unknown>
  const min = finiteNumber(record.min, name, kind, `${path}.min`)
  const max = finiteNumber(record.max, name, kind, `${path}.max`)
  if (min < 0) fail(name, kind, `${path}.min`, "must not be negative")
  if (max <= min) fail(name, kind, `${path}.max`, "must be greater than min")
  return {
    min,
    max,
    step: finiteNumber(record.step, name, kind, `${path}.step`, true),
    allowManualOutsideRange: optionalBoolean(
      record.allowManualOutsideRange,
      name,
      kind,
      `${path}.allowManualOutsideRange`,
    ) ?? false,
    ...(record.calculation == null
      ? {}
      : {
          calculation: oneOf(
            record.calculation,
            FLUID_RATE_CALCULATIONS,
            name,
            kind,
            `${path}.calculation`,
          ),
        }),
  }
}

function parseRouteMode(
  value: unknown,
  name: string,
  kind: DoseKind,
  path: string,
): RouteMode {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail(name, kind, path, "must be an object")
  }
  const record = value as Record<string, unknown>
  const min = finiteNumber(record.min, name, kind, `${path}.min`)
  const max = finiteNumber(record.max, name, kind, `${path}.max`)
  if (max <= min) fail(name, kind, `${path}.max`, "must be greater than min")
  const unit = record.unit
  if (typeof unit !== "string" || !unit.trim()) fail(name, kind, `${path}.unit`, "must not be empty")
  const concentrationOptions = record.concentrationOptions == null
    ? undefined
    : stringArray(record.concentrationOptions, name, kind, `${path}.concentrationOptions`)
  const defaultConcentration = typeof record.defaultConcentration === "string"
    ? record.defaultConcentration
    : typeof record.suggestedConcentration === "string"
      ? record.suggestedConcentration
      : undefined
  if (
    defaultConcentration
    && concentrationOptions?.length
    && !concentrationOptions.includes(defaultConcentration)
  ) {
    fail(name, kind, `${path}.defaultConcentration`, "must be one of concentrationOptions")
  }
  const formulationOptions = record.formulationOptions == null
    ? undefined
    : formulationArray(record.formulationOptions, name, kind, `${path}.formulationOptions`)
  const defaultFormulation = record.defaultFormulation == null
    ? undefined
    : oneOf(
        String(record.defaultFormulation).toUpperCase(),
        LOCAL_ANAESTHETIC_FORMULATIONS,
        name,
        kind,
        `${path}.defaultFormulation`,
      )
  if (defaultFormulation && !formulationOptions?.includes(defaultFormulation)) {
    fail(name, kind, `${path}.defaultFormulation`, "must be one of formulationOptions")
  }
  return {
    mode: record.mode == null
      ? "dose"
      : oneOf(record.mode, DOSE_MODE, name, kind, `${path}.mode`),
    min,
    max,
    step: finiteNumber(record.step, name, kind, `${path}.step`, true),
    variableStep: parseVariableSteps(record.variableStep, name, kind, `${path}.variableStep`),
    quickValues: record.quickValues == null
      ? []
      : numberArray(record.quickValues, name, kind, `${path}.quickValues`),
    unit,
    weightBasis: record.weightBasis == null
      ? "none"
      : oneOf(record.weightBasis, WEIGHT_BASIS, name, kind, `${path}.weightBasis`),
    doseCalc: parseDoseCalc(record.doseCalc, name, kind, `${path}.doseCalc`),
    concentrationOptions,
    concentrationUnit: typeof record.concentrationUnit === "string"
      ? record.concentrationUnit
      : undefined,
    defaultConcentration,
    suggestedConcentration: typeof record.suggestedConcentration === "string"
      ? record.suggestedConcentration
      : undefined,
    formulationOptions,
    defaultFormulation,
    suggestedVolume: optionalNumber(record.suggestedVolume, name, kind, `${path}.suggestedVolume`),
    suggestedRate: optionalNumber(record.suggestedRate, name, kind, `${path}.suggestedRate`),
    prepStrength: parsePrepStrength(record.prepStrength, name, kind, `${path}.prepStrength`),
  }
}

function parseRecord<T>(
  value: unknown,
  name: string,
  kind: DoseKind,
  path: string,
  parse: (entry: unknown, entryPath: string) => T,
): Record<string, T> | undefined {
  if (value == null) return undefined
  if (typeof value !== "object" || Array.isArray(value)) fail(name, kind, path, "must be an object")
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
      key,
      parse(entry, `${path}.${key}`),
    ]),
  )
}

export function parseDoseProfile(name: string, kind: DoseKind, raw: unknown): DoseProfile {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    fail(name, kind, "profile", "must be an object")
  }
  const record = raw as Record<string, unknown>
  const routeModes = parseRecord(
    record.routeModes,
    name,
    kind,
    "routeModes",
    (entry, path) => parseRouteMode(entry, name, kind, path),
  )
  const min = optionalNumber(record.min, name, kind, "min")
  const max = optionalNumber(record.max, name, kind, "max")
  const step = optionalNumber(record.step, name, kind, "step", true)
  const variableStep = parseVariableSteps(record.variableStep, name, kind, "variableStep")
  const unit = typeof record.unit === "string" ? record.unit : undefined
  if (!routeModes && (min == null || max == null || (step == null && !variableStep) || !unit)) {
    fail(name, kind, "profile", "must have routeModes or flat min/max/(step or variableStep)/unit")
  }
  if (min != null && max != null && max <= min) fail(name, kind, "max", "must be greater than min")
  const routes = record.routes == null ? ["IV"] : stringArray(record.routes, name, kind, "routes")
  const defaultRoute = typeof record.defaultRoute === "string" && record.defaultRoute.trim()
    ? record.defaultRoute.trim()
    : routes[0]
  if (defaultRoute && !routes.includes(defaultRoute)) {
    fail(name, kind, "defaultRoute", "must be one of routes")
  }
  const concentrationOptions = record.concentrationOptions == null
    ? undefined
    : stringArray(record.concentrationOptions, name, kind, "concentrationOptions")
  const defaultConcentration = typeof record.defaultConcentration === "string"
    ? record.defaultConcentration
    : undefined
  if (
    defaultConcentration
    && concentrationOptions?.length
    && !concentrationOptions.includes(defaultConcentration)
  ) {
    fail(name, kind, "defaultConcentration", "must be one of concentrationOptions")
  }
  const formulationOptions = record.formulationOptions == null
    ? undefined
    : formulationArray(record.formulationOptions, name, kind, "formulationOptions")
  const defaultFormulation = record.defaultFormulation == null
    ? undefined
    : oneOf(
        String(record.defaultFormulation).toUpperCase(),
        LOCAL_ANAESTHETIC_FORMULATIONS,
        name,
        kind,
        "defaultFormulation",
      )
  if (defaultFormulation && !formulationOptions?.includes(defaultFormulation)) {
    fail(name, kind, "defaultFormulation", "must be one of formulationOptions")
  }
  if (kind !== "fluid" && (
    record.fluidEntryModes != null
    || record.defaultFluidEntryMode != null
    || record.fluidRate != null
  )) {
    fail(name, kind, "fluidEntryModes", "fluid entry-mode metadata is only supported for fluid profiles")
  }
  const fluidEntryModes = record.fluidEntryModes == null
    ? undefined
    : fluidEntryModeArray(record.fluidEntryModes, name, kind, "fluidEntryModes")
  const defaultFluidEntryMode = record.defaultFluidEntryMode == null
    ? undefined
    : oneOf(
        String(record.defaultFluidEntryMode).toUpperCase(),
        FLUID_ENTRY_MODES,
        name,
        kind,
        "defaultFluidEntryMode",
      )
  if (defaultFluidEntryMode && !fluidEntryModes?.includes(defaultFluidEntryMode)) {
    fail(name, kind, "defaultFluidEntryMode", "must be one of fluidEntryModes")
  }
  const fluidRate = parseFluidRate(record.fluidRate, name, kind, "fluidRate")
  if (fluidRate && fluidEntryModes && !fluidEntryModes.includes("RATE")) {
    fail(name, kind, "fluidRate", "requires RATE in fluidEntryModes")
  }

  return {
    kind,
    mode: record.mode == null ? "dose" : oneOf(record.mode, DOSE_MODE, name, kind, "mode"),
    min,
    max,
    step,
    variableStep,
    rounding: record.rounding == null
      ? "nearest_step"
      : oneOf(record.rounding, ROUNDING, name, kind, "rounding"),
    quickValues: record.quickValues == null ? [] : numberArray(record.quickValues, name, kind, "quickValues"),
    unit,
    routes,
    defaultRoute,
    concentrationOptions,
    concentrationUnit: typeof record.concentrationUnit === "string"
      ? record.concentrationUnit
      : undefined,
    defaultConcentration,
    formulationOptions,
    defaultFormulation,
    weightBasis: record.weightBasis == null
      ? "none"
      : oneOf(record.weightBasis, WEIGHT_BASIS, name, kind, "weightBasis"),
    hint: typeof record.hint === "string" ? record.hint : undefined,
    doseCalc: parseDoseCalc(record.doseCalc, name, kind, "doseCalc"),
    suggestedConcentration: typeof record.suggestedConcentration === "string"
      ? record.suggestedConcentration
      : undefined,
    suggestedVolume: optionalNumber(record.suggestedVolume, name, kind, "suggestedVolume"),
    suggestedVolumeByRoute: parseRecord(
      record.suggestedVolumeByRoute,
      name,
      kind,
      "suggestedVolumeByRoute",
      (entry, path) => finiteNumber(entry, name, kind, path),
    ),
    suggestedRate: optionalNumber(record.suggestedRate, name, kind, "suggestedRate"),
    prepStrength: parsePrepStrength(record.prepStrength, name, kind, "prepStrength"),
    doseCalcByRoute: parseRecord(
      record.doseCalcByRoute,
      name,
      kind,
      "doseCalcByRoute",
      (entry, path) => parseDoseCalc(entry, name, kind, path) ?? {},
    ),
    routeModes,
    fluidEntryModes,
    defaultFluidEntryMode,
    fluidRate,
  }
}
