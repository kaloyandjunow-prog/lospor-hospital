import { describe, expect, it } from "vitest"
import type { TimetableData, TimetableFluid, TimetableInfusion } from "./intraop-types"
import {
  buildDrugLogEntries,
  calculateDrugTotals,
  fluidRateAtColumn,
  formatColumnTime,
  naturalTimetableColumnCount,
  rateAtColumn,
} from "./intraop-summary"

/**
 * Arithmetic behind the anaesthetic record.
 *
 * These three functions decide the drug totals and the infusion and fluid rates
 * that appear on screen and, more importantly, on the printed record that goes
 * into the patient's file. Three renderers consume them — web, mobile and
 * print — so the guarantee that all three agree is only as good as the
 * guarantee that these are right. None of them had a test.
 *
 * The cases below are the ones where being wrong is clinically meaningful
 * rather than merely untidy: units that must never be added together, and the
 * exact column at which a rate change takes effect.
 */

function infusion(overrides: Partial<TimetableInfusion> = {}): TimetableInfusion {
  return {
    id: "infusion-1",
    name: "Propofol",
    rate: 4,
    unit: "mg/kg/h",
    startCol: 0,
    endCol: 12,
    color: "#f0f",
    ...overrides,
  }
}

function fluid(overrides: Partial<TimetableFluid> = {}): TimetableFluid {
  return {
    id: "fluid-1",
    name: "Ringer",
    volume: "500",
    color: "#0ff",
    startCol: 0,
    endCol: 12,
    ...overrides,
  }
}

function drug(name: string, dose: string, unit: string, colIdx = 0) {
  return { colIdx, name, dose, unit }
}

/**
 * Instant for a chart column, at the five minutes per column the chart uses.
 * fluidRateAtColumn resolves by column and ignores this, but the type carries
 * it because volume integration elsewhere works from real instants rather than
 * the column projection.
 */
function at(column: number): string {
  return new Date(Date.UTC(2026, 0, 1, 8, 5 * column)).toISOString()
}

describe("calculateDrugTotals", () => {
  it("adds repeat doses of the same drug and unit", () => {
    expect(calculateDrugTotals({
      drugs: [drug("Fentanyl", "50", "mcg"), drug("Fentanyl", "25", "mcg", 3)],
    })).toEqual([{ name: "Fentanyl", unit: "mcg", total: 75 }])
  })

  it("never adds the same drug across different units", () => {
    // 100 mg and 100 mcg of the same drug are three orders of magnitude apart.
    // Summing them would put a single, badly wrong number on the record.
    const totals = calculateDrugTotals({
      drugs: [drug("Morphine", "10", "mg"), drug("Morphine", "100", "mcg", 4)],
    })

    expect(totals).toHaveLength(2)
    expect(totals).toContainEqual({ name: "Morphine", unit: "mg", total: 10 })
    expect(totals).toContainEqual({ name: "Morphine", unit: "mcg", total: 100 })
  })

  it("parses doses entered as text", () => {
    expect(calculateDrugTotals({
      drugs: [drug("Rocuronium", "50", "mg"), drug("Rocuronium", "12.5", "mg", 6)],
    })).toEqual([{ name: "Rocuronium", unit: "mg", total: 62.5 }])
  })

  it("treats an unparseable dose as zero rather than poisoning the total", () => {
    // NaN would propagate through the sum and render as "NaN" on the record.
    expect(calculateDrugTotals({
      drugs: [drug("Suxamethonium", "100", "mg"), drug("Suxamethonium", "", "mg", 2)],
    })).toEqual([{ name: "Suxamethonium", unit: "mg", total: 100 }])
  })

  it("rounds away binary floating point error", () => {
    expect(calculateDrugTotals({
      drugs: [drug("Adrenaline", "0.1", "mg"), drug("Adrenaline", "0.2", "mg", 1)],
    })).toEqual([{ name: "Adrenaline", unit: "mg", total: 0.3 }])
  })

  it("returns nothing for an absent timetable", () => {
    expect(calculateDrugTotals(null)).toEqual([])
    expect(calculateDrugTotals(undefined)).toEqual([])
    expect(calculateDrugTotals({ drugs: [] })).toEqual([])
  })
})

describe("rateAtColumn", () => {
  it("reports the starting rate before any change", () => {
    expect(rateAtColumn(infusion({ rateChanges: [{ col: 5, rate: 8, unit: "mg/kg/h" }] }), 4))
      .toEqual({ rate: 4, unit: "mg/kg/h" })
  })

  it("applies a change on the column it was made, not the one after", () => {
    // The boundary is the whole point: a change recorded at 10:00 belongs to
    // 10:00, not 10:05.
    const line = infusion({ rateChanges: [{ col: 5, rate: 8, unit: "mg/kg/h" }] })

    expect(rateAtColumn(line, 4).rate).toBe(4)
    expect(rateAtColumn(line, 5).rate).toBe(8)
  })

  it("uses the most recent change when several precede the column", () => {
    expect(rateAtColumn(infusion({
      rateChanges: [
        { col: 2, rate: 6, unit: "mg/kg/h" },
        { col: 8, rate: 2, unit: "mg/kg/h" },
        { col: 5, rate: 8, unit: "mg/kg/h" },
      ],
    }), 9)).toEqual({ rate: 2, unit: "mg/kg/h" })
  })

  it("carries the unit recorded with the change", () => {
    expect(rateAtColumn(infusion({
      rateChanges: [{ col: 3, rate: 200, unit: "mcg/kg/min" }],
    }), 6)).toEqual({ rate: 200, unit: "mcg/kg/min" })
  })
})

describe("fluidRateAtColumn", () => {
  it("reports no rate for a fluid recorded as a volume", () => {
    // A bag charted by volume has no rate to show; returning one would invent a
    // number the clinician never entered.
    expect(fluidRateAtColumn(fluid({ fluidEntryMode: "VOLUME", rate: 120 }), 3))
      .toEqual({ rate: undefined, unit: undefined })
    expect(fluidRateAtColumn(fluid({ rate: 120 }), 3))
      .toEqual({ rate: undefined, unit: undefined })
  })

  it("defaults the unit to mL/h when none was recorded", () => {
    expect(fluidRateAtColumn(fluid({ fluidEntryMode: "RATE", rate: 100 }), 2))
      .toEqual({ rate: 100, unit: "mL/h" })
  })

  it("applies a change on the column it was made, not the one after", () => {
    const line = fluid({
      fluidEntryMode: "RATE",
      rate: 60,
      unit: "mL/h",
      rateChanges: [{ col: 4, ts: at(4), rate: 120, unit: "mL/h" }],
    })

    expect(fluidRateAtColumn(line, 3).rate).toBe(60)
    expect(fluidRateAtColumn(line, 4).rate).toBe(120)
  })

  it("resolves correctly when changes arrive out of order", () => {
    // Offline edits can be persisted in any order, so the function sorts rather
    // than trusting the array.
    expect(fluidRateAtColumn(fluid({
      fluidEntryMode: "RATE",
      rate: 60,
      unit: "mL/h",
      rateChanges: [
        { col: 9, ts: at(9), rate: 30, unit: "mL/h" },
        { col: 2, ts: at(2), rate: 120, unit: "mL/h" },
      ],
    }), 5)).toEqual({ rate: 120, unit: "mL/h" })
  })
})

describe("formatColumnTime", () => {
  // UTC throughout: the wall-clock branch would otherwise assert whatever
  // timezone the machine running the tests happens to be in.
  const start = "2026-01-01T08:00:00.000Z"

  it("falls back to elapsed time when the case has no start", () => {
    // A case being documented before its start time is recorded still has to
    // print something meaningful against each column.
    expect(formatColumnTime(0, null)).toBe("+0m")
    expect(formatColumnTime(5, null)).toBe("+25m")
    expect(formatColumnTime(5, undefined)).toBe("+25m")
  })

  it("falls back rather than printing NaN for an unparseable start", () => {
    // Without this the record would carry "NaN:NaN" beside a drug dose.
    expect(formatColumnTime(3, "not a date")).toBe("+15m")
  })

  it("formats wall-clock time zero-padded", () => {
    expect(formatColumnTime(0, start, 5, "utc")).toBe("08:00")
    expect(formatColumnTime(1, start, 5, "utc")).toBe("08:05")
    expect(formatColumnTime(12, start, 5, "utc")).toBe("09:00")
  })

  it("rolls over midnight instead of running past 24", () => {
    // Night lists cross midnight routinely; "24:05" is not a time.
    expect(formatColumnTime(12, "2026-01-01T23:00:00.000Z", 5, "utc")).toBe("00:00")
    expect(formatColumnTime(13, "2026-01-01T23:00:00.000Z", 5, "utc")).toBe("00:05")
  })

  it("honours a non-default column interval", () => {
    expect(formatColumnTime(4, start, 15, "utc")).toBe("09:00")
    expect(formatColumnTime(4, null, 15)).toBe("+60m")
  })
})

describe("buildDrugLogEntries", () => {
  const start = "2026-01-01T08:00:00.000Z"

  it("orders the log by column whatever order the drugs were stored in", () => {
    // The drug log is read as a chronology. Storage order follows whatever the
    // client synced, which after an offline period is not chronological.
    const entries = buildDrugLogEntries({
      drugs: [
        drug("Ondansetron", "4", "mg", 8),
        drug("Propofol", "200", "mg", 0),
        drug("Fentanyl", "100", "mcg", 2),
      ],
    }, start, "utc")

    expect(entries.map(entry => entry.name)).toEqual(["Propofol", "Fentanyl", "Ondansetron"])
    expect(entries.map(entry => entry.time)).toEqual(["08:00", "08:10", "08:40"])
  })

  it("carries the dose and unit through exactly as recorded", () => {
    const [entry] = buildDrugLogEntries({
      drugs: [drug("Adrenaline", "0.5", "mg", 1)],
    }, start, "utc")

    expect(entry).toEqual({
      column: 1,
      time: "08:05",
      name: "Adrenaline",
      dose: "0.5",
      unit: "mg",
    })
  })
})

describe("naturalTimetableColumnCount", () => {
  it("reaches past the last column that holds anything", () => {
    expect(naturalTimetableColumnCount({ drugs: [drug("Propofol", "200", "mg", 7)] })).toBe(8)
  })

  it("covers segments to their end column, not just their start", () => {
    // A chart cut at an infusion's start column would print a record that stops
    // before the infusion did.
    expect(naturalTimetableColumnCount({
      infusions: [infusion({ startCol: 2, endCol: 20 })],
    })).toBe(21)
  })

  it("does not widen the chart for a vitals row with nothing in it", () => {
    const empty: Partial<TimetableData> = {
      vitals: [{ systolic: 120 }, {}, {}, {}, {}, {}, {}, {}],
    }
    expect(naturalTimetableColumnCount(empty)).toBe(1)
  })

  it("respects a minimum width and adds trailing room", () => {
    expect(naturalTimetableColumnCount({}, 12)).toBe(12)
    expect(naturalTimetableColumnCount({}, 12, 3)).toBe(15)
  })
})
