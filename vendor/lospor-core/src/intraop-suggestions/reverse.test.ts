import { describe, expect, it } from "vitest"
import type { LogEvent } from "../intraop-types"
import { massiveBloodLoss, reverseAnswerOps, reverseQuestions } from "./reverse"
import type { SuggestionPatient } from "./context"

const T0 = Date.parse("2026-11-02T10:00:00.000Z")
const at = (minutes: number) => new Date(T0 + minutes * 60_000).toISOString()
const ADULT: SuggestionPatient = { ageDays: 40 * 365, weightKg: 80 }
const CHILD: SuggestionPatient = { ageDays: 6 * 365, weightKg: 20 }

let seq = 0
const drug = (name: string, minutes: number, dose = "1", extra: Partial<LogEvent> = {}): LogEvent => ({ id: `d${++seq}`, ts: at(minutes), type: "drug", name, dose, ...extra })
const fluid = (name: string, minutes: number): LogEvent => ({ id: `f${++seq}`, ts: at(minutes), type: "fluid_start", name, fluidId: `fl${seq}` })
const shock = (minutes: number, synchronized: boolean): LogEvent => ({ id: `s${++seq}`, ts: at(minutes), type: "defibrillation", energyJ: 150, synchronized })
const complication = (label: string, minutes: number): LogEvent => ({ id: `c${++seq}`, ts: at(minutes), type: "complication", label })
const rules = (log: LogEvent[], patient = ADULT, bloodLossMl?: number) => reverseQuestions(log, { patient, bloodLossMl }).map(question => question.rule)

describe("reverse questions", () => {
  it("asks for each strong signal", () => {
    expect(rules([fluid("Lipid emulsion 20%", 0)])).toEqual(["lipid"])
    expect(rules([drug("Dantrolene", 0, "200")])).toEqual(["dantrolene"])
    expect(rules([drug("Adenosine", 0, "6")])).toEqual(["adenosine"])
    expect(rules([drug("Amiodarone", 0, "300")])).toEqual(["amiodarone"])
    expect(rules([drug("Salbutamol / Albuterol", 0, "0.4")])).toEqual(["salbutamol"])
    expect(rules([drug("Naloxone", 0, "40")])).toEqual(["antidote"])
  })

  it("offers the right picks after a shock", () => {
    expect(reverseQuestions([shock(0, false)], { patient: ADULT })[0]?.choices).toEqual(["Ventricular fibrillation", "Ventricular tachycardia", "Cardiac arrest"])
    expect(reverseQuestions([shock(0, true)], { patient: ADULT })[0]?.choices).toEqual(["Atrial fibrillation", "Supraventricular arrhythmia", "Ventricular tachycardia"])
  })

  it("never asks after glucagon, a small adrenaline bolus, a vasopressor or hypertonic saline", () => {
    expect(rules([drug("Glucagon", 0), drug("Epinephrine / Adrenaline", 1, "50"), drug("Ephedrine", 2, "10"), drug("Sodium chloride hypertonic (3%)", 3, "150")])).toEqual([])
  })

  it("asks about arrest only after a 1 mg adrenaline (10 mcg/kg in a child), never after an IM dose", () => {
    expect(rules([drug("Epinephrine / Adrenaline", 0, "1000")])).toEqual(["arrestAdrenaline"])
    expect(rules([drug("Epinephrine / Adrenaline", 0, "500", { drugRoute: "IM" })])).toEqual([])
    expect(rules([drug("Epinephrine / Adrenaline", 0, "200")], CHILD)).toEqual(["arrestAdrenaline"])
    expect(rules([drug("Epinephrine / Adrenaline", 0, "20")], CHILD)).toEqual([])
  })

  it("asks about CICO only after a rescue dose of sugammadex", () => {
    expect(rules([drug("Sugammadex", 0, "160")])).toEqual([])
    expect(rules([drug("Sugammadex", 0, "1300")])).toEqual(["rescueSugammadex"])
    // The rescue dose is 16 mg/kg: 15 mg/kg is not asked about, 16 is (80 kg).
    expect(rules([drug("Sugammadex", 0, "1200")])).toEqual([])
    expect(rules([drug("Sugammadex", 0, "1280")])).toEqual(["rescueSugammadex"])
  })

  it("asks about hyperkalaemia when calcium and insulin come within 15 minutes", () => {
    expect(rules([drug("Calcium chloride", 0, "1000"), drug("Regular insulin / Actrapid", 10, "10")])).toEqual(["calciumInsulin"])
    expect(rules([drug("Calcium chloride", 0, "1000"), drug("Regular insulin / Actrapid", 20, "10")])).toEqual([])
  })

  it("asks about massive haemorrhage at the fourth unit of red cells within an hour, or after a second uterotonic", () => {
    const units = [0, 10, 20].map(minutes => fluid("Packed red blood cells (PRBC)", minutes))
    expect(rules(units)).toEqual([])
    expect(rules([...units, fluid("Packed red blood cells (PRBC)", 50)])).toEqual(["massiveTransfusion"])
    expect(rules([...units, fluid("Packed red blood cells (PRBC)", 70)])).toEqual([])
    expect(rules([drug("Oxytocin", 0, "5"), drug("Carboprost", 15, "0.25")])).toEqual(["secondUterotonic"])
    expect(rules([drug("Carboprost", 15, "0.25")])).toEqual([])
  })

  it("asks about massive haemorrhage when blood loss passes 1,500 mL (40 mL/kg in a child)", () => {
    expect(massiveBloodLoss(1500, ADULT)).toBe(true)
    expect(massiveBloodLoss(1400, ADULT)).toBe(false)
    expect(massiveBloodLoss(800, CHILD)).toBe(true)
    expect(massiveBloodLoss(700, CHILD)).toBe(false)
    expect(rules([drug("Ephedrine", 0, "10")], ADULT, 1600)).toEqual(["massiveTransfusion"])
  })

  it("stays quiet when the complication is already logged nearby", () => {
    expect(rules([complication("Local anaesthetic systemic toxicity (LAST)", 5), fluid("Lipid emulsion 20%", 10)])).toEqual([])
    expect(rules([complication("LAST", 5), fluid("Lipid emulsion 20%", 10)])).toEqual([])
    expect(rules([complication("Local anaesthetic systemic toxicity (LAST)", -60), fluid("Lipid emulsion 20%", 10)])).toEqual(["lipid"])
  })

  it("asks once, for the newest trigger of a rule", () => {
    const questions = reverseQuestions([drug("Adenosine", 0, "6"), drug("Adenosine", 2, "12")], { patient: ADULT })
    expect(questions).toHaveLength(1)
    expect(questions[0]!.trigger.dose).toBe("12")
  })

  it("logs the pick at the trigger's time, flagged as from a suggestion", () => {
    const trigger = fluid("Lipid emulsion 20%", 0)
    const [question] = reverseQuestions([trigger], { patient: ADULT })
    const ops = reverseAnswerOps(question!, { log: "Local anaesthetic systemic toxicity (LAST)" }, at(1))
    expect(ops.add[0]).toMatchObject({ type: "complication", ts: trigger.ts, label: "Local anaesthetic systemic toxicity (LAST)", complicationSource: "suggestion", suggestion: "reverse:lipid" })
    expect(reverseAnswerOps(question!, { log: "Hypotension" }, at(1)).add).toEqual([])
  })

  it("after Not now, does not ask again for that rule within 30 minutes", () => {
    const first = drug("Adenosine", 0, "6")
    const [question] = reverseQuestions([first], { patient: ADULT })
    const dismissal = reverseAnswerOps(question!, "not_now", at(1)).add
    expect(rules([first, ...dismissal])).toEqual([])
    expect(rules([first, ...dismissal, drug("Adenosine", 10, "12")])).toEqual([])
    expect(rules([first, ...dismissal, drug("Adenosine", 45, "6")])).toEqual(["adenosine"])
  })
})
