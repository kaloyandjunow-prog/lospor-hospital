import { describe, expect, it } from "vitest"

import { INFUSION_CATALOG } from "./catalog/intraop-infusions"
import { projectIntraopEvents } from "./intraop-engine"
import {
  calcInfusionTotal,
  calcInfusionTotals,
  DEFAULT_INFUSION_WEIGHT_BASIS,
  formatInfusionTotal,
  infusionCalculationBasis,
  withInfusionInstants,
} from "./intraop-totals"
import { timetableEditToEventOps } from "./intraop-timetable-edit"
import type { LogEvent, TimetableData } from "./intraop-types"

// Infusion totals as they are printed and shown (9.12.3). Each case below was
// a wrong number on the printed protocol or a screen before.

const start = "2026-09-26T21:00:00.000Z"
const at = (minutes: number) => new Date(Date.parse(start) + minutes * 60_000).toISOString()

function chartOf(events: LogEvent[], readAt = 120) {
  return projectIntraopEvents(events, { start, openThrough: at(readAt) })
}

function remifentanil(from: number, to: number) {
  return chartOf([
    { id: "s", ts: at(from), type: "infusion_start", infId: "i", name: "Remifentanil", rate: "0.1", unit: "mcg/kg/min" },
    { id: "e", ts: at(to), type: "infusion_stop", infId: "i" },
  ]).infusions[0]
}

describe("infusion totals follow the time actually run", () => {
  it.each([
    [4, 26, 176],
    [48, 74, 208],
    [3, 57, 432],
    [0, 60, 480],
  ])("%i to %i minutes at 0.1 mcg/kg/min and 80 kg", (from, to, micrograms) => {
    expect(calcInfusionTotal(remifentanil(from, to), 80, 80)).toMatchObject({ amount: micrograms, unit: "mcg" })
  })

  it("counts a rate change from the minute it was made", () => {
    const infusion = chartOf([
      { id: "s", ts: at(3), type: "infusion_start", infId: "i", name: "Propofol", rate: "6", unit: "mg/kg/hr" },
      { id: "r", ts: at(33), type: "infusion_rate", infId: "i", rate: "4", unit: "mg/kg/hr" },
      { id: "e", ts: at(63), type: "infusion_stop", infId: "i" },
    ]).infusions[0]
    // 30 min at 6 and 30 min at 4 mg/kg/hr, 70 kg: 210 + 140.
    expect(calcInfusionTotal(infusion, 70, 90).amount).toBe(350)
  })

  it("a running infusion counts to the reading time, an ended case to its end", () => {
    const events: LogEvent[] = [
      { id: "s", ts: at(2), type: "infusion_start", infId: "i", name: "Nitroglycerin", rate: "60", unit: "mcg/min" },
    ]
    expect(calcInfusionTotal(chartOf(events, 22).infusions[0]).amount).toBe(1200)
    const ended = projectIntraopEvents(events, { start, endedAt: at(32), openThrough: at(400) }).infusions[0]
    expect(calcInfusionTotal(ended).amount).toBe(1800)
  })

  it("falls back to whole columns when the bar no longer matches its instants", () => {
    // A bar just dragged one column longer in the web chart, before the
    // edit has come back as events: counted as drawn, as before 9.12.3.
    const dragged = { ...remifentanil(4, 26), endCol: 6 }
    expect(calcInfusionTotal(dragged, 80, 80).amount).toBe(0.1 * 80 * 35)
    // A chart saved before 9.12.3 has no instants at all.
    const { startTs: _s, endTs: _e, ...legacy } = remifentanil(4, 26)
    expect(calcInfusionTotal(legacy, 80, 80).amount).toBe(0.1 * 80 * 30)
  })

  it("recovers the instants of a chart saved before 9.12.3 from its event log", () => {
    const log: LogEvent[] = [
      { id: "s", ts: at(4), type: "infusion_start", infId: "i", name: "Remifentanil", rate: "0.1", unit: "mcg/kg/min" },
      { id: "r", ts: at(14), type: "infusion_rate", infId: "i", rate: "0.2", unit: "mcg/kg/min" },
      { id: "e", ts: at(26), type: "infusion_stop", infId: "i" },
      { id: "s2", ts: at(10), type: "infusion_start", infId: "j", name: "Nitroglycerin", rate: "60", unit: "mcg/min" },
    ]
    const strip = <T extends { startTs?: string; endTs?: string; rateChanges?: { ts?: string }[] }>(item: T): T => ({
      ...item,
      startTs: undefined,
      endTs: undefined,
      rateChanges: item.rateChanges?.map(change => ({ ...change, ts: undefined })),
    })
    const saved = projectIntraopEvents(log, { start, endedAt: at(40) }).infusions.map(strip)
    const [remi, ntg] = withInfusionInstants(saved, log, at(40))
    // 10 min at 0.1 and 12 min at 0.2 mcg/kg/min, 80 kg.
    expect(calcInfusionTotal(remi, 80, 80).amount).toBe(80 + 192)
    // Still running at the end: 30 minutes at 60 mcg/min.
    expect(calcInfusionTotal(ntg).amount).toBe(1800)
  })
})

describe("infusion totals without a weight", () => {
  it("are given per kilogram, never multiplied by 1 kg", () => {
    const total = calcInfusionTotal(remifentanil(4, 26), null, null)
    expect(total).toMatchObject({ amount: 2.2, unit: "mcg/kg", weightMissing: true, weightUsed: null })
    expect(formatInfusionTotal(total)).toBe("2.2 mcg/kg")
  })

  it("do not touch an infusion that is not dosed per kilogram", () => {
    const infusion = chartOf([
      { id: "s", ts: at(0), type: "infusion_start", infId: "i", name: "Nitroglycerin", rate: "60", unit: "mcg/min" },
      { id: "e", ts: at(30), type: "infusion_stop", infId: "i" },
    ]).infusions[0]
    expect(calcInfusionTotal(infusion)).toMatchObject({ amount: 1800, unit: "mcg", weightMissing: false })
  })
})

describe("infusion totals across a unit change", () => {
  const custom = (secondUnit: string, secondRate: string) => chartOf([
    { id: "s", ts: at(0), type: "infusion_start", infId: "i", name: "Custom", rate: "1", unit: "mg/hr" },
    { id: "r", ts: at(30), type: "infusion_rate", infId: "i", rate: secondRate, unit: secondUnit },
    { id: "e", ts: at(60), type: "infusion_stop", infId: "i" },
  ]).infusions[0]

  it("converts mg and mcg before adding them", () => {
    // 0.5 mg, then 10 mcg/kg/min × 80 kg × 30 min = 24 000 mcg.
    expect(calcInfusionTotal(custom("mcg/kg/min", "10"), 80, 80)).toMatchObject({ amount: 24500, unit: "mcg", others: [] })
  })

  it("keeps units that cannot be converted apart", () => {
    const total = calcInfusionTotal(custom("mL/hr", "4"))
    expect(total).toMatchObject({ amount: 2, unit: "mL", others: [{ amount: 0.5, unit: "mg" }] })
    expect(formatInfusionTotal(total)).toBe("2 mL + 0.5 mg")
  })
})

describe("infusion weight basis", () => {
  it("is the catalogue's, for every catalogue infusion", () => {
    for (const entry of INFUSION_CATALOG) {
      const basis = entry.profile.weightBasis
      if (basis === "IBW" || basis === "TBW" || basis === "BSA_M2" || basis === "none") {
        expect(DEFAULT_INFUSION_WEIGHT_BASIS[entry.name], entry.name).toBe(basis)
      }
    }
  })

  it("is used when a caller passes no map, so print and PWA agree with the web form", () => {
    const heparin = chartOf([
      { id: "s", ts: at(0), type: "infusion_start", infId: "i", name: "Unfractionated heparin", rate: "18", unit: "IU/kg/hr" },
      { id: "e", ts: at(60), type: "infusion_stop", infId: "i" },
    ]).infusions[0]
    // Heparin is dosed on actual weight: 18 IU/kg/hr × 90 kg × 1 h.
    expect(calcInfusionTotals([heparin], 70, 90)[0]).toMatchObject({ total: 1620, weightBasis: "TBW", weightUsed: 90 })
  })
})

describe("the basis recorded on the infusion", () => {
  const propofol = (basis?: "FLAT" | "TBW" | "IBW" | "BSA_M2") => chartOf([
    {
      id: "s", ts: at(0), type: "infusion_start", infId: "i", name: "Propofol", rate: "6", unit: "mg/kg/hr",
      ...(basis ? { calculationBasis: basis } : {}),
    },
    { id: "e", ts: at(60), type: "infusion_stop", infId: "i" },
  ]).infusions[0]

  it("travels from the start event onto the bar", () => {
    expect(propofol("TBW")).toMatchObject({ calculationBasis: "TBW" })
  })

  it("wins over the library, so a later library edit does not reach back", () => {
    // Library now says IBW (70 kg); the infusion was given on actual weight (90 kg).
    expect(calcInfusionTotal(propofol("TBW"), 70, 90, { Propofol: "IBW" })).toMatchObject({ amount: 540, weightBasis: "TBW" })
    // Without a recorded basis the library decides, as before.
    expect(calcInfusionTotal(propofol(), 70, 90, { Propofol: "IBW" })).toMatchObject({ amount: 420, weightBasis: "IBW" })
  })

  it("is what the library says when the infusion is started", () => {
    expect(infusionCalculationBasis("Propofol", { Propofol: "TBW" })).toBe("TBW")
    expect(infusionCalculationBasis("Oxytocin", { Oxytocin: "none" })).toBe("FLAT")
    expect(infusionCalculationBasis("Something unlisted", {})).toBe("IBW")
  })

  it("survives an edit of the chart on the web", () => {
    const log: LogEvent[] = [
      { id: "s", ts: at(0), type: "infusion_start", infId: "i", name: "Propofol", rate: "6", unit: "mg/kg/hr", calculationBasis: "TBW" },
    ]
    const before = projectIntraopEvents(log, { start, openThrough: at(30) })
    const after = JSON.parse(JSON.stringify(before)) as TimetableData
    after.infusions = after.infusions.map(bar => ({ ...bar, startCol: 1 }))
    const ops = timetableEditToEventOps({ log, before, after, chartStart: start, now: at(30), newId: () => "n" })
    const written = [...ops.add, ...ops.update].find(event => event.type === "infusion_start")
    expect(written).toMatchObject({ calculationBasis: "TBW" })
  })

  it("says so when the other weight had to be used", () => {
    // Dosed on ideal weight, but no height: counted on actual weight, and labelled so.
    expect(calcInfusionTotal(propofol("IBW"), null, 90)).toMatchObject({
      amount: 540, weightUsed: 90, weightBasis: "TBW", basisFallback: true,
    })
    expect(formatInfusionTotal(calcInfusionTotal(propofol("IBW"), null, 90))).toBe("540 mg (TBW)")
    expect(calcInfusionTotal(propofol("IBW"), 70, 90)).toMatchObject({ weightBasis: "IBW", basisFallback: false })
  })
})

describe("infusion totals per m² of body surface", () => {
  const perM2 = chartOf([
    { id: "s", ts: at(0), type: "infusion_start", infId: "i", name: "Chemo", rate: "10", unit: "mg/m²/hr", calculationBasis: "BSA_M2" },
    { id: "e", ts: at(90), type: "infusion_stop", infId: "i" },
  ]).infusions[0]

  it("multiply by the body surface area", () => {
    expect(calcInfusionTotal(perM2, 70, 80, {}, 1.9)).toMatchObject({ amount: 28.5, unit: "mg", bsaUsed: 1.9, weightMissing: false })
  })

  it("stay per m² when no surface area is known", () => {
    const total = calcInfusionTotal(perM2, 70, 80)
    expect(total).toMatchObject({ amount: 15, unit: "mg/m²", weightMissing: true })
    expect(formatInfusionTotal(total)).toBe("15 mg/m²")
  })

  it("accept m2 written without the superscript", () => {
    const plain = { ...perM2, unit: "mg/m2/hr" }
    expect(calcInfusionTotal(plain, 70, 80, {}, 2).amount).toBe(30)
  })
})
