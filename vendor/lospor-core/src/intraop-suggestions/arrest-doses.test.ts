import { describe, expect, it } from "vitest"
import type { LogEvent } from "../intraop-types"
import { applyIntraopEventOps } from "../intraop-timetable-edit"
import { arrestStatus } from "./timers"
import { approximateArrestDoses, arrestEndRespace, arrestQuickDoseOps, arrestRespaceOps, nextArrestDose, withArrestEndRespace } from "./arrest-doses"

const T0 = Date.parse("2026-11-07T10:00:00.000Z")
const at = (minutes: number) => new Date(T0 + minutes * 60_000).toISOString()
const adult = { ageDays: 40 * 365, weightKg: 80 }
const child = { ageDays: 4 * 365, weightKg: 16 }
const arrest: LogEvent = { id: "arrest-1", ts: at(0), type: "complication", label: "Cardiac arrest" }

function tap(log: LogEvent[], drug: "Epinephrine / Adrenaline" | "Amiodarone", minutes: number, patient = adult): LogEvent[] {
  return applyIntraopEventOps(log, arrestQuickDoseOps(log, arrest, drug, patient, at(minutes), "card:Cardiac arrest:adrenaline")) as LogEvent[]
}

describe("doses given during an arrest and charted afterwards", () => {
  it("writes each tap at once, 1 mg of adrenaline each, five minutes apart from the arrest, marked approximate", () => {
    let log: LogEvent[] = [arrest]
    for (let index = 0; index < 4; index += 1) log = tap(log, "Epinephrine / Adrenaline", 50)
    const doses = approximateArrestDoses(log, arrest, "Epinephrine / Adrenaline")
    expect(doses.map(dose => [dose.ts, dose.dose, dose.unit, dose.timeApproximate])).toEqual([
      [at(0), "1000", "mcg", true], [at(5), "1000", "mcg", true], [at(10), "1000", "mcg", true], [at(15), "1000", "mcg", true],
    ])
    // The arrest's follow-ups count them like any other dose.
    expect(arrestStatus(log, arrest, { patient: adult, now: at(50), dantroleneVialsMg: [20] }).adrenalineDoses).toBe(4)
  })

  it("never puts a dose in the future", () => {
    const log = tap(tap([arrest], "Epinephrine / Adrenaline", 2), "Epinephrine / Adrenaline", 2)
    expect(approximateArrestDoses(log, arrest, "Epinephrine / Adrenaline").map(dose => dose.ts)).toEqual([at(0), at(2)])
  })

  it("gives amiodarone 300 mg then 150 mg for an adult, 5 mg/kg for a child, and adrenaline 10 mcg/kg for a child", () => {
    expect(nextArrestDose("Amiodarone", 0, adult)).toEqual({ amount: 300, unit: "mg" })
    expect(nextArrestDose("Amiodarone", 1, adult)).toEqual({ amount: 150, unit: "mg" })
    expect(nextArrestDose("Amiodarone", 0, child)).toEqual({ amount: 80, unit: "mg" })
    expect(nextArrestDose("Epinephrine / Adrenaline", 0, child)).toEqual({ amount: 160, unit: "mcg" })
    expect(nextArrestDose("Epinephrine / Adrenaline", 0, { ageDays: 4 * 365, weightKg: null })).toBeNull()
  })

  it("spreads the doses across the arrest when it ends, at most five minutes apart", () => {
    let log: LogEvent[] = [arrest]
    for (let index = 0; index < 4; index += 1) log = tap(log, "Epinephrine / Adrenaline", 50)
    log = tap(tap(log, "Amiodarone", 50), "Amiodarone", 50)
    // A 12-minute arrest: four doses 3 minutes apart.
    const short = applyIntraopEventOps(log, arrestRespaceOps(log, arrest, at(12))) as LogEvent[]
    expect(approximateArrestDoses(short, arrest, "Epinephrine / Adrenaline").map(dose => dose.ts)).toEqual([at(0), at(3), at(6), at(9)])
    expect(approximateArrestDoses(short, arrest, "Amiodarone").map(dose => dose.ts)).toEqual([at(0.5), at(5.5)])
    // A 60-minute arrest: still five minutes apart, never stretched further.
    const long = applyIntraopEventOps(log, arrestRespaceOps(log, arrest, at(60))) as LogEvent[]
    expect(approximateArrestDoses(long, arrest, "Epinephrine / Adrenaline").map(dose => dose.ts)).toEqual([at(0), at(5), at(10), at(15)])
  })

  it("leaves doses charted at their real time alone", () => {
    const real: LogEvent = { id: "real", ts: at(3), type: "drug", name: "Epinephrine / Adrenaline", dose: "1000", unit: "mcg" }
    const log = tap([arrest, real], "Epinephrine / Adrenaline", 20)
    expect(arrestRespaceOps(log, arrest, at(10)).update.map(event => event.id)).not.toContain("real")
  })
})

describe("ROSC or Death logged anywhere spreads the arrest's doses", () => {
  const rosc = (minutes: number, id = "rosc-1"): LogEvent => ({ id, ts: at(minutes), type: "clinical_event", label: "ROSC" })
  const given = () => {
    let log: LogEvent[] = [arrest]
    for (let index = 0; index < 4; index += 1) log = tap(log, "Epinephrine / Adrenaline", 30)
    return log
  }

  it("spreads them when ROSC is added from the timeline, not only from the card", () => {
    const log = given()
    const ops = withArrestEndRespace(log, { add: [rosc(12)], update: [], remove: [] })
    const after = applyIntraopEventOps(log, ops) as LogEvent[]
    expect(approximateArrestDoses(after, arrest, "Epinephrine / Adrenaline").map(dose => dose.ts)).toEqual([at(0), at(3), at(6), at(9)])
  })

  it("does nothing for a re-save, an unrelated event, or a ROSC after the arrest was already closed", () => {
    const log = applyIntraopEventOps(given(), withArrestEndRespace(given(), { add: [rosc(12)], update: [], remove: [] })) as LogEvent[]
    expect(arrestEndRespace(log, log).update).toEqual([])
    const note: LogEvent = { id: "n", ts: at(13), type: "clinical_event", label: "Positioned" }
    expect(withArrestEndRespace(log, { add: [note], update: [], remove: [] }).update).toEqual([])
    expect(arrestEndRespace(log, [...log, rosc(14, "rosc-2")]).update).toEqual([])
  })

  it("keeps the card's own update when it already carries one", () => {
    const log = given()
    const card = { add: [rosc(12)], update: arrestRespaceOps(log, arrest, at(12)).update, remove: [] }
    expect(withArrestEndRespace(log, card).update).toHaveLength(card.update.length)
  })
})

describe("doses tapped after the arrest already ended", () => {
  const rosc: LogEvent = { id: "rosc-1", ts: at(12), type: "clinical_event", label: "ROSC" }

  it("lands every dose inside the arrest, spread to its end, not five minutes apart past it", () => {
    let log: LogEvent[] = [arrest, rosc]
    for (let index = 0; index < 5; index += 1) log = tap(log, "Epinephrine / Adrenaline", 50)
    const times = approximateArrestDoses(log, arrest, "Epinephrine / Adrenaline").map(dose => Date.parse(dose.ts) - Date.parse(at(0)))
    expect(times).toHaveLength(5)
    expect(Math.max(...times)).toBeLessThanOrEqual(12 * 60_000)
    expect([...times].sort((a, b) => a - b)).toEqual(times)
    expect(new Set(times).size).toBe(5)
  })

  it("keeps the old five-minute spacing while the arrest is still going", () => {
    let log: LogEvent[] = [arrest]
    for (let index = 0; index < 3; index += 1) log = tap(log, "Epinephrine / Adrenaline", 50)
    expect(approximateArrestDoses(log, arrest, "Epinephrine / Adrenaline").map(dose => dose.ts)).toEqual([at(0), at(5), at(10)])
  })

  it("does not end an arrest at a ROSC that belongs to a later one", () => {
    const second: LogEvent = { id: "arrest-2", ts: at(30), type: "complication", label: "Cardiac arrest" }
    const lateRosc: LogEvent = { id: "rosc-2", ts: at(40), type: "clinical_event", label: "ROSC" }
    let log: LogEvent[] = [arrest, second, lateRosc]
    log = tap(log, "Epinephrine / Adrenaline", 50)
    log = tap(log, "Epinephrine / Adrenaline", 50)
    expect(approximateArrestDoses(log, arrest, "Epinephrine / Adrenaline").map(dose => dose.ts)).toEqual([at(0), at(5)])
  })
})
