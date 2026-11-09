import { describe, expect, it, vi } from "vitest"

vi.mock("@/lib/api", () => ({ apiJson: vi.fn() }))
vi.mock("@/lib/preferences-context", () => ({ usePreferences: () => ({ vitalEpisodeAutoLog: true }) }))
vi.mock("@/lib/server-clock", () => ({ serverNow: () => new Date("2026-11-01T12:00:00.000Z") }))

import { DEFIBRILLATION_MAX_J, DEFIBRILLATION_MIN_J } from "@lospor/core/defibrillation"
import { defibrillationSheet, knobAngleForEnergy, knobEnergyForPoint, KNOB_SWEEP } from "@/lib/defibrillation-knob"
import { endCaseInstant } from "@/lib/use-end-case-time"
import { parseIntraopAutomationResponse } from "@/lib/use-intraop-automation"

describe("the automation the phone reads", () => {
  it("is the defaults when the API sends nothing usable, as the demo does: every suggestion and the questions on", () => {
    expect(parseIntraopAutomationResponse(null)).toMatchObject({ settings: { enabled: true, groups: { reminders: true, treatmentSuggestions: true }, vitalQuestions: { enabled: true } }, stats: null })
    expect(parseIntraopAutomationResponse({ settings: { enabled: "yes" } }).settings.enabled).toBe(false)
  })

  it("keeps the counts only while the questions are on", () => {
    const stats = { ADULT: { hr: { min: 60, counts: [1], cases: 1 } } }
    expect(parseIntraopAutomationResponse({ settings: { enabled: true, vitalQuestions: { enabled: true } }, stats }).stats).toEqual(stats)
    expect(parseIntraopAutomationResponse({ settings: { enabled: true, vitalQuestions: { enabled: false } }, stats }).stats).toBeNull()
  })
})

describe("the energy knob", () => {
  const size = 200
  it("runs from 1 J at the left end to 360 J at the right", () => {
    expect(knobAngleForEnergy(DEFIBRILLATION_MIN_J)).toBe(-KNOB_SWEEP / 2)
    expect(knobAngleForEnergy(DEFIBRILLATION_MAX_J)).toBe(KNOB_SWEEP / 2)
    expect(knobEnergyForPoint(size / 2, 0, size)).toBe(181)
  })

  it("sends a touch in the gap at the bottom to the nearer end", () => {
    expect(knobEnergyForPoint(size / 2 - 5, size, size)).toBe(DEFIBRILLATION_MIN_J)
    expect(knobEnergyForPoint(size / 2 + 5, size, size)).toBe(DEFIBRILLATION_MAX_J)
  })

  it("is opened from the slot sheet with the slot's time, one at a time", () => {
    const seen: (string | null)[] = []
    const stop = defibrillationSheet.subscribe(() => seen.push(defibrillationSheet.current()))
    defibrillationSheet.open("2026-11-01T09:00:00.000Z")
    defibrillationSheet.close()
    stop()
    expect(seen).toEqual(["2026-11-01T09:00:00.000Z", null])
  })
})

describe("End at", () => {
  const base = { startedAt: new Date("2026-10-29T07:00:00.000Z"), timeZone: "Europe/Sofia", now: new Date("2026-11-01T12:00:00.000Z") }

  it("ends a case charted after the fact on the day it really ended", () => {
    expect(endCaseInstant({ ...base, mode: "at", dayKey: "2026-10-29", hhmm: "11:00" }))
      .toEqual({ endTs: "2026-10-29T09:00:00.000Z", error: null })
  })

  it("refuses an end before the start or in the future, and a malformed time", () => {
    expect(endCaseInstant({ ...base, mode: "at", dayKey: "2026-10-29", hhmm: "08:00" }).error).toBe("before_start")
    expect(endCaseInstant({ ...base, mode: "at", dayKey: "2026-11-01", hhmm: "16:00" }).error).toBe("future")
    expect(endCaseInstant({ ...base, mode: "at", dayKey: "2026-10-29", hhmm: "25:00" }).error).toBe("invalid")
  })

  it("ends now when now is chosen", () => {
    expect(endCaseInstant({ ...base, mode: "now", dayKey: "", hhmm: "" })).toEqual({ endTs: "2026-11-01T12:00:00.000Z", error: null })
  })
})

describe("what usually comes next, as the phone reads it (10.2.0)", () => {
  const link = { context: "general", from: "Positioned", to: "Incision", count: 9, total: 10, gapMinutes: 5 }

  it("keeps well-formed links and reads nothing when none were sent", () => {
    expect(parseIntraopAutomationResponse({ settings: {}, succession: [link, { ...link, count: 99 }, "x"] }).succession).toEqual([link])
    expect(parseIntraopAutomationResponse({ settings: {} }).succession).toEqual([])
    expect(parseIntraopAutomationResponse(null).succession).toEqual([])
  })
})
