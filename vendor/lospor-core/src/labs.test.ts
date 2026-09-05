import { describe, expect, it } from "vitest"
import {
  LAB_LIBRARY,
  formatLabReferenceRange,
  getLabByName,
  getLabFlag,
  abnormalSummary,
  groupLabsByDraw,
  searchLabs,
  getLabSeverity,
  parseLabValue,
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
    // The 130 shows, as a normal result. The 88 does not show at all.
    expect(shown.map(a => a.result.value)).toEqual(["130"])
  })

  it("puts criticals first", () => {
    // Ordering still matters, but nothing is critical unless a laboratory said
    // so -- which is why the potassium carries a threshold and the sodium,
    // merely low, does not.
    const { shown } = abnormalSummary([
      at("Sodium (Na⁺)", "130", "2026-06-01T09:00:00Z"),
      { ...at("Potassium (K⁺)", "1.2", "2026-06-01T09:00:00Z"), criticalLow: 2.5 },
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

  it("falls back to the first results when the panel is normal", () => {
    // An empty row is ambiguous: it reads the same whether the panel was normal
    // or whether nobody has looked. "Na 140, K 4.2" says plainly that somebody
    // drew bloods and they were fine.
    const draw = "2026-06-01T09:00:00Z"
    const { shown, hiddenCount } = abnormalSummary([
      at("Sodium (Na⁺)", "140", draw),
      at("Potassium (K⁺)", "4.2", draw),
      at("Creatinine", "80", draw),
      at("CRP", "3", draw),
    ])
    expect(shown.map(a => a.severity)).toEqual(["normal", "normal", "normal"])
    expect(shown.map(a => a.result.test)).toEqual(["Sodium (Na⁺)", "Potassium (K⁺)", "Creatinine"])
    expect(hiddenCount).toBe(1)
  })

  it("prefers even one abnormal result over the normal fallback", () => {
    const draw = "2026-06-01T09:00:00Z"
    const { shown } = abnormalSummary([
      at("Sodium (Na⁺)", "140", draw),
      at("Potassium (K⁺)", "2.9", draw),
    ])
    expect(shown).toHaveLength(1)
    expect(shown[0].result.test).toBe("Potassium (K⁺)")
  })

  it("says nothing when there are no results at all", () => {
    expect(abnormalSummary([])).toEqual({ shown: [], hiddenCount: 0 })
  })
})


/**
 * Critical was derived from the reference range, and that is wrong in both
 * directions. Base excess runs -2 to 2, and half of -2 is -1: a threshold
 * inside the normal range, so an ordinary base excess of -1.5 read as
 * critical. Scaling from the range width instead makes a sodium of 130
 * critical, when critical hyponatraemia is nearer 120.
 *
 * A critical value is a published per-analyte threshold, not a property of a
 * range, so it is asserted only where one is given.
 */
describe("critical is asserted only where a threshold says so", () => {
  const be = LAB_LIBRARY.find(t => t.name === "Base excess (BE)")!
  const na = LAB_LIBRARY.find(t => t.name === "Sodium (Na⁺)")!

  it("does not call an ordinary negative base excess critical", () => {
    // The whole normal negative half used to be flagged.
    for (const value of [-1.9, -1.5, -1.1, -1, 0, 1.9]) {
      expect(getLabSeverity(be, value), ).toBe("normal")
    }
  })

  it("calls a deranged result abnormal rather than inventing a critical", () => {
    // A smaller claim than before, and one the data supports.
    expect(getLabSeverity(be, -12)).toBe("low")
    expect(getLabSeverity(na, 130)).toBe("low")
  })

  it("calls it critical when a laboratory supplies the threshold", () => {
    expect(getLabSeverity(na, 118, { refLow: 136, refHigh: 145, criticalLow: 120 }))
      .toBe("critical")
    expect(getLabSeverity(na, 130, { refLow: 136, refHigh: 145, criticalLow: 120 }))
      .toBe("low")
  })

  it("judges against the laboratory's range when it sent one", () => {
    // A neonatal haemoglobin of 180 is ordinary against a neonatal range and
    // high against ours, and the laboratory that ran it knows which applies.
    const hb = LAB_LIBRARY.find(t => t.name === "Haemoglobin (Hb)")!
    expect(getLabSeverity(hb, 180)).toBe("high")
    expect(getLabSeverity(hb, 180, { refLow: 145, refHigh: 225 })).toBe("normal")
  })

  it("keeps ours when the laboratory sent none", () => {
    const hb = LAB_LIBRARY.find(t => t.name === "Haemoglobin (Hb)")!
    expect(getLabSeverity(hb, 100, {})).toBe("low")
  })
})

/**
 * parseFloat reads until a string stops making sense and returns what it got.
 * "5.2 (H)" became 5.2 with the flag lost, and a European "5,8" read without
 * the comma became 5 -- a normal-looking potassium standing in for a dangerous
 * one. The invented number then carried an abnormal flag and reached the export
 * as though it had been measured.
 */
describe("a laboratory value is a number only if the whole of it is", () => {
  it("reads a plain number, however it is written", () => {
    expect(parseLabValue("5.8")).toBe(5.8)
    expect(parseLabValue(" 5.8 ")).toBe(5.8)
    expect(parseLabValue("-2.5")).toBe(-2.5)
    expect(parseLabValue(".5")).toBe(0.5)
    expect(parseLabValue(5.8)).toBe(5.8)
  })

  it("reads a comma decimal, which is how results are printed here", () => {
    // The one that would hurt: 5,8 read as 5 is a normal potassium where the
    // real value needs treating.
    expect(parseLabValue("5,8")).toBe(5.8)
  })

  it("refuses a value that is only partly a number", () => {
    for (const written of ["5abc", "5.2 (H)", "5.2 H", "12 to 15", "5 mmol/L"]) {
      expect(parseLabValue(written), written).toBeNull()
    }
  })

  it("refuses the results laboratories report as words", () => {
    // Real results, and they must keep their text rather than become a number.
    for (const written of ["negative", "<0.01", ">1000", "haemolysed", ""]) {
      expect(parseLabValue(written), written).toBeNull()
    }
  })

  it("does not treat a non-numeric result as normal", () => {
    // Neither abnormal nor normal: it has not been assessed.
    const { shown } = abnormalSummary([
      { test: "Sodium (Na⁺)", value: "haemolysed", unit: "mmol/L", takenAt: "2026-06-01T09:00:00Z" },
    ])
    expect(shown).toHaveLength(0)
  })
})
