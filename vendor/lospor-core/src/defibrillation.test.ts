import { describe, expect, it } from "vitest"

import {
  defibrillationEvent,
  defibrillationPrefillJoules,
  defibrillationShockNumber,
  isValidDefibrillationEnergy,
} from "./defibrillation"
import { projectIntraopEvents } from "./intraop-engine"
import { describeIntraopEvent } from "./intraop-summary"
import type { LogEvent } from "./intraop-types"
import { parseLogEvent } from "./intraop-types"

const YEAR = 365.25

describe("energy", () => {
  it("is 1 to 360 J in whole joules", () => {
    expect(isValidDefibrillationEnergy(1)).toBe(true)
    expect(isValidDefibrillationEnergy(360)).toBe(true)
    expect(isValidDefibrillationEnergy(0)).toBe(false)
    expect(isValidDefibrillationEnergy(361)).toBe(false)
    expect(isValidDefibrillationEnergy(150.5)).toBe(false)
  })

  it("is prefilled for children from the paediatric reference, never for adults", () => {
    expect(defibrillationPrefillJoules({ ageDays: Math.round(4 * YEAR), weightKg: 16, shockNumber: 1 })).toBe(64)
    expect(defibrillationPrefillJoules({ ageDays: Math.round(4 * YEAR), weightKg: 16, shockNumber: 5 })).toBe(128)
    expect(defibrillationPrefillJoules({ ageDays: Math.round(16 * YEAR), weightKg: 120, shockNumber: 6 })).toBe(360)
    expect(defibrillationPrefillJoules({ ageDays: Math.round(40 * YEAR), weightKg: 80, shockNumber: 1 })).toBeNull()
    expect(defibrillationPrefillJoules({ ageDays: Math.round(4 * YEAR), weightKg: null, shockNumber: 1 })).toBeNull()
  })

  it("counts the shocks already charted", () => {
    const log: LogEvent[] = [
      defibrillationEvent({ id: "a", ts: "2026-11-01T09:00:00Z", energyJ: 64, synchronized: false }),
      defibrillationEvent({ id: "b", ts: "2026-11-01T09:02:00Z", energyJ: 64, synchronized: false }),
    ]
    expect(defibrillationShockNumber(log)).toBe(3)
    expect(defibrillationShockNumber(log, "2026-11-01T09:01:00Z")).toBe(2)
  })
})

describe("a shock", () => {
  const shock = defibrillationEvent({ id: "s1", ts: "2026-11-01T09:10:00.000Z", energyJ: 200, synchronized: true })

  it("survives the shared parser", () => {
    expect(parseLogEvent(JSON.parse(JSON.stringify(shock)))).toEqual(shock)
  })

  it("is a marker on the chart with its energy", () => {
    const chart = projectIntraopEvents([shock], { start: "2026-11-01T09:00:00.000Z", openThrough: "2026-11-01T10:00:00.000Z" })
    expect(chart.clinicalEvents).toEqual([expect.objectContaining({ eventId: "s1", colIdx: 2, kind: "defibrillation", energyJ: 200, synchronized: true })])
  })

  it("reads in the event log in both languages", () => {
    expect(describeIntraopEvent(shock, { language: "en" }).text).toBe("Cardioversion · 200 J · synchronised")
    expect(describeIntraopEvent({ ...shock, synchronized: false }, { language: "bg" }).text).toBe("Дефибрилация · 200 J")
  })
})

describe("the energy dial", () => {
  it("maps 1-360 J onto a 300° sweep and back", async () => {
    const { defibrillationEnergyAtAngle, defibrillationKnobAngle } = await import("./defibrillation")
    expect(defibrillationKnobAngle(1)).toBe(-150)
    expect(defibrillationKnobAngle(360)).toBe(150)
    expect(defibrillationEnergyAtAngle(0)).toBe(181)
    expect(defibrillationEnergyAtAngle(-170)).toBe(1)
    expect(defibrillationEnergyAtAngle(175)).toBe(360)
    expect(defibrillationEnergyAtAngle(defibrillationKnobAngle(200))).toBe(200)
  })
})

describe("energy knob skin C: the selector with stops (10.2.0)", () => {
  it("points each stop on its own mark and an energy between two stops between them", async () => {
    const { defibrillationSelectorAngle, defibrillationSelectorStopAt, DEFIBRILLATION_SELECTOR_STOPS } = await import("./defibrillation")
    expect(defibrillationSelectorAngle(2)).toBe(-150)
    expect(defibrillationSelectorAngle(360)).toBe(150)
    const a50 = defibrillationSelectorAngle(50), a70 = defibrillationSelectorAngle(70), a64 = defibrillationSelectorAngle(64)
    expect(a64).toBeGreaterThan(a50)
    expect(a64).toBeLessThan(a70)
    expect(defibrillationSelectorAngle(1)).toBe(-150)
    for (const stop of DEFIBRILLATION_SELECTOR_STOPS) expect(defibrillationSelectorStopAt(defibrillationSelectorAngle(stop))).toBe(stop)
    expect(defibrillationSelectorStopAt(500)).toBe(360)
  })
})
