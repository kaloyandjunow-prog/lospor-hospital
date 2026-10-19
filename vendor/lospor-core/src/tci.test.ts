import { describe, expect, it } from "vitest"
import { jamesLbmValid, tciModelProblems, tciParams, type TciParams, type TciPatient } from "./tci-models"
import { simulateTci, TCI_STEP_MIN } from "./tci-simulate"

// TCI models and the pump calculation (2026-10-18). Parameter values are
// worked by hand from the published equations for a reference patient.

const man40: TciPatient = { ageYears: 40, weightKg: 70, heightCm: 175, sex: "MALE" }
const reference: TciPatient = { ageYears: 35, weightKg: 70, heightCm: 170, sex: "MALE" }
const child6: TciPatient = { ageYears: 6, weightKg: 20, heightCm: 115, sex: "MALE" }

const close = (actual: number, expected: number, digits = 4) => expect(actual).toBeCloseTo(expected, digits)

describe("model parameters", () => {
  it("Marsh scales V1 with weight; fixed rate constants; modified ke0", () => {
    expect(tciParams("MARSH", man40)).toEqual({ v1: 15.96, k10: 0.119, k12: 0.112, k13: 0.042, k21: 0.055, k31: 0.0033, ke0: 1.2 })
  })

  it("Schnider: clearance on weight, lean body mass and height; Q2 falls with age", () => {
    // LBM 56.52; CL 1.6869; Q2 1.602; V2 23.983.
    const p = tciParams("SCHNIDER", man40)
    close(p.v1, 4.27)
    close(p.k10, 1.68692 / 4.27)
    close(p.k12, 1.602 / 4.27)
    close(p.k21, 1.602 / 23.983)
    close(p.k13, 0.836 / 4.27)
    close(p.k31, 0.836 / 238)
    close(p.ke0, 0.456)
  })

  it("Eleveld propofol at the reference patient, with and without opioids", () => {
    const withOpioids = tciParams("ELEVELD_PROPOFOL", reference, { opioids: true })
    const without = tciParams("ELEVELD_PROPOFOL", reference, { opioids: false })
    close(without.v1, 6.28)
    close(without.k10, 1.79 / 6.28)
    // Q2 = 1.75 × (1 + 1.3 × (1 − fQ3mat)), fQ3mat(1860 w) = 0.964596.
    close(without.k12, 1.75 * (1 + 1.3 * (1 - 1860 / (1860 + 68.3))) / 6.28)
    close(without.k21, 1.75 * (1 + 1.3 * (1 - 1860 / (1860 + 68.3))) / 25.5)
    close(without.k31, 1.11 / 273)
    close(without.ke0, 0.146)
    // Opioids: CL × e^(−0.00286·35), V3 × e^(−0.0138·35).
    close(withOpioids.k10, 1.79 * Math.exp(-0.00286 * 35) / 6.28)
    close(withOpioids.k31, 1.11 * Math.exp(-0.0138 * 35) ** 0.75 / (273 * Math.exp(-0.0138 * 35)))
  })

  it("Paedfusor and Kataria for a 6-year-old of 20 kg", () => {
    const paed = tciParams("PAEDFUSOR", child6)
    close(paed.v1, 9.168)
    close(paed.k10, 0.1527 * 20 ** -0.3)
    expect(paed).toMatchObject({ k12: 0.114, k13: 0.0419, k21: 0.055, k31: 0.0033 })
    expect(tciParams("PAEDFUSOR", { ...child6, ageYears: 14.5 })).toMatchObject({ v1: 0.342 * 20, k10: 0.0792 })
    const kat = tciParams("KATARIA", child6)
    close(kat.v1, 8.2)
    close(kat.k10, 0.7 / 8.2)
    close(kat.k21, 1.54 / 18.7)
    close(kat.k31, 0.52 / 138)
  })

  it("Minto, Eleveld remifentanil, Gepts and Maitre", () => {
    const m = tciParams("MINTO", man40)
    close(m.v1, 5.20944)
    close(m.k10, 2.62903 / 5.20944)
    close(m.k21, 2.05 / 9.98416)
    close(m.ke0, 0.595)
    const er = tciParams("ELEVELD_REMIFENTANIL", reference)
    close(er.v1, 5.81)
    close(er.k10, 2.58 / 5.81)
    close(er.k21, 1.72 / 8.82)
    close(er.k31, 0.124 / 5.03)
    close(er.ke0, 1.09)
    const g = tciParams("GEPTS", man40)
    close(g.v1, 14.3)
    close(g.k10, 0.92 / 14.3)
    close(g.ke0, 0.112)
    const maitre = tciParams("MAITRE", { ageYears: 50, weightKg: 60, heightCm: 165, sex: "FEMALE" })
    close(maitre.v1, 7.659)
    close(maitre.k10, 0.3291 / 7.659)
    close(maitre.k31, 0.01147)
  })
})

describe("where a model applies", () => {
  it("refuses Schnider and Minto where the James lean body mass turns over", () => {
    expect(jamesLbmValid({ weightKg: 130, heightCm: 175, sex: "MALE" })).toBe(true)
    expect(jamesLbmValid({ weightKg: 140, heightCm: 175, sex: "MALE" })).toBe(false)
    expect(tciModelProblems("SCHNIDER", { ...man40, weightKg: 140 })).toContainEqual({ kind: "unavailable", reason: "lean-body-mass" })
    expect(tciModelProblems("ELEVELD_PROPOFOL", { ...man40, weightKg: 140 })).toEqual([])
  })

  it("says when the patient is outside the population the model was built on", () => {
    expect(tciModelProblems("KATARIA", { ...child6, ageYears: 2 })).toContainEqual({ kind: "outside", covariate: "age", min: 3, max: 16 })
    expect(tciModelProblems("PAEDFUSOR", child6)).toEqual([])
  })
})

// An independent check of the exact stepping: the same rates integrated by
// small Euler steps.
function euler(p: TciParams, rates: { rate: number; length: number }[], h = 0.0005): number[] {
  let [a1, a2, a3, ce] = [0, 0, 0, 0]
  for (const { rate, length } of rates) {
    for (let t = 0; t < length - 1e-12; t += h) {
      const d1 = -(p.k10 + p.k12 + p.k13) * a1 + p.k21 * a2 + p.k31 * a3 + rate
      const d2 = p.k12 * a1 - p.k21 * a2
      const d3 = p.k13 * a1 - p.k31 * a3
      const de = p.ke0 * (a1 / p.v1 - ce)
      a1 += d1 * h; a2 += d2 * h; a3 += d3 * h; ce += de * h
    }
  }
  return [a1 / p.v1, ce]
}

describe("the pump calculation", () => {
  const schnider = tciParams("SCHNIDER", man40)
  const maxRate = 10 * 20 // propofol 10 mg/mL at 1200 mL/h

  it("plasma targeting reaches the target in the first step and holds it", () => {
    const sim = simulateTci({ params: schnider, site: "PLASMA", segments: [{ startMin: 0, endMin: 30, target: 4 }], maxRate })
    close(sim.steps[1].cp, 4, 6)
    for (const step of sim.steps.slice(1)) close(step.cp, 4, 6)
    // The first step fills V1: 4 µg/mL × 4.27 L, plus what leaves in 10 s.
    expect(sim.steps[0].rate * TCI_STEP_MIN).toBeGreaterThan(4 * 4.27)
    expect(sim.steps[0].rate * TCI_STEP_MIN).toBeLessThan(4 * 4.27 * 1.15)
  })

  it("at steady state infuses clearance × target", () => {
    const sim = simulateTci({ params: schnider, site: "PLASMA", segments: [{ startMin: 0, endMin: 3000, target: 3 }], maxRate })
    const last = sim.steps[sim.steps.length - 1]
    close(last.rate, schnider.k10 * schnider.v1 * 3, 2)
  })

  it("effect-site targeting reaches the target without overshooting, near the model's time to peak", () => {
    const sim = simulateTci({ params: schnider, site: "EFFECT", segments: [{ startMin: 0, endMin: 20, target: 4 }], maxRate: 1e6 })
    const peak = Math.max(...sim.steps.map(step => step.ce), sim.end.ce)
    // Within 1%: the hand-over to plasma-style maintenance (Cp within 20%, Ce
    // within 5%) lets Ce drift a fraction past, as in the published method.
    expect(peak).toBeLessThanOrEqual(4 * 1.01)
    const reached = sim.steps.find(step => step.ce >= 4 * 0.99)!
    // Schnider's ke0 0.456/min gives a time to peak of 1.6 min (Schnider 1999).
    expect(reached.t).toBeGreaterThan(1.3)
    expect(reached.t).toBeLessThan(2.1)
    close(sim.end.ce, 4, 2)
  })

  it("is limited by what the pump can push", () => {
    const sim = simulateTci({ params: schnider, site: "PLASMA", segments: [{ startMin: 0, endMin: 5, target: 6 }], maxRate: 20 })
    expect(Math.max(...sim.steps.map(step => step.rate))).toBeLessThanOrEqual(20)
    expect(sim.steps[1].cp).toBeLessThan(6)
  })

  it("stops delivering while a lowered target is above the effect site", () => {
    const sim = simulateTci({ params: schnider, site: "EFFECT", segments: [
      { startMin: 0, endMin: 15, target: 5 }, { startMin: 15, endMin: 20, target: 2 },
    ], maxRate })
    const after = sim.steps.filter(step => step.t >= 15 && step.t < 16)
    expect(after.every(step => step.rate === 0)).toBe(true)
  })

  it("agrees with an independent Euler integration of the same rates", () => {
    const sim = simulateTci({ params: schnider, site: "EFFECT", segments: [{ startMin: 0, endMin: 10, target: 3.5 }], maxRate })
    const [cp, ce] = euler(schnider, sim.steps.map(step => ({ rate: step.rate, length: TCI_STEP_MIN })))
    expect(Math.abs(cp - sim.end.cp) / sim.end.cp).toBeLessThan(0.002)
    expect(Math.abs(ce - sim.end.ce) / sim.end.ce).toBeLessThan(0.002)
    // The amount is the sum of what was delivered.
    close(sim.amount, sim.steps.reduce((sum, step) => sum + step.rate * TCI_STEP_MIN, 0), 6)
  })

  it("handles a last step shorter than ten seconds", () => {
    const sim = simulateTci({ params: schnider, site: "PLASMA", segments: [{ startMin: 0, endMin: 1.05, target: 3 }], maxRate })
    close(sim.end.t, 1.05, 9)
    close(sim.end.cp, 3, 4)
  })
})

describe("a TCI infusion on the chart (events → totals)", () => {
  // Imported here so the earlier blocks stay about the model alone.
  const at = (minutes: number) => new Date(Date.UTC(2026, 9, 18, 8, 0) + minutes * 60_000).toISOString()

  it("is carried from its events into the chart, totalled by its model, and the pump's figure wins", async () => {
    const { projectIntraopEvents } = await import("./intraop-engine")
    const { calcInfusionTotal, deliveredInfusionVolumeMl } = await import("./intraop-totals")
    const { parseLogEvents } = await import("./intraop-types")
    const events = parseLogEvents([
      { id: "s", ts: at(0), type: "infusion_start", infId: "i", name: "Propofol", rate: "4", unit: "mcg/mL",
        concentration: "1%", tciModel: "SCHNIDER", tciSite: "EFFECT", color: "#a855f7" },
      { id: "r", ts: at(20), type: "infusion_rate", infId: "i", rate: "3", unit: "mcg/mL" },
      { id: "x", ts: at(60), type: "infusion_stop", infId: "i", pumpTotal: 61.5, pumpTotalUnit: "mL" },
    ])
    const chart = projectIntraopEvents(events, { start: at(0), openThrough: at(90) })
    const infusion = chart.infusions[0]
    expect(infusion).toMatchObject({ tciModel: "SCHNIDER", tciSite: "EFFECT", pumpTotal: 61.5, pumpTotalUnit: "mL" })

    // Calculated from the model: Schnider, 4 then 3 µg/mL at the effect site for an hour.
    const withoutPump = calcInfusionTotal({ ...infusion, pumpTotal: undefined, pumpTotalUnit: undefined }, null, null, undefined, null, man40)
    expect(withoutPump.unit).toBe("mg")
    expect(withoutPump.tci?.calculated).toBeGreaterThan(400)
    expect(withoutPump.tci?.calculated).toBeLessThan(800)
    // The pump's 61.5 mL of 10 mg/mL counts: 615 mg.
    const withPump = calcInfusionTotal(infusion, null, null, undefined, null, man40)
    expect(withPump).toMatchObject({ amount: 615, unit: "mg" })
    expect(withPump.tci).toMatchObject({ pump: 615, volumeMl: 61.5 })
    expect(deliveredInfusionVolumeMl(infusion, at(90), man40)).toBe(61.5)
  })

  it("says it cannot be totalled without the patient's age, weight, height and sex", async () => {
    const { calcInfusionTotal } = await import("./intraop-totals")
    const total = calcInfusionTotal({ name: "Remifentanil", rate: 3, unit: "ng/mL", startCol: 0, endCol: 6, tciModel: "MINTO", tciSite: "EFFECT" }, null, null)
    expect(total).toMatchObject({ amount: 0, unit: "mcg" })
    expect(total.tci).toMatchObject({ calculated: null, unavailable: "patient" })
  })
})

describe("a running TCI infusion in the timetable rows", () => {
  it("carries its model and site, and the predicted Ce rising to the target", async () => {
    const { projectIntraopEvents } = await import("./intraop-engine")
    const { runningItemsByColumn } = await import("./intraop-summary")
    const { parseLogEvents } = await import("./intraop-types")
    const t0 = Date.UTC(2026, 9, 18, 8, 0)
    const at = (minutes: number) => new Date(t0 + minutes * 60_000).toISOString()
    const chart = projectIntraopEvents(parseLogEvents([
      { id: "s", ts: at(0), type: "infusion_start", infId: "i", name: "Propofol", rate: "4", unit: "mcg/mL", tciModel: "SCHNIDER", tciSite: "EFFECT" },
      { id: "x", ts: at(30), type: "infusion_stop", infId: "i" },
    ]), { start: at(0), openThrough: at(40) })
    const rows = runningItemsByColumn(chart, [0, 1, 4], { tciPatient: man40 })
    const item = (column: number) => rows.get(column)!.find(entry => entry.kind === "infusion") as { tci?: { model: string; site: string; predicted?: number } }
    expect(item(0).tci).toMatchObject({ model: "SCHNIDER", site: "EFFECT" })
    // Ce at the end of the first five minutes is at the target, and stays there.
    expect(item(0).tci!.predicted).toBeCloseTo(4, 1)
    expect(item(4).tci!.predicted).toBeCloseTo(4, 1)
    // Without the patient there is no prediction, but it is still a TCI item.
    expect((runningItemsByColumn(chart, [1]).get(1)![0] as { tci?: { predicted?: number } }).tci?.predicted).toBeUndefined()
  })
})

describe("a TCI infusion on the case-summary chart", () => {
  it("is labelled with its site, target and model", async () => {
    const { projectIntraopEvents } = await import("./intraop-engine")
    const { buildSummaryTimetableModel } = await import("./summary-timetable")
    const { parseLogEvents } = await import("./intraop-types")
    const t0 = Date.UTC(2026, 9, 18, 8, 0)
    const at = (minutes: number) => new Date(t0 + minutes * 60_000).toISOString()
    const chart = projectIntraopEvents(parseLogEvents([
      { id: "s", ts: at(0), type: "infusion_start", infId: "i", name: "Propofol", rate: "4", unit: "mcg/mL", tciModel: "SCHNIDER", tciSite: "EFFECT" },
      { id: "x", ts: at(30), type: "infusion_stop", infId: "i" },
    ]), { start: at(0), openThrough: at(40) })
    const segment = buildSummaryTimetableModel(chart, "en").lanes.flatMap(lane => lane.segments).find(item => item.code === "Propofol")!
    expect(segment.text).toBe("Propofol Ce 4 mcg/mL · Schnider")
  })
})

describe("a TCI infusion never stopped (2026-10-19)", () => {
  it("finds the points up to a time by bisection", async () => {
    const { tciPointsUpTo } = await import("./tci")
    const points = [{ atMs: 0 }, { atMs: 10 }, { atMs: 10 }, { atMs: 20 }]
    expect([-1, 0, 10, 15, 20, 99].map(at => tciPointsUpTo(points, at))).toEqual([0, 1, 3, 3, 4, 4])
  })

  it("still gives its timetable rows quickly after eight weeks running", async () => {
    const { projectIntraopEvents } = await import("./intraop-engine")
    const { runningItemsByColumn } = await import("./intraop-summary")
    const { parseLogEvents } = await import("./intraop-types")
    const t0 = Date.UTC(2026, 7, 23, 6, 0)
    const at = (minutes: number) => new Date(t0 + minutes * 60_000).toISOString()
    const chart = projectIntraopEvents(parseLogEvents([
      { id: "s", ts: at(0), type: "infusion_start", infId: "r", name: "Remifentanil", rate: "3", unit: "ng/mL", tciModel: "MINTO", tciSite: "EFFECT" },
    ]), { start: at(0), openThrough: at(57 * 24 * 60) })
    const started = Date.now()
    const infusion = chart.infusions[0]!
    const columns = Array.from({ length: infusion.endCol - infusion.startCol + 1 }, (_, index) => infusion.startCol + index)
    const rows = runningItemsByColumn(chart, columns, { tciPatient: man40 })
    expect(Date.now() - started).toBeLessThan(5_000)
    expect(columns.length).toBeGreaterThan(1_000)
    const last = rows.get(columns[columns.length - 1]!)!.find(item => item.kind === "infusion") as { tci?: { predicted?: number } }
    expect(last.tci?.predicted).toBeCloseTo(3, 1)
  })
})

describe("found in the 2026-10-19 sweep", () => {
  it("refuses a model whose formulas give an impossible volume (Kataria in an infant)", async () => {
    const { tciModelProblems, tciModelUsable } = await import("./tci-models")
    const infant = { ageYears: 1, weightKg: 10, heightCm: 75, sex: "MALE" as const }
    expect(tciModelProblems("KATARIA", infant)).toContainEqual({ kind: "unavailable", reason: "parameters" })
    expect(tciModelUsable("KATARIA", infant)).toBe(false)
    expect(tciModelUsable("ELEVELD_PROPOFOL", infant)).toBe(true)
    expect(tciModelUsable("KATARIA", { ageYears: 8, weightKg: 25, heightCm: 128, sex: "FEMALE" })).toBe(true)
  })

  it("says so when the pump total is in mL but no syringe strength was recorded", async () => {
    const { tciTotal } = await import("./tci")
    const changes = [{ atMs: 0, target: 4 }]
    const noStrength = tciTotal({ tciModel: "SCHNIDER", tciSite: "EFFECT", pumpTotal: 60, pumpTotalUnit: "mL" }, changes, 60 * 60_000, man40)
    expect(noStrength).toMatchObject({ pump: null, volumeMl: 60, pumpNeedsStrength: true })
    expect(noStrength.amount).toBe(noStrength.calculated)
    const withStrength = tciTotal({ tciModel: "SCHNIDER", tciSite: "EFFECT", concentration: "10 mg/mL", pumpTotal: 60, pumpTotalUnit: "mL" }, changes, 60 * 60_000, man40)
    expect(withStrength).toMatchObject({ pump: 600, amount: 600 })
    expect(withStrength.pumpNeedsStrength).toBeUndefined()
  })
})
