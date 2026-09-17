import {
  INTRAOP_VITAL_KEYS,
  invalidIntraopVitalFields,
  intraopVitalWarning,
  type IntraopVitalHardError,
  type IntraopVitalKey,
  type IntraopVitalWarning,
} from "@lospor/core/intraop-vitals"

import type { LogEvent } from "@/lib/intraop-log-event"

export type VitalEntryInput = Record<IntraopVitalKey, string>

export type VitalEntryConversions = {
  etco2: (value: number) => number
  temp: (value: number) => number
  cvp: (value: number) => number
}

export type VitalEntryFeedback = {
  errors: Partial<Record<IntraopVitalKey, IntraopVitalHardError>>
  warnings: Partial<Record<IntraopVitalKey, IntraopVitalWarning>>
  hasHardErrors: boolean
}

export function parseVitalEntryNumber(value: string): number | undefined {
  const normalized = value.trim().replace(",", ".")
  return normalized === "" ? undefined : Number(normalized)
}

export function buildVitalEntry(
  input: VitalEntryInput,
  conversions: VitalEntryConversions,
): Omit<LogEvent, "id" | "ts"> {
  const etco2 = parseVitalEntryNumber(input.etco2)
  const temp = parseVitalEntryNumber(input.temp)
  const cvp = parseVitalEntryNumber(input.cvp)
  return {
    type: "vital",
    systolic: parseVitalEntryNumber(input.systolic),
    diastolic: parseVitalEntryNumber(input.diastolic),
    heartRate: parseVitalEntryNumber(input.heartRate),
    spO2: parseVitalEntryNumber(input.spO2),
    etco2: etco2 == null ? undefined : conversions.etco2(etco2),
    temp: temp == null ? undefined : conversions.temp(temp),
    bis: parseVitalEntryNumber(input.bis),
    tofRatio: parseVitalEntryNumber(input.tofRatio),
    cvp: cvp == null ? undefined : conversions.cvp(cvp),
  }
}

export function vitalEntryFeedback(
  values: Partial<Record<IntraopVitalKey, unknown>>,
): VitalEntryFeedback {
  const errors: VitalEntryFeedback["errors"] = {}
  const warnings: VitalEntryFeedback["warnings"] = {}
  for (const issue of invalidIntraopVitalFields(values)) errors[issue.field] = issue.error
  for (const key of INTRAOP_VITAL_KEYS) {
    const value = values[key]
    if (typeof value !== "number") continue
    const warning = intraopVitalWarning(key, value)
    if (warning) warnings[key] = warning
  }
  return { errors, warnings, hasHardErrors: Object.keys(errors).length > 0 }
}

export function hasAnyVitalValue(values: Partial<Record<IntraopVitalKey, unknown>>): boolean {
  return INTRAOP_VITAL_KEYS.some(key => values[key] != null)
}

/** Replace an edited observation without changing its logical event identity. */
export function replaceVitalEvent(
  log: LogEvent[],
  eventId: string,
  vital: Omit<LogEvent, "id" | "ts">,
  fallbackTs: string,
): { event: LogEvent; log: LogEvent[] } {
  const previous = log.find(event => event.id === eventId)
  const event: LogEvent = {
    ...vital,
    id: eventId,
    ts: previous?.ts ?? fallbackTs,
    syncStatus: "pending",
  }
  const found = previous != null
  return {
    event,
    log: found
      ? log.map(existing => existing.id === eventId ? event : existing)
      : [event, ...log],
  }
}
