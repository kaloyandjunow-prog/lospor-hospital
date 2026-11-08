import { describe, expect, it } from "vitest"
import { CLINICAL_EVENT_CATS } from "../catalog/intraop-events"
import { buildSuccessionStats, likelyNext, mergeSuccession, SEED_SUCCESSION, SUCCESSION_MIN_CASES, SEQUENCE_EVENTS, type SuccessionCase } from "../event-succession"
import { applyIntraopEventOps } from "../intraop-timetable-edit"
import type { LogEvent } from "../intraop-types"
import { vitalEpisodeOps, type VitalQuestionContext } from "../vital-questions"
import { ARREST_DOSE_INTERVAL_MINUTES, approximateArrestDoses, arrestQuickDoseOps, arrestRespaceOps } from "./arrest-doses"
import { convertDoseAmount } from "./dose-units"
import { dantroleneVialPlan } from "./vial-plan"
import { at, ALL_ON } from "./scenarios"

/**
 * Properties that must hold for any input, checked on many seeded random ones: the dantrolene vial plan, the spread
 * of arrest doses, what Likely now learns and offers, how a vitals episode ends, and unit conversion.
 */

function rng(seed: number) {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

describe("the dantrolene vial plan", () => {
  const STOCKS = [[20], [120], [250], [20, 120], [20, 250], [120, 250], [20, 120, 250]]

  it("always covers the dose, wastes less than a whole smallest vial, and uses no more vials than one size needs", () => {
    const random = rng(7)
    for (let n = 0; n < 600; n++) {
      const dose = Math.round((0.5 + random() * 3000) * 10) / 10
      const stock = STOCKS[Math.floor(random() * STOCKS.length)]!
      const plan = dantroleneVialPlan(dose, stock)
      const label = `dose ${dose} stock ${stock.join("/")}`
      expect(plan.totalMg, label).toBeGreaterThanOrEqual(dose)
      expect(plan.vials.reduce((sum, item) => sum + item.size * item.count, 0), label).toBe(plan.totalMg)
      expect(plan.wasteMg, label).toBeLessThan(Math.min(...stock) + 1)
      expect(plan.count, label).toBe(plan.vials.reduce((sum, item) => sum + item.count, 0))
      expect(plan.count, label).toBeLessThanOrEqual(Math.ceil(dose / Math.min(...stock)))
      expect(plan.count, label).toBeGreaterThanOrEqual(Math.ceil((dose - 1e-9) / Math.max(...stock)))
    }
  })

  it("answers an absurd dose quickly instead of searching for ever", () => {
    const started = Date.now()
    for (const dose of [50_000, 250_000, 5_000_000]) {
      const plan = dantroleneVialPlan(dose, [20, 120, 250])
      expect(plan.totalMg).toBeGreaterThanOrEqual(dose)
    }
    expect(Date.now() - started).toBeLessThan(1500)
  })

  it("gives an empty plan for no dose, a bad dose, or no stock", () => {
    for (const dose of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) expect(dantroleneVialPlan(dose, [20, 250]).count, String(dose)).toBe(0)
    expect(dantroleneVialPlan(100, []).count).toBe(0)
    expect(dantroleneVialPlan(100, [0, -20, Number.NaN]).count).toBe(0)
  })
})

describe("arrest doses spread across the arrest", () => {
  const arrest: LogEvent = { id: "arrest", ts: at(0), type: "complication", label: "Cardiac arrest" }
  const patient = { ageDays: 40 * 365, weightKg: 80 }

  it("keeps every dose inside the arrest, in order, never more than five minutes apart", () => {
    const random = rng(11)
    for (let n = 0; n < 300; n++) {
      const taps = 1 + Math.floor(random() * 12)
      const minutes = 1 + random() * 90
      let log: LogEvent[] = [arrest]
      for (let tap = 0; tap < taps; tap++) {
        const drug = random() < 0.25 ? "Amiodarone" : "Epinephrine / Adrenaline"
        log = applyIntraopEventOps(log, arrestQuickDoseOps(log, arrest, drug, patient, at(120)))
      }
      const end = at(minutes)
      log = applyIntraopEventOps(log, arrestRespaceOps(log, arrest, end))
      for (const drug of ["Epinephrine / Adrenaline", "Amiodarone"] as const) {
        const times = approximateArrestDoses(log, arrest, drug).map(dose => Date.parse(dose.ts))
        const label = `seed 11 #${n} ${drug} x${times.length} over ${minutes.toFixed(1)} min`
        for (const time of times) {
          expect(time, label).toBeGreaterThanOrEqual(Date.parse(arrest.ts))
          expect(time, label).toBeLessThanOrEqual(Date.parse(end) + 1000)
        }
        for (let index = 1; index < times.length; index++) {
          expect(times[index]! - times[index - 1]!, label).toBeGreaterThanOrEqual(0)
          expect(times[index]! - times[index - 1]!, label).toBeLessThanOrEqual(ARREST_DOSE_INTERVAL_MINUTES * 60_000 + 1000)
        }
      }
    }
  })

  it("is steady: spreading twice moves nothing more", () => {
    let log: LogEvent[] = [arrest]
    for (let tap = 0; tap < 6; tap++) log = applyIntraopEventOps(log, arrestQuickDoseOps(log, arrest, "Epinephrine / Adrenaline", patient, at(60)))
    const once = applyIntraopEventOps(log, arrestRespaceOps(log, arrest, at(14)))
    expect(arrestRespaceOps(once, arrest, at(14)).update).toEqual([])
  })
})

describe("what Likely now learns and offers", () => {
  const labels = [...SEQUENCE_EVENTS]

  function randomCase(random: () => number, family: "general" | "neuraxial" | "block"): SuccessionCase {
    const count = Math.floor(random() * 9)
    const events = Array.from({ length: count }, (_, index) => ({ label: labels[Math.floor(random() * labels.length)]!, ts: at(index * 3 + Math.floor(random() * 3)), id: `e${index}` }))
    return { context: { family, child: random() < 0.3 }, events }
  }

  it("counts sensibly: a link never has more cases than its starting event, and a gap is a real number", () => {
    const random = rng(23)
    for (let n = 0; n < 40; n++) {
      const cases = Array.from({ length: 5 + Math.floor(random() * 60) }, () => randomCase(random, (["general", "neuraxial", "block"] as const)[Math.floor(random() * 3)]!))
      for (const link of buildSuccessionStats(cases)) {
        expect(link.count, JSON.stringify(link)).toBeGreaterThan(0)
        expect(link.count, JSON.stringify(link)).toBeLessThanOrEqual(link.total)
        expect(Number.isFinite(link.gapMinutes) && link.gapMinutes >= 0, JSON.stringify(link)).toBe(true)
      }
    }
  })

  it("offers at most two events, none already charted, most likely first, none before its usual gap", () => {
    const random = rng(31)
    for (let n = 0; n < 400; n++) {
      const cases = Array.from({ length: 40 }, () => randomCase(random, "general"))
      const links = mergeSuccession(SEED_SUCCESSION, buildSuccessionStats(cases), SUCCESSION_MIN_CASES)
      const log: LogEvent[] = Array.from({ length: Math.floor(random() * 8) }, (_, index) => ({
        id: `l${index}`, ts: at(index * 4), type: "clinical_event" as const, label: labels[Math.floor(random() * labels.length)]!,
      }))
      const now = at(40 + Math.floor(random() * 60))
      const offered = likelyNext({ log, context: { family: "general", child: false }, links, now, settings: ALL_ON })
      const label = `seed 31 #${n}`
      expect(offered.length, label).toBeLessThanOrEqual(2)
      const charted = new Set(log.map(event => event.label))
      for (const item of offered) {
        expect(charted.has(item.event), `${label} offers ${item.event}, already charted`).toBe(false)
        expect(item.probability, label).toBeGreaterThanOrEqual(0.4)
        expect(item.minutesSince, label).toBeGreaterThanOrEqual(item.gapMinutes - 1)
      }
      for (let index = 1; index < offered.length; index++) expect(offered[index - 1]!.probability, label).toBeGreaterThanOrEqual(offered[index]!.probability)
    }
  })

  it("replaces a starting event only once its own cases are enough, and keeps the rest", () => {
    const few = buildSuccessionStats(Array.from({ length: SUCCESSION_MIN_CASES - 1 }, () => ({ context: { family: "general" as const, child: false }, events: [{ label: "Positioned", ts: at(0) }, { label: "Incision", ts: at(9) }] })))
    expect(mergeSuccession(SEED_SUCCESSION, few)).toEqual([...SEED_SUCCESSION])
    const enough = buildSuccessionStats(Array.from({ length: SUCCESSION_MIN_CASES }, () => ({ context: { family: "general" as const, child: false }, events: [{ label: "Positioned", ts: at(0) }, { label: "Incision", ts: at(9) }] })))
    const merged = mergeSuccession(SEED_SUCCESSION, enough)
    expect(merged.filter(item => item.context === "general" && item.from === "Positioned")).toEqual([expect.objectContaining({ to: "Incision", count: SUCCESSION_MIN_CASES, gapMinutes: 9 })])
    expect(merged.filter(item => item.context === "neuraxial" && item.from === "Positioned")).toHaveLength(1)
  })

  it("only ever names events the app has", () => {
    const known = new Set(CLINICAL_EVENT_CATS.flatMap(category => category.events.map(event => event.label)))
    for (const link of SEED_SUCCESSION) {
      expect(known.has(link.from), link.from).toBe(true)
      expect(known.has(link.to), link.to).toBe(true)
    }
  })
})

describe("a vitals episode ends once, at a normal reading", () => {
  const context: VitalQuestionContext = { settings: ALL_ON, stats: null, ageDays: 40 * 365, keepLogging: true }
  const open: LogEvent = { id: "ep", ts: at(0), type: "complication", label: "Hypotension", complicationSource: "vitals" }

  it("ends at the first later reading back inside the limits, never before it started, and only once", () => {
    const random = rng(41)
    for (let n = 0; n < 300; n++) {
      const readings: LogEvent[] = Array.from({ length: 1 + Math.floor(random() * 8) }, (_, index) => ({
        id: `r${index}`, ts: at(index * 5 + 1), type: "vital", systolic: 40 + Math.floor(random() * 160), diastolic: 25 + Math.floor(random() * 90), heartRate: 40 + Math.floor(random() * 100),
      }))
      const log = [open, ...readings]
      const ops = vitalEpisodeOps(log, context)
      for (const ended of ops.update) {
        expect(Date.parse(ended.endTs!), `seed 41 #${n}`).toBeGreaterThan(Date.parse(open.ts))
        expect(readings.some(reading => reading.ts === ended.endTs), `seed 41 #${n} ends at a reading`).toBe(true)
      }
      const after = applyIntraopEventOps(log, ops)
      expect(vitalEpisodeOps(after, context).update, `seed 41 #${n} ends again`).toEqual([])
    }
  })

  it("is left open without a reading, and closed at the case end when one is given", () => {
    expect(vitalEpisodeOps([open], context).update).toEqual([])
    const ended = vitalEpisodeOps([open, { id: "r", ts: at(2), type: "vital", systolic: 50, diastolic: 30 }], context, at(30))
    expect(ended.update[0]?.endTs).toBe(at(30))
  })
})

describe("dose units", () => {
  it("converts mass units there and back, and refuses what it cannot convert", () => {
    const random = rng(53)
    for (let n = 0; n < 300; n++) {
      const amount = Math.round(random() * 100000) / 100
      for (const [from, to] of [["mg", "mcg"], ["g", "mg"], ["mcg", "g"]] as const) {
        const there = convertDoseAmount(amount, from, to)
        expect(there, `${amount} ${from}`).not.toBeNull()
        expect(convertDoseAmount(there!, to, from)!, `${amount} ${from} round trip`).toBeCloseTo(amount, 4)
      }
    }
    expect(convertDoseAmount(5, "mg", "mL")).toBeNull()
    expect(convertDoseAmount(5, "mL", "mL")).toBe(5)
    expect(convertDoseAmount(1, "MG", "mcg")).toBe(1000)
  })
})

