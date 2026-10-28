import { describe, expect, it } from "vitest"
import type { TimetableData, VitalsEntry } from "../intraop-types"
import {
  aggregateIndicators,
  DEFAULT_INDICATOR_CONFIG,
  gasFootprint,
  hypotensionBandFor,
  indicatorConfigKey,
  morphineEquivalents,
  parseIndicatorConfig,
  summarizeCaseIndicators,
  SUPPRESS_BELOW,
  type CaseIndicatorInput,
  type IndicatorRow,
} from "./index"

const START = new Date("2026-10-20T07:00:00Z")
const empty: TimetableData = { vitals: [], drugs: [], fluids: [], agents: [], infusions: [], gasSettings: [] }

function input(overrides: Partial<CaseIndicatorInput> = {}): CaseIndicatorInput {
  return {
    status: "COMPLETE", clinicalMode: "ADULT", startedAt: START, endedAt: new Date(START.getTime() + 60 * 60_000), timezone: "Europe/Sofia",
    finalizedAt: new Date(START.getTime() + 3 * 60 * 60_000), autoEndedAt: null, ageDays: 50 * 365, sex: "MALE", weightKg: 80, heightCm: 180,
    asa: "II", apfel: 2, procedure: "Cholecystectomy", techniques: ["GENERAL_BALANCED"], airwayDevice: "ORAL_ETT", airwayTools: ["VIDEO_LARY"],
    cormackLehane: "I", complications: [], postop: null, timetable: empty, missing: [], ...overrides,
  }
}

const vitals = (entries: Record<number, VitalsEntry>): VitalsEntry[] => {
  const list: VitalsEntry[] = []
  for (const [column, entry] of Object.entries(entries)) list[Number(column)] = entry
  return list
}

describe("indicator thresholds (10.0.0)", () => {
  it("bands ages from newborn to older adult", () => {
    expect(hypotensionBandFor(DEFAULT_INDICATOR_CONFIG, 10)?.key).toBe("NEONATE")
    expect(hypotensionBandFor(DEFAULT_INDICATOR_CONFIG, 200)?.key).toBe("INFANT")
    expect(hypotensionBandFor(DEFAULT_INDICATOR_CONFIG, 3 * 365)?.key).toBe("CHILD_1_5")
    expect(hypotensionBandFor(DEFAULT_INDICATOR_CONFIG, 40 * 365)?.key).toBe("ADULT")
    expect(hypotensionBandFor(DEFAULT_INDICATOR_CONFIG, 80 * 365)?.key).toBe("OLDER")
    expect(hypotensionBandFor(DEFAULT_INDICATOR_CONFIG, null)).toBeNull()
  })

  it("keeps the bands' ages and takes only valid thresholds from Status", () => {
    const config = parseIndicatorConfig({
      hypotensionBands: [{ key: "ADULT", mapBelow: 60, sbpBelow: 90, fromDays: 0 }, { key: "OLDER", mapBelow: 5000 }],
      spo2Below: 92, namedClinicians: true,
    })
    const adult = config.hypotensionBands.find(band => band.key === "ADULT")!
    expect(adult).toMatchObject({ mapBelow: 60, sbpBelow: 90, fromDays: Math.round(18 * 365.25) })
    expect(config.hypotensionBands.find(band => band.key === "OLDER")!.mapBelow).toBe(65)
    expect(config.spo2Below).toBe(92)
    expect(config.namedClinicians).toBe(true)
    // Showing names re-reads nothing; a threshold does.
    expect(indicatorConfigKey({ ...DEFAULT_INDICATOR_CONFIG, namedClinicians: true })).toBe(indicatorConfigKey(DEFAULT_INDICATOR_CONFIG))
    expect(indicatorConfigKey(config)).not.toBe(indicatorConfigKey(DEFAULT_INDICATOR_CONFIG))
  })
})

describe("opioid equivalents (10.0.0)", () => {
  it("converts parenteral opioids and sets neuraxial ones apart", () => {
    const result = morphineEquivalents([
      { name: "Fentanyl", amount: 200, unit: "mcg", route: "IV" },
      { name: "Remifentanil", amount: 1, unit: "mg" },
      { name: "Morphine", amount: 0.1, unit: "mg", route: "Intrathecal" },
      { name: "Paracetamol", amount: 1, unit: "g" },
    ])
    // 0.2 mg × 100 + 1 mg × 100; remifentanil is not taken for fentanyl.
    expect(result).toEqual({ mg: 120, neuraxial: true, unconverted: [], given: true })
    expect(morphineEquivalents([{ name: "Sufentanil", amount: 2, unit: "mL" }]).unconverted).toEqual(["sufentanil"])
  })
})

describe("gas footprint (10.0.0)", () => {
  it("estimates CO2e from agent, concentration and fresh gas flow", () => {
    const sevo = gasFootprint(
      [{ name: "Sevoflurane", startCol: 0, endCol: 11, percent: 2 }],
      [{ id: "g", startCol: 0, endCol: 11, fgf: 1, carrierGas: "air", fio2: 50 }],
    )
    // 1 L/min × 2 % × 60 min = 1.2 L vapour → 1.2 / 24.04 × 200.05 g × 130.
    expect(sevo.kgCo2e).toBeCloseTo((1.2 / 24.04) * 200.05 * 130 / 1000, 2)
    const des = gasFootprint(
      [{ name: "Desflurane", startCol: 0, endCol: 11, percent: 6 }],
      [{ id: "g", startCol: 0, endCol: 11, fgf: 1, carrierGas: "air", fio2: 50 }],
    )
    // 3 × the concentration, 0.84 × the molar mass, 19.5 × the warming potential.
    expect(des.kgCo2e! / sevo.kgCo2e!).toBeCloseTo(3 * (168.04 / 200.05) * (2540 / 130), 0)
    expect(gasFootprint([{ name: "Sevoflurane", startCol: 0, endCol: 3, percent: 2 }], []).kgCo2e).toBeNull()
    expect(gasFootprint([], []).kgCo2e).toBe(0)
  })
})

describe("a case's indicators (10.0.0)", () => {
  it("times hypotension against the patient's age band, carrying a reading forward up to 15 minutes", () => {
    // Columns 0–11 (60 min). BP at 0 (fine), 2 (MAP 60: low), 8 (fine).
    const summary = summarizeCaseIndicators(input({
      timetable: { ...empty, vitals: vitals({ 0: { systolic: 120, diastolic: 70 }, 2: { systolic: 90, diastolic: 45 }, 8: { systolic: 120, diastolic: 70 } }) },
    }), DEFAULT_INDICATOR_CONFIG)
    // Column 2 low, carried to 3 and 4.
    expect(summary.hypotensionMin).toBe(15)
    // 0–1 by the first reading, 2–4 by the low one, 8–10 by the last; 5–7 and 11 are past 15 minutes.
    expect(summary.bpCoveredMin).toBe(40)
    expect(summary.ageBand).toBe("ADULT")
  })

  it("uses the child's systolic threshold", () => {
    const summary = summarizeCaseIndicators(input({
      clinicalMode: "PEDIATRIC", ageDays: 200,
      timetable: { ...empty, vitals: vitals({ 0: { systolic: 65, diastolic: 40 } }) },
    }), DEFAULT_INDICATOR_CONFIG)
    expect(summary.ageBand).toBe("INFANT")
    expect(summary.hypotensionMin).toBe(15)
  })

  it("counts opioids, reversal, antiemetics and recovery", () => {
    const summary = summarizeCaseIndicators(input({
      timetable: {
        ...empty,
        drugs: [
          { colIdx: 0, name: "Fentanyl", dose: "100", unit: "mcg", route: "IV" },
          { colIdx: 1, name: "Ondansetron", dose: "4", unit: "mg" },
          { colIdx: 1, name: "Dexamethasone", dose: "4", unit: "mg" },
          { colIdx: 10, name: "Sugammadex", dose: "200", unit: "mg" },
        ],
      },
      postop: { painNRS: 5, flaccTotal: null, nipsTotal: null, fpsrScore: null, ponv: false, paedScore: null, aldreteTotal: 9, stewardTotal: null, temperature: 35.6, disposition: "WARD" },
    }), DEFAULT_INDICATOR_CONFIG)
    expect(summary).toMatchObject({
      morphineMg: 10, morphineMgPerKg: 0.125, sugammadex: true, neostigmine: false, antiemetics: 2,
      painScale: "NRS", painAboveThreshold: true, ponv: false, recoveryScore: 9, recoveryScale: "ALDRETE", hypothermia: true, lowestTemp: 35.6,
      videoLaryngoscope: true, durationMin: 60, finalizedLagMin: 120, weekday: 2, hour: 10,
    })
  })
})

describe("the ward figures (10.0.0)", () => {
  const row = (index: number, overrides: Partial<IndicatorRow> = {}): IndicatorRow => ({
    ...summarizeCaseIndicators(input({ startedAt: new Date(START.getTime() + index * 90 * 60_000), endedAt: new Date(START.getTime() + index * 90 * 60_000 + 60 * 60_000) }), DEFAULT_INDICATOR_CONFIG),
    caseId: `c${index}`, theatreId: "t1", theatreName: "Зала 1", assigneeId: index < 6 ? "me" : "colleague", ...overrides,
  })

  it("hides any figure resting on fewer than five cases", () => {
    const report = aggregateIndicators([row(0), row(1), row(2)], { config: DEFAULT_INDICATOR_CONFIG, viewerId: "me", names: {} })
    expect(report.caseMix.pediatric).toEqual({ count: null, of: 3, share: null })
    expect(report.time.duration.median).toBeNull()
    expect(report.activity.byMode).toEqual([{ key: "ADULT", count: null }])
    expect(SUPPRESS_BELOW).toBe(5)
  })

  it("names the viewer and letters colleagues unless names are switched on", () => {
    const rows = Array.from({ length: 12 }, (_, index) => row(index))
    const names = { me: "Dr Me", colleague: "Dr Colleague" }
    const anonymous = aggregateIndicators(rows, { config: DEFAULT_INDICATOR_CONFIG, viewerId: "me", names })
    expect(anonymous.drugs.byClinician.map(entry => [entry.name, entry.isMe])).toEqual(expect.arrayContaining([["Dr Me", true], [null, false]]))
    const named = aggregateIndicators(rows, { config: { ...DEFAULT_INDICATOR_CONFIG, namedClinicians: true }, viewerId: "me", names })
    expect(named.drugs.byClinician.map(entry => entry.name).sort()).toEqual(["Dr Colleague", "Dr Me"])
  })

  it("keeps Aldrete and Steward apart: a median across 0-10 and 0-6 means nothing", () => {
    const rows = [
      ...Array.from({ length: 5 }, (_, index) => row(index, { recoveryScore: 9, recoveryScale: "ALDRETE" })),
      ...Array.from({ length: 5 }, (_, index) => row(index + 5, { recoveryScore: 5, recoveryScale: "STEWARD", mode: "PEDIATRIC" })),
    ]
    const report = aggregateIndicators(rows, { config: DEFAULT_INDICATOR_CONFIG, viewerId: "me", names: {} })
    expect(report.recovery.aldreteScore).toMatchObject({ n: 5, median: 9 })
    expect(report.recovery.stewardScore).toMatchObject({ n: 5, median: 5 })
  })

  it("measures turnover in a theatre on the same day", () => {
    const rows = Array.from({ length: 6 }, (_, index) => row(index))
    const report = aggregateIndicators(rows, { config: DEFAULT_INDICATOR_CONFIG, viewerId: "me", names: {} })
    // Each case ends 60 min after starting; the next starts 90 min after the last: 30 min turnover.
    expect(report.time.turnover).toMatchObject({ n: 5, median: 30 })
    expect(report.activity.byTheatre[0]).toMatchObject({ name: "Зала 1", cases: 6, hours: 6 })
  })
})
