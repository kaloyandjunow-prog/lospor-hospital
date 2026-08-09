import { randomHex } from "@/lib/random-id"
import {
  parseLegacyKeyEvents as parseCoreLegacyKeyEvents,
  parseLogEvent as parseCoreLogEvent,
  type ActiveFluid as CoreActiveFluid,
  type EventType as CoreEventType,
  type LogEvent as CoreLogEvent,
} from "@lospor/core/intraop-types"

export type {
  ActiveGasSettings,
  ActiveInfusion,
} from "@lospor/core/intraop-types"

export type FluidEntryMode = "VOLUME" | "RATE"
export type FluidRateChange = { ts: string; rate: string; unit: string }
export type EventType = CoreEventType | "fluid_rate"

export type ActiveFluid = Omit<
  CoreActiveFluid,
  | "volume"
  | "fluidEntryMode"
  | "bagVolumeMl"
  | "administeredVolumeMl"
  | "initialRate"
  | "rate"
  | "unit"
  | "startTs"
  | "rateChanges"
> & {
  volume: string
  fluidEntryMode?: FluidEntryMode
  bagVolumeMl?: number
  administeredVolumeMl?: number
  initialRate?: string
  rate?: string
  unit?: string
  startTs?: string
  rateChanges?: FluidRateChange[]
}

export const DRUG_FORMULATIONS = ["HYPOBARIC", "ISOBARIC", "HYPERBARIC"] as const
export type DrugFormulation = (typeof DRUG_FORMULATIONS)[number]

// The shared package/API contract is gaining this field. Keep the mobile type
// additive in the meantime so a selected formulation is not lost from local
// state, the durable event journal, or repeat-dose actions.
export type LogEvent = Omit<CoreLogEvent, "type"> & {
  type: EventType
  formulation?: DrugFormulation
  fluidEntryMode?: FluidEntryMode
  bagVolumeMl?: number
  administeredVolumeMl?: number
}

export function normalizeDrugFormulation(value: unknown): DrugFormulation | undefined {
  return typeof value === "string" && DRUG_FORMULATIONS.includes(value as DrugFormulation)
    ? value as DrugFormulation
    : undefined
}

export function parseLogEvent(value: unknown): LogEvent | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  const raw = value as Record<string, unknown>
  const parsed = parseCoreLogEvent(value) as LogEvent | null
  const event = parsed ?? (
    raw.type === "fluid_rate" && typeof raw.id === "string" && typeof raw.ts === "string"
      ? { id: raw.id, ts: raw.ts, type: "fluid_rate" as const }
      : null
  )
  if (!event) return null
  const formulation = normalizeDrugFormulation(raw.formulation)
  const fluidEntryMode = raw.fluidEntryMode === "VOLUME" || raw.fluidEntryMode === "RATE"
    ? raw.fluidEntryMode
    : undefined
  const bagVolumeMl = typeof raw.bagVolumeMl === "number" && Number.isFinite(raw.bagVolumeMl)
    ? raw.bagVolumeMl
    : undefined
  const administeredVolumeMl = typeof raw.administeredVolumeMl === "number" && Number.isFinite(raw.administeredVolumeMl)
    ? raw.administeredVolumeMl
    : undefined
  return {
    ...event,
    ...(formulation ? { formulation } : {}),
    ...(fluidEntryMode ? { fluidEntryMode } : {}),
    ...(bagVolumeMl !== undefined ? { bagVolumeMl } : {}),
    ...(administeredVolumeMl !== undefined ? { administeredVolumeMl } : {}),
    ...(typeof raw.fluidId === "string" ? { fluidId: raw.fluidId } : {}),
    ...(typeof raw.name === "string" ? { name: raw.name } : {}),
    ...(typeof raw.rate === "string" ? { rate: raw.rate } : {}),
    ...(typeof raw.unit === "string" ? { unit: raw.unit } : {}),
    ...(typeof raw.color === "string" ? { color: raw.color } : {}),
  }
}

export function parseLegacyKeyEvents(value: unknown): ReturnType<typeof parseCoreLegacyKeyEvents> {
  const parsed = parseCoreLegacyKeyEvents(value)
  if (!value || typeof value !== "object" || Array.isArray(value)) return parsed
  const rawLog = (value as Record<string, unknown>).log
  if (!Array.isArray(rawLog)) return parsed
  return {
    ...parsed,
    log: rawLog.map(parseLogEvent).filter((event): event is LogEvent => event !== null),
  }
}

// Local id generator for in-memory infusion/fluid/log entries. Uses the
// crypto-backed randomHex (with a React Native fallback) so concurrent entries
// in the clinical event log cannot collide.
export function uid() {
  return randomHex(8)
}
