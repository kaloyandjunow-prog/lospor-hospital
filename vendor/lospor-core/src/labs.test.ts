import { describe, expect, it } from "vitest"
import {
  LAB_LIBRARY,
  formatLabReferenceRange,
  getLabByName,
  getLabFlag,
  abnormalSummary,
  groupLabsByDraw,
  searchLabs,
  type LabResult,
} from "./labs"

describe("lab catalog", () => {
  it("contains unique named tests", () => {
    const names = LAB_LIBRARY.map(test => test.name)
    expect(new Set(names).size).toBe(names.length)
  })

  it("uses trimmed search and returns no rows for an empty query", () => {
    expect(searchLabs("   ")).toEqual([])
    expect(searchLabs("  creatinine ")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ test: expect.objectContaining({ name: "Creatinine" }) }),
      ]),
    )
  })

  it("looks up, flags and formats canonical ranges", () => {
    const creatinine = getLabByName("Creatinine")
    expect(creatinine).toBeDefined()
    expect(getLabFlag(creatinine!, 999)).toBe("high")
    expect(formatLabReferenceRange(creatinine!)).toBeTruthy()
  })
})

describe("grouping results into draws", () => {
  const lab = (test: string, takenAt?: string): LabResult =>
    ({ test, value: "1", unit: "g/L", ...(takenAt ? { takenAt } : {}) })

  it("puts every result sharing an instant into one draw", () => {
    // The point of the whole feature: fifteen rows stamped 09:42 are one
    // blood sample, not fifteen independent facts.
    const draws = groupLabsByDraw([
      lab("Haemoglobin (Hb)", "2026-06-01T09:42:00Z"),
      lab("Platelets", "2026-06-01T09:42:00Z"),
      lab("Creatinine", "2026-06-01T09:42:00Z"),
    ])
    expect(draws).toHaveLength(1)
    expect(draws[0].takenAt).toBe("2026-06-01T09:42:00Z")
    expect(draws[0].results.map(r => r.test)).toEqual([
      "Haemoglobin (Hb)", "Platelets", "Creatinine",
    ])
  })

  it("orders draws newest first", () => {
    // During a case the most recent gas is the one being acted on. It must not
    // be at the bottom of a growing list.
    const draws = groupLabsByDraw([
      lab("Haemoglobin (Hb)", "2026-06-01T08:00:00Z"),
      lab("Haemoglobin (Hb)", "2026-06-01T10:00:00Z"),
      lab("Haemoglobin (Hb)", "2026-06-01T09:00:00Z"),
    ])
    expect(draws.map(d => d.takenAt)).toEqual([
      "2026-06-01T10:00:00Z",
      "2026-06-01T09:00:00Z",
      "2026-06-01T08:00:00Z",
    ])
  })

  it("does not merge draws a minute apart", () => {
    // No tolerance window: two samples really drawn a minute apart are two
    // samples, and merging them would erase a distinction the clinician made.
    const draws = groupLabsByDraw([
      lab("Haemoglobin (Hb)", "2026-06-01T09:42:00Z"),
      lab("Haemoglobin (Hb)", "2026-06-01T09:43:00Z"),
    ])
    expect(draws).toHaveLength(2)
  })

  it("collects undated results into one draw, sorted last", () => {
    // Preop labs typed by hand routinely carry no draw time. Dropping them, or
    // scattering them through the timeline, would both be worse than saying
    // plainly that the time is unknown.
    const draws = groupLabsByDraw([
      lab("Creatinine"),
      lab("Haemoglobin (Hb)", "2026-06-01T09:00:00Z"),
      lab("Platelets"),
    ])
    expect(draws).toHaveLength(2)
    expect(draws[0].takenAt).toBe("2026-06-01T09:00:00Z")
    expect(draws[1].takenAt).toBeNull()
    expect(draws[1].results).toHaveLength(2)
  })

  it("returns nothing for no results", () => {
    expect(groupLabsByDraw([])).toEqual([])
  })
})

describe("what a collapsed summary row shows", () => {
  const at = (test: string, value: string, takenAt?: string): LabResult =>
    ({ test, value, unit: "", ...(takenAt ? { takenAt } : {}) })

  it("shows only the newest draw", () => {
    // An earlier haemoglobin of 88 that is now 104 describes a patient who has
    // been transfused, not one who is anaemic. Showing both invites acting on
    // the older number.
    const { shown } = abnormalSummary([
      at("Haemoglobin (Hb)", "88", "2026-06-01T08:00:00Z"),
      at("Haemoglobin (Hb)", "130", "2026-06-01T09:00:00Z"),
    ])
    expect(shown).toHaveLength(0)
  })

  it("puts criticals first", () => {
    // Potassium 1.2 is below half the lower bound; sodium 130 is merely low.
    const { shown } = abnormalSummary([
      at("Sodium (Na⁺)", "130", "2026-06-01T09:00:00Z"),
      at("Potassium (K⁺)", "1.2", "2026-06-01T09:00:00Z"),
    ])
    expect(shown.map(a => [a.result.test, a.severity])).toEqual([
      ["Potassium (K⁺)", "critical"],
      ["Sodium (Na⁺)", "low"],
    ])
  })

  it("caps the row and counts the rest", () => {
    // Fifteen abnormal results rendered inline is not information, it is a
    // wall, and the one that mattered is somewhere in the middle of it.
    const draw = "2026-06-01T09:00:00Z"
    const { shown, hiddenCount } = abnormalSummary([
      at("Sodium (Na⁺)", "130", draw),
      at("Potassium (K⁺)", "2.9", draw),
      at("Creatinine", "200", draw),
      at("CRP", "90", draw),
      at("Platelets", "90", draw),
    ])
    expect(shown).toHaveLength(3)
    expect(hiddenCount).toBe(2)
  })

  it("leaves out a test with no reference range", () => {
    // Anti-Xa is rangeless on purpose — its window depends on the indication
    // and the drug. A row that cannot say whether it is abnormal must not
    // imply that it is normal either.
    const { shown } = abnormalSummary([
      at("Anti-Xa", "9.9", "2026-06-01T09:00:00Z"),
    ])
    expect(shown).toHaveLength(0)
  })

  it("ignores a value that is not a number", () => {
    const { shown } = abnormalSummary([at("Sodium (Na⁺)", "haemolysed", "2026-06-01T09:00:00Z")])
    expect(shown).toHaveLength(0)
  })

  it("says nothing when there are no results at all", () => {
    expect(abnormalSummary([])).toEqual({ shown: [], hiddenCount: 0 })
  })
})
