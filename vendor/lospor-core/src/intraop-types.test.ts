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

  it("parses canonical fluid rate events and projected exact timestamps", () => {
    expect(parseLogEvent({
      id: "fluid-rate-1",
      ts: "2026-07-24T08:07:30.000Z",
      type: "fluid_rate",
      fluidId: "fluid-1",
      rate: "80",
      unit: "mL/h",
      fluidEntryMode: "RATE",
      bagVolumeMl: 500,
      administeredVolumeMl: 25,
    })).toMatchObject({
      type: "fluid_rate",
      fluidEntryMode: "RATE",
      bagVolumeMl: 500,
      administeredVolumeMl: 25,
    })

    expect(parseLegacyKeyEvents({
      fluids: [{
        id: "fluid-1",
        name: "Plasma-Lyte",
        category: "Crystalloids",
        volume: "25",
        color: "#0ff",
        startCol: 0,
        endCol: 2,
        fluidEntryMode: "RATE",
        startTs: "2026-07-24T08:00:30.000Z",
        endTs: "2026-07-24T08:10:30.000Z",
        rate: 100,
        unit: "mL/h",
        rateChanges: [{
          col: 1,
          ts: "2026-07-24T08:05:30.000Z",
          rate: 50,
          unit: "mL/h",
        }],
      }],
    }).fluids?.[0]).toMatchObject({
      fluidEntryMode: "RATE",
      startTs: "2026-07-24T08:00:30.000Z",
      endTs: "2026-07-24T08:10:30.000Z",
      rateChanges: [{
        col: 1,
        ts: "2026-07-24T08:05:30.000Z",
        rate: 50,
        unit: "mL/h",
      }],
    })
  })

  it("normalizes numeric wire dose, rate and volume values to canonical strings", () => {
    expect(parseLogEvent({
      id: "numeric-fluid-start",
      ts: "2026-07-24T08:00:00.000Z",
      type: "fluid_start",
      fluidId: "fluid-1",
      fluidEntryMode: "RATE",
      rate: 40,
      volume: 500,
    })).toMatchObject({ rate: "40", volume: "500" })
    expect(parseLogEvent({
      id: "numeric-fluid-rate",
      ts: "2026-07-24T08:05:00.000Z",
      type: "fluid_rate",
      fluidId: "fluid-1",
      rate: 60,
    })).toMatchObject({ rate: "60" })
    expect(parseLogEvent({
      id: "numeric-drug",
      ts: "2026-07-24T08:05:00.000Z",
      type: "drug",
      dose: 12.5,
    })).toMatchObject({ dose: "12.5" })
  })

  it("filters malformed timetable rows and preserves vital column alignment", () => {
    const parsed = parseLegacyKeyEvents({
      vitals: [{ systolic: 120, spO2: "invalid" }, null, { heartRate: 70 }],
      drugs: [
        {
          colIdx: 1,
          name: "Bupivacaine",
          dose: 12,
          unit: "mg",
          route: "INTRATHECAL",
          concentration: "0.5%",
          concentrationValue: 0.5,
          concentrationUnit: "PERCENT",
          formulation: "HYPERBARIC",
          calculationBasis: "IBW",
          calculationWeightKg: 30,
          calculationMethod: "MCLAREN_CDC_2000",
          clinicalRuleKey: "bupivacaine-pediatric",
          clinicalRuleVersion: "hospital-a.v2",
          clinicalRuleSourceIds: [],
        clinicalPresetId: "preset-a",
        clinicalPresetVersion: 2,
        clinicalPresetScope: "INSTITUTION",
        },
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
    expect(parsed.drugs).toEqual([expect.objectContaining({
      colIdx: 1,
      name: "Bupivacaine",
      dose: "12",
      concentration: "0.5%",
      concentrationUnit: "PERCENT",
      formulation: "HYPERBARIC",
      calculationMethod: "MCLAREN_CDC_2000",
      clinicalPresetId: "preset-a",
      clinicalPresetVersion: 2,
      clinicalPresetScope: "INSTITUTION",
    })])
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
