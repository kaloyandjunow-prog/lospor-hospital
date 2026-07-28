import { describe, expect, it } from "vitest"

import { parseLegacyKeyEvents, parseLogEvent, parseLogEvents } from "./intraop-types"

describe("intraoperative wire types", () => {
  it("normalizes valid event fields and ignores invalid optional values", () => {
    expect(parseLogEvent({
      id: "drug-1",
      ts: "2026-07-24T08:00:00.000Z",
      type: "drug",
      name: "Propofol",
      dose: "150",
      systolic: "not-a-number",
      carrierGas: null,
      syncStatus: "pending",
    })).toEqual({
      id: "drug-1",
      ts: "2026-07-24T08:00:00.000Z",
      type: "drug",
      name: "Propofol",
      dose: "150",
      carrierGas: null,
      syncStatus: "pending",
    })
  })

  it("drops malformed log entries instead of trusting them", () => {
    expect(parseLogEvents([
      { id: "v-1", ts: "2026-07-24T08:05:00.000Z", type: "vital", spO2: 98 },
      { id: "missing-time", type: "vital" },
      { id: "unknown", ts: "2026-07-24T08:10:00.000Z", type: "not-real" },
      null,
    ])).toEqual([
      { id: "v-1", ts: "2026-07-24T08:05:00.000Z", type: "vital", spO2: 98 },
    ])
  })

  it("accepts legacy number and string timetable values", () => {
    const parsed = parseLegacyKeyEvents({
      infusions: [
        {
          id: "inf-1",
          name: "Norepinephrine",
          rate: 4,
          unit: "mcg/min",
          startCol: 1,
          endCol: 3,
          color: "#ef4444",
          rateChanges: [{ col: 2, rate: "6", unit: "mcg/min" }],
        },
      ],
      log: [{ id: "inf-1-start", ts: "2026-07-24T08:05:00.000Z", type: "infusion_start", rate: "4" }],
    })

    expect(parsed.infusions?.[0]?.rate).toBe(4)
    expect(parsed.infusions?.[0]?.rateChanges?.[0]?.rate).toBe("6")
    expect(parsed.log?.[0]?.type).toBe("infusion_start")
  })

  it("returns an empty snapshot for non-object input", () => {
    expect(parseLegacyKeyEvents(null)).toEqual({})
    expect(parseLegacyKeyEvents([])).toEqual({})
  })

  it("filters malformed timetable rows and preserves vital column alignment", () => {
    const parsed = parseLegacyKeyEvents({
      vitals: [{ systolic: 120, spO2: "invalid" }, null, { heartRate: 70 }],
      drugs: [
        { colIdx: 1, name: "Propofol", dose: 100, unit: "mg" },
        { colIdx: "wrong", name: "Invalid", dose: "1", unit: "mg" },
      ],
      infusions: [
        {
          id: "inf-1",
          name: "Lidocaine",
          rate: "4",
          unit: "mL/hr",
          startCol: 0,
          endCol: 2,
          rateChanges: [
            { col: 1, rate: 5, unit: "mL/hr" },
            { col: "wrong", rate: 6, unit: "mL/hr" },
          ],
        },
        { id: "broken" },
      ],
    })

    expect(parsed.vitals).toEqual([{ systolic: 120 }, {}, { heartRate: 70 }])
    expect(parsed.drugs).toEqual([{ colIdx: 1, name: "Propofol", dose: "100", unit: "mg" }])
    expect(parsed.infusions).toEqual([
      {
        id: "inf-1",
        name: "Lidocaine",
        rate: "4",
        unit: "mL/hr",
        startCol: 0,
        endCol: 2,
        color: "#3b82f6",
        rateChanges: [{ col: 1, rate: 5, unit: "mL/hr" }],
      },
    ])
  })
})
