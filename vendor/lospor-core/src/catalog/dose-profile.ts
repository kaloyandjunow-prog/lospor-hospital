export const DOSE_KIND = ["bolus", "infusion", "fluid", "agent"] as const
export type DoseKind = (typeof DOSE_KIND)[number]

export const ROUNDING = ["nearest_step", "floor_step", "ceil_step"] as const
export type Rounding = (typeof ROUNDING)[number]

export const WEIGHT_BASIS = ["TBW", "IBW", "none"] as const
export type WeightBasis = (typeof WEIGHT_BASIS)[number]

export const DOSE_MODE = ["dose", "rate", "concentration", "concentration-rate"] as const
export type DoseModeKind = (typeof DOSE_MODE)[number]

export type DoseCalc = {
  perKg?: number
  flat?: number
  basis?: Exclude<WeightBasis, "none">
  roundTo?: number
  cap?: number
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
  suggestedConcentration?: string
  suggestedVolume?: number
  suggestedRate?: number
  prepStrength?: PrepStrength
}

export type RouteModeInput = Omit<RouteMode, "mode" | "quickValues" | "weightBasis"> & {
  mode?: DoseModeKind
  quickValues?: number[]
  weightBasis?: WeightBasis
}

export type DoseProfile = {
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
  concentrationOptions?: string[]
  defaultConcentration?: string
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
  "kind" | "mode" | "rounding" | "quickValues" | "routes" | "weightBasis" | "routeModes"
> & {
  mode?: DoseModeKind
  rounding?: Rounding
  quickValues?: number[]
  routes?: string[]
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
    : oneOf(record.basis, ["IBW", "TBW"] as const, name, kind, `${path}.basis`)
  return {
    perKg: optionalNumber(record.perKg, name, kind, `${path}.perKg`),
    flat: optionalNumber(record.flat, name, kind, `${path}.flat`),
    basis,
    roundTo: optionalNumber(record.roundTo, name, kind, `${path}.roundTo`, true),
    cap: optionalNumber(record.cap, name, kind, `${path}.cap`, true),
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
    concentrationOptions: record.concentrationOptions == null
      ? undefined
      : stringArray(record.concentrationOptions, name, kind, `${path}.concentrationOptions`),
    suggestedConcentration: typeof record.suggestedConcentration === "string"
      ? record.suggestedConcentration
      : undefined,
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
    routes: record.routes == null ? ["IV"] : stringArray(record.routes, name, kind, "routes"),
    concentrationOptions: record.concentrationOptions == null
      ? undefined
      : stringArray(record.concentrationOptions, name, kind, "concentrationOptions"),
    defaultConcentration: typeof record.defaultConcentration === "string"
      ? record.defaultConcentration
      : undefined,
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
  }
}
