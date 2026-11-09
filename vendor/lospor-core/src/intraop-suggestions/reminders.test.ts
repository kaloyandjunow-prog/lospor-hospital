import { describe, expect, it } from "vitest"
import type { LabResult } from "../labs"
import type { LogEvent } from "../intraop-types"
import type { SuggestionPatient } from "./context"
import {
  glucoseReminder,
  latexBanner,
  localAnaestheticBudget,
  localAnaestheticBudgetText,
  localAnaestheticCheck,
  mhHistoryWarning,
  ponvReminder,
  ponvReminderText,
  reminderDismissOps,
} from "./reminders"

const T0 = Date.parse("2026-11-02T10:00:00.000Z")
const at = (minutes: number) => new Date(T0 + minutes * 60_000).toISOString()
const ADULT: SuggestionPatient = { ageDays: 40 * 365, weightKg: 90, idealWeightKg: 70 }

let seq = 0
const bolus = (name: string, minutes: number, dose: string, unit: string, extra: Partial<LogEvent> = {}): LogEvent =>
  ({ id: `d${++seq}`, ts: at(minutes), type: "drug", name, dose, unit, ...extra })
const event = (label: string, minutes: number): LogEvent => ({ id: `e${++seq}`, ts: at(minutes), type: "clinical_event", label })

describe("E2: the local anaesthetic maximum", () => {
  it("works the maximum out on ideal weight and counts mL by strength", () => {
    const budget = localAnaestheticBudget([bolus("Bupivacaine", 0, "20", "mL", { concentration: "0.5%", drugRoute: "PERINEURAL" })], ADULT, at(5))!
    expect(budget).toMatchObject({ weightKg: 70, basis: "IBW" })
    expect(budget.drugs).toEqual([{ drug: "Bupivacaine", mg: 100, maxMg: 140 }])
    expect(budget.fraction).toBeCloseTo(100 / 140)
    expect(localAnaestheticBudgetText(budget, "Bupivacaine", "en")).toBe("Total so far: 100 mg of 140 mg max")
    expect(localAnaestheticBudgetText(budget, "Bupivacaine", "bg")).toBe("Общо досега: 100 mg от максимум 140 mg")
  })

  it("adds drugs together as shares of each one's maximum", () => {
    const log = [
      bolus("Lidocaine", 0, "157.5", "mg"),
      bolus("Ropivacaine", 1, "20", "mL", { concentration: "0.5%" }),
    ]
    const budget = localAnaestheticBudget(log, ADULT, at(5))!
    // Lidocaine 157.5 of 315 (0.5) + ropivacaine 100 of 210 (0.48)
    expect(budget.fraction).toBeCloseTo(0.5 + 100 / 210)
    expect(localAnaestheticBudgetText(budget, "Lidocaine", "en")).toContain("all local anaesthetics: 98% of the maximum")
  })

  it("leaves intrathecal doses out", () => {
    const budget = localAnaestheticBudget([bolus("Bupivacaine", 0, "15", "mg", { drugRoute: "IT" })], ADULT, at(5))!
    expect(budget.drugs).toEqual([])
  })

  it("counts a running infusion by its rate and strength", () => {
    const start: LogEvent = { id: "i1", ts: at(0), type: "infusion_start", infId: "la", name: "Ropivacaine", rate: "10", unit: "mL/hr", concentration: "0.2%" }
    const budget = localAnaestheticBudget([start], ADULT, at(120))!
    // 2 h × 10 mL/h × 2 mg/mL = 40 mg
    expect(budget.drugs[0]).toMatchObject({ drug: "Ropivacaine", mg: 40 })
  })

  it("warns before a dose that would go over, and counts doses of unknown strength apart", () => {
    const given = [bolus("Bupivacaine", 0, "120", "mg")]
    const check = localAnaestheticCheck(given, ADULT, bolus("Bupivacaine", 5, "8", "mL", { concentration: "0.5%" }))!
    expect(check.doseMg).toBe(40)
    expect(check.wouldExceed).toBe(true)
    expect(localAnaestheticCheck(given, ADULT, bolus("Bupivacaine", 5, "2", "mL", { concentration: "0.5%" }))!.wouldExceed).toBe(false)
    expect(localAnaestheticBudget([bolus("Lidocaine", 0, "5", "mL")], ADULT, at(5))!.uncounted).toBe(1)
  })

  it("needs a weight, and ignores drugs without a maximum", () => {
    expect(localAnaestheticBudget([], { ageDays: 40 * 365, weightKg: null }, at(0))).toBeNull()
    expect(localAnaestheticCheck([], ADULT, bolus("Propofol", 0, "100", "mg"))).toBeNull()
  })
})

describe("P1, P4: the MH warning and the latex banner", () => {
  it("warns on a volatile or suxamethonium only with an MH history", () => {
    const sevo = { type: "agent_start" as const, name: "SEVOFLURANE" }
    const sux = { type: "drug" as const, name: "Succinylcholine / Suxamethonium", atcCode: "M03AB01" }
    expect(mhHistoryWarning({ mhHistory: true }, sevo)).toBe(true)
    expect(mhHistoryWarning({ mhHistory: true }, sux)).toBe(true)
    expect(mhHistoryWarning({ mhHistory: true }, { type: "drug", name: "Propofol", atcCode: "N01AX10" })).toBe(false)
    expect(mhHistoryWarning({}, sevo)).toBe(false)
  })

  it("shows the latex banner in the screen's language", () => {
    expect(latexBanner({ latexAllergy: true }, "en")).toBe("Latex allergy")
    expect(latexBanner({ latexAllergy: true }, "bg")).toBe("Алергия към латекс")
    expect(latexBanner({}, "en")).toBeNull()
  })
})

describe("E5 / P3: ПОГП at procedure end", () => {
  it("asks at Procedure ended for Apfel 2 or more, or a history, when no antiemetic was given", () => {
    const log = [event("Procedure ended", 0)]
    expect(ponvReminder(log, { apfelScore: 3 })).toMatchObject({ kind: "ponv", apfel: 3 })
    expect(ponvReminder(log, { ponvHistory: true })).not.toBeNull()
    expect(ponvReminder(log, { apfelScore: 1 })).toBeNull()
    expect(ponvReminder([bolus("Ondansetron", -30, "4", "mg"), ...log], { apfelScore: 3 })).toBeNull()
    expect(ponvReminder([], { apfelScore: 3 })).toBeNull()
  })

  it("says PONV in English and ПОГП in Bulgarian", () => {
    const reminder = ponvReminder([event("Procedure ended", 0)], { apfelScore: 2 })!
    expect(ponvReminderText(reminder, "en")).toBe("Apfel 2, no antiemetic given: give PONV prophylaxis?")
    expect(ponvReminderText(reminder, "bg")).toBe("Apfel 2, не е даден антиеметик: профилактика на ПОГП?")
  })

  it("stays dismissed for that procedure end", () => {
    const log = [event("Procedure ended", 0)]
    const dismissal = reminderDismissOps(ponvReminder(log, { apfelScore: 3 })!, at(1)).add
    expect(ponvReminder([...log, ...dismissal], { apfelScore: 3 })).toBeNull()
  })
})

describe("P2: the diabetes glucose check", () => {
  const glucose = (minutes: number): LabResult => ({ test: "Glucose", value: "7", unit: "mmol/L", takenAt: at(minutes) })

  it("asks two hours after the start, or after the last glucose", () => {
    expect(glucoseReminder({ diabetes: true }, [], [], at(0), at(119))).toBeNull()
    expect(glucoseReminder({ diabetes: true }, [], [], at(0), at(120))).not.toBeNull()
    expect(glucoseReminder({ diabetes: true }, [glucose(60)], [], at(0), at(150))).toBeNull()
    expect(glucoseReminder({}, [], [], at(0), at(300))).toBeNull()
  })

  it("asks again two hours after a Not now", () => {
    const reminder = glucoseReminder({ diabetes: true }, [], [], at(0), at(130))!
    const dismissal = reminderDismissOps(reminder, at(130)).add
    expect(glucoseReminder({ diabetes: true }, [], dismissal, at(0), at(200))).toBeNull()
    expect(glucoseReminder({ diabetes: true }, [], dismissal, at(0), at(250))).not.toBeNull()
  })
})
