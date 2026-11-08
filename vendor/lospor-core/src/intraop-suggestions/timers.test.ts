import { describe, expect, it } from "vitest"
import type { LogEvent } from "../intraop-types"
import type { SuggestionPatient } from "./context"
import { arrestStatus, dantroleneStatus, dueTimers, lipidStatus, timerDismissOps, timerText, tourniquetStatus, type TimerContext } from "./timers"

const T0 = Date.parse("2026-11-02T10:00:00.000Z")
const at = (minutes: number) => new Date(T0 + minutes * 60_000).toISOString()
const ADULT: SuggestionPatient = { ageDays: 40 * 365, weightKg: 80 }
const CHILD: SuggestionPatient = { ageDays: 6 * 365, weightKg: 20 }

let seq = 0
const complication = (label: string, minutes = 0): LogEvent => ({ id: `c${++seq}`, ts: at(minutes), type: "complication", label })
const drug = (name: string, minutes: number, dose: string, extra: Partial<LogEvent> = {}): LogEvent => ({ id: `d${++seq}`, ts: at(minutes), type: "drug", name, dose, ...extra })
const shock = (minutes: number): LogEvent => ({ id: `s${++seq}`, ts: at(minutes), type: "defibrillation", energyJ: 200, synchronized: false })
const event = (label: string, minutes: number, extra: Partial<LogEvent> = {}): LogEvent => ({ id: `e${++seq}`, ts: at(minutes), type: "clinical_event", label, ...extra })
const ctx = (minutes: number, patient = ADULT, extra: Partial<TimerContext> = {}): TimerContext => ({ patient, now: at(minutes), dantroleneVialsMg: [20], ...extra })
const kinds = (log: LogEvent[], context: TimerContext) => dueTimers(log, context).map(item => item.kind)

describe("cardiac arrest", () => {
  it("non-shockable: adrenaline at once, then every 5 minutes; the rhythm check every 2", () => {
    const arrest = complication("Cardiac arrest", 0)
    const log = [arrest, event("CPR started", 0)]
    expect(kinds(log, ctx(0.5))).toEqual(["arrestAdrenaline"])
    expect(kinds(log, ctx(2))).toEqual(["arrestAdrenaline", "arrestRhythmCheck"])
    const given = [...log, drug("Epinephrine / Adrenaline", 1, "1000")]
    expect(kinds(given, ctx(2.5))).toEqual(["arrestRhythmCheck"])
    expect(kinds(given, ctx(5))).not.toContain("arrestAdrenaline")
    expect(kinds(given, ctx(6))).toContain("arrestAdrenaline")
  })

  it("shockable: adrenaline and amiodarone 300 mg after the 3rd shock, amiodarone 150 mg after the 5th", () => {
    const arrest = complication("Cardiac arrest", 0)
    const three = [arrest, shock(1), shock(3), shock(5)]
    const items = dueTimers(three, ctx(5.5))
    expect(items.map(item => item.kind)).toEqual(expect.arrayContaining(["arrestAdrenaline", "arrestAmiodarone"]))
    expect(items.find(item => item.kind === "arrestAmiodarone")?.dose).toMatchObject({ drug: "Amiodarone", amount: 300 })
    expect(kinds([arrest, shock(1), shock(3)], ctx(4))).not.toContain("arrestAdrenaline")
    const five = [...three, drug("Amiodarone", 6, "300"), shock(7), shock(9)]
    expect(dueTimers(five, ctx(9.5)).find(item => item.kind === "arrestAmiodarone")?.dose?.amount).toBe(150)
  })

  it("doses a child by weight", () => {
    const arrest = complication("Cardiac arrest", 0)
    const items = dueTimers([arrest], ctx(0.5, CHILD))
    expect(items.find(item => item.kind === "arrestAdrenaline")?.dose?.amount).toBe(200)
  })

  it("stops at ROSC or Death, and after Done", () => {
    const arrest = complication("Cardiac arrest", 0)
    expect(kinds([arrest, event("ROSC", 3)], ctx(10))).toEqual([])
    expect(kinds([arrest, event("Death (exitus letalis)", 3)], ctx(10))).toEqual([])
    const done: LogEvent = { id: "done", ts: at(1), type: "prompt_answer", answer: "done", answerFor: arrest.id }
    expect(kinds([arrest, done], ctx(10))).toEqual([])
    expect(arrestStatus([arrest, shock(1)], arrest, ctx(2))).toMatchObject({ shocks: 1, ended: false })
  })
})

describe("LAST", () => {
  const last = complication("Local anaesthetic systemic toxicity (LAST)", 0)
  const bolus = (minutes: number): LogEvent => ({ id: `f${++seq}`, ts: at(minutes), type: "fluid_start", name: "Lipid emulsion 20%", fluidId: `fl${seq}`, volume: "120", fluidEntryMode: "VOLUME" })

  it("offers a repeat bolus 5 minutes after the last, two repeats at most", () => {
    expect(kinds([last, bolus(1)], ctx(5))).toEqual([])
    expect(kinds([last, bolus(1)], ctx(6))).toEqual(["lastRepeatBolus"])
    expect(kinds([last, bolus(1), bolus(6), bolus(11)], ctx(30))).not.toContain("lastRepeatBolus")
  })

  it("offers doubling the infusion and warns at 12 mL/kg", () => {
    const infusion: LogEvent = { id: "inf", ts: at(2), type: "fluid_start", name: "Lipid emulsion 20%", fluidId: "lipid-rate", rate: "1200", fluidEntryMode: "RATE" }
    const items = dueTimers([last, bolus(1), infusion], ctx(8))
    expect(items.find(item => item.kind === "lastDoubleInfusion")?.dose).toMatchObject({ amount: 2400, unit: "mL/h" })
    // 120 mL bolus + 1200 mL/h for 40 minutes = 920 mL < 960
    expect(lipidStatus([last, bolus(1), infusion], last, ctx(42))).toMatchObject({ totalMl: 920, maxMl: 960, infusionRunning: true })
    expect(kinds([last, bolus(1), infusion], ctx(45))).toContain("lastMaximum")
  })
})

describe("anaphylaxis", () => {
  it("offers an infusion after two IV boluses, not after IM doses or with one running", () => {
    const reaction = complication("Anaphylaxis / allergic reaction", 0)
    const one = [reaction, drug("Epinephrine / Adrenaline", 1, "50")]
    expect(kinds(one, ctx(5))).toEqual([])
    const two = [...one, drug("Epinephrine / Adrenaline", 4, "50")]
    expect(kinds(two, ctx(5))).toEqual(["anaphylaxisInfusion"])
    expect(kinds([...one, drug("Epinephrine / Adrenaline", 4, "500", { drugRoute: "IM" })], ctx(5))).toEqual([])
    expect(kinds([...two, { id: "i", ts: at(4.5), type: "infusion_start", name: "Epinephrine / Adrenaline", infId: "a" } as LogEvent], ctx(5))).toEqual([])
  })
})

describe("malignant hyperthermia", () => {
  it("asks for dantrolene 1 mg/kg every 10 minutes, with the total in mg, mg/kg and vials", () => {
    const mh = complication("Malignant hyperthermia", 0)
    const log = [mh, drug("Dantrolene", 2, "200")]
    expect(kinds(log, ctx(11))).toEqual([])
    const [item] = dueTimers(log, ctx(12))
    expect(item).toMatchObject({ kind: "dantroleneRepeat", dose: { amount: 80, unit: "mg" } })
    expect(timerText(item!, "en")).toBe("Still signs of MH? Dantrolene 1 mg/kg 80 mg · total 200 mg (2.5 mg/kg, 10 vials)")
    expect(dantroleneStatus(log, mh, ctx(12, ADULT, { dantroleneVialsMg: [250] })).vials).toBe(1)
    // A mixed shelf: the 200 mg given is one 120 and four 20s.
    expect(dantroleneStatus(log, mh, ctx(12, ADULT, { dantroleneVialsMg: [20, 120] })).vials).toBe(5)
  })

  it("notes 10 mg/kg without blocking anything", () => {
    const mh = complication("Malignant hyperthermia", 0)
    const log = [mh, drug("Dantrolene", 2, "400"), drug("Dantrolene", 12, "400")]
    expect(kinds(log, ctx(13))).toContain("dantroleneMaximum")
  })
})

describe("tourniquet", () => {
  it("prompts at 90 and 120 minutes for an adult, 60 and 75 for a child", () => {
    const on = event("Tourniquet on", 0, { site: "rThigh" })
    expect(kinds([on], ctx(89))).toEqual([])
    expect(kinds([on], ctx(90))).toEqual(["tourniquetWarning"])
    expect(kinds([on], ctx(120))).toEqual(["tourniquetWarning", "tourniquetLimit"])
    expect(kinds([on], ctx(75, CHILD))).toEqual(["tourniquetWarning", "tourniquetLimit"])
  })

  it("keeps a timer per site and stops it at Tourniquet off", () => {
    const log = [event("Tourniquet on", 0, { site: "rThigh" }), event("Tourniquet on", 30, { site: "lThigh" }), event("Tourniquet off", 60, { site: "rThigh" })]
    const status = tourniquetStatus(log, at(100))
    expect(status.find(item => item.site === "rThigh")).toMatchObject({ running: false, minutes: 60 })
    expect(status.find(item => item.site === "lThigh")).toMatchObject({ running: true, minutes: 70 })
    expect(dueTimers(log, ctx(120)).map(item => item.site)).toEqual(["lThigh"])
  })

  it("carries the time on after a release under 10 minutes and restarts after a longer one", () => {
    const short = [event("Tourniquet on", 0, { site: "rArm" }), event("Tourniquet off", 50, { site: "rArm" }), event("Tourniquet on", 55, { site: "rArm" })]
    expect(tourniquetStatus(short, at(70))[0]).toMatchObject({ since: at(0), minutes: 70 })
    const long = [event("Tourniquet on", 0, { site: "rArm" }), event("Tourniquet off", 50, { site: "rArm" }), event("Tourniquet on", 65, { site: "rArm" })]
    expect(tourniquetStatus(long, at(70))[0]).toMatchObject({ since: at(65), minutes: 5 })
  })

  it("asks to log Tourniquet off at procedure end or case end", () => {
    const on = event("Tourniquet on", 0, { site: "lCalf" })
    expect(kinds([on, event("Procedure ended", 40)], ctx(41))).toEqual(["tourniquetStillOn"])
    expect(kinds([on], ctx(41, ADULT, { endedAt: at(40) }))).toEqual(["tourniquetStillOn"])
  })

  it("dismisses one item, not the next one due", () => {
    const on = event("Tourniquet on", 0, { site: "rThigh" })
    const [warning] = dueTimers([on], ctx(90))
    const dismissal = timerDismissOps(warning!, at(91)).add
    expect(kinds([on, ...dismissal], ctx(100))).toEqual([])
    expect(kinds([on, ...dismissal], ctx(121))).toEqual(["tourniquetLimit"])
    expect(timerText(warning!, "bg")).toBe("Турникет 90 min")
  })
})

describe("the vials on the MH card from the log (10.2.0)", () => {
  it("plans the dose in hand from this patient's weight and counts the vials already opened", async () => {
    const { dantroleneCardVials } = await import("./timers")
    const mh = complication("Malignant hyperthermia", 0)
    const log = [mh, drug("Dantrolene", 2, "200")]
    const view = dantroleneCardVials(log, mh, ctx(12, ADULT, { dantroleneVialsMg: [20, 120] }), 1)!
    expect(view).toMatchObject({ weightKg: 80, doseMg: 80, givenMg: 200, openedVials: 5 })
    expect(view.plan.vials).toEqual([{ size: 20, count: 4 }])
    expect(view.openedWithThis).toBe(9)
    expect(dantroleneCardVials(log, mh, ctx(12, { ageDays: 40 * 365, weightKg: null }), 1)).toBeNull()
  })
})
