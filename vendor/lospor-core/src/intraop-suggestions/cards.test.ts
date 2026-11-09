import { describe, expect, it } from "vitest"
import { CLINICAL_EVENT_CATS, DRUG_CATALOG, FLUID_CATALOG, INFUSION_CATALOG, parseDoseProfile } from "../catalog"
import { normalizeAdministrationRoute } from "../clinical-rule-vocabulary"
import { ALL_COMPLICATIONS } from "../complications"
import type { LogEvent } from "../intraop-types"
import { resolveCard, type ResolvedCard } from "./cards"
import { SUGGESTION_CARDS, suggestionCardFor } from "./catalogue"
import type { SuggestionPatient, SuggestionPreop } from "./context"

const T0 = Date.parse("2026-11-02T10:00:00.000Z")
const at = (minutes: number) => new Date(T0 + minutes * 60_000).toISOString()

const ADULT: SuggestionPatient = { ageDays: 40 * 365, weightKg: 80, idealWeightKg: 70 }
const CHILD_20KG: SuggestionPatient = { ageDays: 6 * 365, weightKg: 20 }

let seq = 0
const complication = (label: string, minutes = 0): LogEvent => ({ id: `c${++seq}`, ts: at(minutes), type: "complication", label })
const drug = (name: string, minutes: number, dose = "1", extra: Partial<LogEvent> = {}): LogEvent => ({ id: `d${++seq}`, ts: at(minutes), type: "drug", name, dose, ...extra })
const vital = (minutes: number, values: Partial<LogEvent>): LogEvent => ({ id: `v${++seq}`, ts: at(minutes), type: "vital", ...values })

function card(label: string, options: { patient?: SuggestionPatient; log?: LogEvent[]; preop?: SuggestionPreop; tofMonitor?: boolean; now?: number; minutes?: number } = {}): ResolvedCard {
  const event = complication(label, options.minutes ?? 0)
  const def = suggestionCardFor(label)
  if (!def) throw new Error(`no card for ${label}`)
  return resolveCard(def, {
    log: [...(options.log ?? []), event],
    patient: options.patient ?? ADULT,
    preop: options.preop ?? {},
    complication: event,
    tofMonitor: options.tofMonitor ?? false,
    now: options.now ?? T0 + 60_000,
  })
}
const row = (resolved: ResolvedCard, id: string) => resolved.rows.find(item => item.id === id)
const amount = (resolved: ResolvedCard, id: string) => row(resolved, id)?.prefill?.amount

describe("the card catalogue", () => {
  const drugNames = new Set(DRUG_CATALOG.map(entry => entry.name))
  const fluidNames = new Set(FLUID_CATALOG.map(entry => entry.name))
  const infusionNames = new Set(INFUSION_CATALOG.map(entry => entry.name))
  const eventLabels = new Set(CLINICAL_EVENT_CATS.flatMap(category => category.events.map(event => event.label)))

  it("names only complications, drugs, fluids, infusions and events that exist", () => {
    for (const def of SUGGESTION_CARDS) {
      for (const name of def.complications) expect(ALL_COMPLICATIONS, name).toContain(name)
      for (const item of def.rows) {
        if (item.kind === "drug") {
          expect(drugNames.has(item.drug), item.drug).toBe(true)
          if (item.route) {
            const entry = DRUG_CATALOG.find(candidate => candidate.name === item.drug)!
            const routes = parseDoseProfile(entry.name, "bolus", entry.profile).routes.map(route => normalizeAdministrationRoute(route) ?? route)
            expect(routes, `${item.drug} ${item.route}`).toContain(item.route)
          }
        }
        if (item.kind === "infusion") expect(infusionNames.has(item.drug), item.drug).toBe(true)
        if (item.kind === "fluid" && item.fluid) expect(fluidNames.has(item.fluid), item.fluid).toBe(true)
        if (item.kind === "event") expect(eventLabels.has(item.label), item.label).toBe(true)
        if (item.kind === "relabel" || item.kind === "alsoLog") {
          for (const name of item.kind === "relabel" ? item.choices : item.complications) expect(ALL_COMPLICATIONS, name).toContain(name)
        }
        if (item.kind === "openCard") expect(suggestionCardFor(item.complication), item.complication).toBeDefined()
      }
    }
  })

  it("has no card for the complications agreed to have none", () => {
    for (const name of ["Hypothermia", "Hyperthermia", "Hypernatraemia", "TRALI (transfusion-related acute lung injury)", "Drug error",
      "Serotonin syndrome", "Circuit disconnection", "Injury to organ", "Compartment syndrome", "Aspiration"]) {
      expect(suggestionCardFor(name), name).toBeUndefined()
    }
  })

  it("finds a card by its quick-button name", () => {
    expect(suggestionCardFor("LAST")?.kind).toBe("checklist")
  })

  it("uses checklists for the agreed multi-step protocols", () => {
    for (const name of ["Cardiac arrest", "Local anaesthetic systemic toxicity (LAST)", "Malignant hyperthermia",
      "Anaphylaxis / allergic reaction", "Latex reaction", "Massive haemorrhage", "Hyperkalaemia"]) {
      expect(suggestionCardFor(name)?.kind, name).toBe("checklist")
    }
  })
})

describe("doses for adults and children", () => {
  it("hypotension: the adult doses, and weight-based for a child", () => {
    const adult = card("Hypotension")
    expect([amount(adult, "ephedrine"), amount(adult, "phenylephrine"), amount(adult, "metaraminol")]).toEqual([10, 100, 0.5])
    const child = card("Hypotension", { patient: CHILD_20KG })
    expect([amount(child, "ephedrine"), amount(child, "phenylephrine"), amount(child, "metaraminol")]).toEqual([2, 20, 0.2])
  })

  it("caps a child's suggestion at the adult dose", () => {
    const big = card("Hypotension", { patient: { ageDays: 15 * 365, weightKg: 120 } })
    expect(amount(big, "ephedrine")).toBe(10)
    expect(amount(big, "phenylephrine")).toBe(100)
  })

  it("opens the sheet empty when a child has no weight", () => {
    expect(amount(card("Hypotension", { patient: { ageDays: 6 * 365, weightKg: null } }), "ephedrine")).toBeNull()
  })

  it("hypertension: nitroglycerin for adults only, esmolol without a dose for children", () => {
    const child = card("Hypertension", { patient: CHILD_20KG })
    expect(row(child, "nitroglycerin")).toBeUndefined()
    expect(amount(child, "esmolol")).toBeNull()
    expect(amount(child, "labetalol")).toBe(4)
    expect(amount(card("Hypertension"), "esmolol")).toBe(40)
  })

  it("laryngospasm: suxamethonium to the nearest 10 mg from 10 kg, the next whole mg below; atropine for children only", () => {
    expect(amount(card("Laryngospasm"), "suxamethonium")).toBe(40)
    expect(amount(card("Laryngospasm", { patient: { ageDays: 300, weightKg: 8.4 } }), "suxamethonium")).toBe(5)
    expect(amount(card("Laryngospasm", { patient: CHILD_20KG }), "suxamethonium")).toBe(10)
    expect(row(card("Laryngospasm"), "atropine")).toBeUndefined()
    expect(amount(card("Laryngospasm", { patient: CHILD_20KG }), "atropine")).toBe(0.2)
  })

  it("anaphylaxis: 50 mcg IV for adults and 1 mcg/kg under 12; 500 mcg IM, 10 mcg/kg in children", () => {
    const adult = card("Anaphylaxis / allergic reaction")
    expect(amount(adult, "adrenaline-iv")).toBe(50)
    expect(amount(adult, "adrenaline-im")).toBe(500)
    expect(amount(adult, "crystalloid")).toBe(500)
    const child = card("Anaphylaxis / allergic reaction", { patient: CHILD_20KG })
    expect(amount(child, "adrenaline-iv")).toBe(20)
    expect(amount(child, "adrenaline-im")).toBe(200)
    expect(amount(child, "crystalloid")).toBe(400)
    const teen = card("Anaphylaxis / allergic reaction", { patient: { ageDays: 14 * 365, weightKg: 50 } })
    expect(amount(teen, "adrenaline-iv")).toBe(50)
  })

  it("hypoglycaemia: 40% for adults, 10% for children, glucagon by weight in children", () => {
    const adult = card("Hypoglycaemia")
    expect(row(adult, "glucose")?.prefill).toMatchObject({ fluid: "Glucose", concentration: "40%", amount: 50 })
    const child = card("Hypoglycaemia", { patient: CHILD_20KG })
    expect(row(child, "glucose")?.prefill).toMatchObject({ concentration: "10%", amount: 40 })
    expect(amount(child, "glucagon")).toBe(0.5)
    expect(amount(card("Hypoglycaemia", { patient: { ageDays: 10 * 365, weightKg: 30 } }), "glucagon")).toBe(1)
  })

  it("LAST: lipid 1.5 mL/kg as a bolus and 15 mL/kg/h as a rate, weight-based for everyone", () => {
    const resolved = card("Local anaesthetic systemic toxicity (LAST)")
    expect(row(resolved, "lipid-bolus")?.prefill).toMatchObject({ fluid: "Lipid emulsion 20%", amount: 120, mode: "VOLUME" })
    expect(row(resolved, "lipid-infusion")?.prefill).toMatchObject({ amount: 1200, mode: "RATE", unit: "mL/h" })
  })

  it("massive haemorrhage: adult bags, child mL/kg; no tranexamic acid under 4 weeks", () => {
    const adult = card("Massive haemorrhage")
    expect([amount(adult, "rbc"), amount(adult, "ffp"), amount(adult, "platelets"), amount(adult, "cryo")]).toEqual([250, 250, 300, 100])
    const child = card("Massive haemorrhage", { patient: CHILD_20KG })
    expect([amount(child, "rbc"), amount(child, "ffp"), amount(child, "platelets"), amount(child, "cryo")]).toEqual([300, 300, 200, 100])
    expect(row(card("Massive haemorrhage", { patient: { ageDays: 10, weightKg: 3.5 } }), "tranexamic-acid")).toBeUndefined()
  })

  it("hyperglycaemia: the bolus opens empty; the infusion starts at 2 IU/h or 0.05 IU/kg/h", () => {
    expect(amount(card("Hyperglycaemia"), "insulin-bolus")).toBeNull()
    expect(amount(card("Hyperglycaemia"), "insulin-infusion")).toBe(2)
    expect(amount(card("Hyperglycaemia", { patient: CHILD_20KG }), "insulin-infusion")).toBe(1)
  })
})

describe("rows under conditions", () => {
  it("CICO: sugammadex only after rocuronium or vecuronium; scalpel over 8 years, needle at 8 or less", () => {
    expect(row(card("CICO (can't intubate can't oxygenate)"), "sugammadex-rescue")).toBeUndefined()
    const afterRocuronium = card("CICO (can't intubate can't oxygenate)", { log: [drug("Rocuronium", -10, "50", { atcCode: "M03AC09" })] })
    expect(amount(afterRocuronium, "sugammadex-rescue")).toBe(1300)
    expect(row(afterRocuronium, "cricothyrotomy")).toBeDefined()
    expect(row(afterRocuronium, "needle-cricothyrotomy")).toBeUndefined()
    const child = card("CICO (can't intubate can't oxygenate)", { patient: { ageDays: 5 * 365, weightKg: 18 } })
    expect(row(child, "needle-cricothyrotomy")).toBeDefined()
    expect(row(child, "cricothyrotomy")).toBeUndefined()
  })

  it("ischaemia: a beta-blocker only when the heart rate is over 80", () => {
    expect(row(card("Myocardial ischaemia", { log: [vital(-2, { heartRate: 72 })] }), "metoprolol")).toBeUndefined()
    expect(amount(card("Myocardial ischaemia", { log: [vital(-2, { heartRate: 110 })] }), "metoprolol")).toBe(5)
  })

  it("high spinal: atropine only when the heart rate is below the bradycardia limit", () => {
    expect(row(card("High spinal", { log: [vital(-1, { heartRate: 70 })] }), "atropine")).toBeUndefined()
    expect(row(card("High spinal", { log: [vital(-1, { heartRate: 44 })] }), "atropine")).toBeDefined()
  })

  it("anaphylaxis: glucagon only for a patient on a beta-blocker", () => {
    expect(row(card("Anaphylaxis / allergic reaction"), "glucagon")).toBeUndefined()
    expect(row(card("Anaphylaxis / allergic reaction", { preop: { betaBlocker: true } }), "glucagon")).toBeDefined()
  })

  it("residual blockade: sugammadex after a steroidal relaxant, neostigmine after any non-depolarising one", () => {
    const cisatracurium = card("Residual neuromuscular blockade", { log: [drug("Cisatracurium", -30, "10", { atcCode: "M03AC11" })] })
    expect(row(cisatracurium, "sugammadex")).toBeUndefined()
    expect(amount(cisatracurium, "neostigmine")).toBe(3.5)
    expect(row(cisatracurium, "glycopyrrolate")).toBeDefined()
    const rocuronium = card("Residual neuromuscular blockade", { log: [drug("Rocuronium", -30, "50", { atcCode: "M03AC09" })] })
    expect(amount(rocuronium, "sugammadex")).toBe(160)
  })

  it("delayed emergence: reversal only with a steroidal relaxant, TOF monitoring and the last ratio under 0.9", () => {
    const log = [drug("Rocuronium", -60, "50", { atcCode: "M03AC09" }), vital(-1, { tofRatio: 0.6 })]
    expect(row(card("Delayed emergence", { log }), "sugammadex")).toBeUndefined()
    expect(row(card("Delayed emergence", { log, tofMonitor: true }), "sugammadex")).toBeDefined()
    expect(row(card("Delayed emergence", { log: [log[0]!, vital(-1, { tofRatio: 0.95 })], tofMonitor: true }), "sugammadex")).toBeUndefined()
    expect(row(card("Delayed emergence"), "glucose")).toBeDefined()
  })

  it("medication overdose: only the antidotes for drugs charted; flumazenil from 1 year", () => {
    const opioid = card("Drug overdose", { log: [drug("Fentanyl", -20, "100", { atcCode: "N01AH01" })] })
    expect(row(opioid, "naloxone")).toBeDefined()
    expect(row(opioid, "flumazenil")).toBeUndefined()
    const infant = card("Drug overdose", { patient: { ageDays: 200, weightKg: 7 }, log: [drug("Midazolam", -20, "0.5", { atcCode: "N05CD08" })] })
    expect(row(infant, "flumazenil")).toBeUndefined()
    expect(row(card("Drug overdose", { log: [drug("Bupivacaine", -20, "10", { atcCode: "N01BB01" })] }), "is-last")).toBeDefined()
  })

  it("FNHTR: 'Is this malignant hyperthermia?' only when a trigger was charted", () => {
    expect(row(card("Febrile non-haemolytic transfusion reaction"), "is-mh")).toBeUndefined()
    const sevo: LogEvent = { id: "a1", ts: at(-60), type: "agent_start", name: "SEVOFLURANE", agentMode: "concurrent" }
    expect(row(card("Febrile non-haemolytic transfusion reaction", { log: [sevo] }), "is-mh")).toBeDefined()
  })

  it("VT: the three branches carry their own rows", () => {
    const resolved = card("Ventricular tachycardia")
    expect(resolved.branches?.options.map(option => option.id)).toEqual(["pulseless", "unstable", "stable"])
    expect(row(resolved, "cardiac-arrest")?.branches).toEqual(["pulseless"])
    expect(row(resolved, "cardioversion")?.branches).toEqual(["unstable"])
    expect(row(resolved, "amiodarone")?.branches).toEqual(["unstable", "stable"])
  })
})

describe("what was given since the complication", () => {
  it("marks a row used, with the last dose, only for doses after the onset", () => {
    const before = drug("Ephedrine", -5, "6", { unit: "mg" })
    const afterDose = drug("Ephedrine", 2, "10", { unit: "mg" })
    const resolved = card("Hypotension", { log: [before, afterDose] })
    expect(row(resolved, "ephedrine")?.used).toMatchObject({ count: 1, lastAmount: "10", lastUnit: "mg" })
    expect(row(resolved, "phenylephrine")?.used).toBeNull()
  })

  it("steps adenosine 6 → 12 → 18 within an episode and starts again after 30 minutes", () => {
    const steps = (log: LogEvent[], now = T0 + 20 * 60_000) => amount(card("Supraventricular arrhythmia", { log, now }), "adenosine")
    expect(steps([])).toBe(6)
    expect(steps([drug("Adenosine", 1, "6")])).toBe(12)
    expect(steps([drug("Adenosine", 1, "6"), drug("Adenosine", 3, "12")])).toBe(18)
    expect(steps([drug("Adenosine", 1, "6"), drug("Adenosine", 3, "12"), drug("Adenosine", 5, "18")])).toBe(18)
    expect(steps([drug("Adenosine", 1, "6")], T0 + 40 * 60_000)).toBe(6)
    // A child: 0.1 → 0.2 mg/kg, capped at 6 and 12 mg.
    expect(amount(card("Supraventricular arrhythmia", { patient: CHILD_20KG, log: [drug("Adenosine", 1, "2")], now: T0 + 5 * 60_000 }), "adenosine")).toBe(4)
  })

  it("shows atropine's running total against 3 mg", () => {
    const resolved = card("Bradycardia", { log: [drug("Atropine", -30, "0.5"), drug("Atropine", 2, "0.5")] })
    expect(row(resolved, "atropine")?.total).toEqual({ amount: 1, max: 3, unit: "mg" })
  })
})
