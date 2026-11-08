import { canonicalComplicationLabel } from "../complications"
import { sortIntraopEvents } from "../intraop-engine"
import type { IntraopEventOps } from "../intraop-timetable-edit"
import type { LogEvent } from "../intraop-types"
import { isChild, type SuggestionPatient } from "./context"
import { cardOfSuggestion } from "./cards"

/**
 * Reverse questions (10.2.0, part B): a drug, fluid or shock specific enough
 * to its complication asks whether to log it, at the drug's time. Rules 1-13
 * of the agreed table ask; glucagon, small adrenaline boluses, the
 * vasopressors and hypertonic saline never do.
 *
 * - No question when the complication is already logged within 30 minutes of
 *   the trigger.
 * - Only the newest trigger of a rule asks; an older one is stale.
 * - After a "Not now", the same rule does not ask again within 30 minutes of
 *   the trigger that was dismissed.
 */

export const REVERSE_WINDOW_MINUTES = 30

export type ReverseRule =
  | "lipid" | "dantrolene" | "adenosine" | "unsynchronisedShock" | "synchronisedShock" | "massiveTransfusion"
  | "rescueSugammadex" | "arrestAdrenaline" | "calciumInsulin" | "secondUterotonic" | "antidote" | "amiodarone" | "salbutamol"

export type ReverseQuestion = {
  key: string
  rule: ReverseRule
  /** The entry that asked, whose time the complication takes. */
  trigger: LogEvent
  /** One complication to confirm, or several to pick from. */
  choices: readonly string[]
}

export type ReverseContext = {
  patient: SuggestionPatient
  /** Blood loss recorded on the intraop form, in mL. */
  bloodLossMl?: number | null
}

const ms = (value: string) => Date.parse(value)
const minutes = (value: number) => value * 60_000
const dose = (event: LogEvent) => Number.parseFloat(event.dose ?? "") || 0

const UTEROTONICS = new Set(["Oxytocin", "Carbetocin", "Carboprost", "Methylergometrine", "Misoprostol"])
const SECOND_LINE_UTEROTONICS = new Set(["Carboprost", "Methylergometrine", "Misoprostol"])
const RED_CELLS = /PRBC|RED BLOOD CELLS|RED CELLS/i

/** Massive blood loss: 1,500 mL in an adult, 40 mL/kg in a child (about half a child's blood volume). */
export function massiveBloodLoss(bloodLossMl: number | null | undefined, patient: SuggestionPatient): boolean {
  if (bloodLossMl == null || !(bloodLossMl > 0)) return false
  if (!isChild(patient)) return bloodLossMl >= 1500
  return patient.weightKg != null && bloodLossMl >= 40 * patient.weightKg
}

type Rule = {
  rule: ReverseRule
  choices: readonly string[]
  /** The triggers in the log, oldest first. */
  triggers: (log: LogEvent[], context: ReverseContext) => LogEvent[]
}

const drugs = (log: LogEvent[], name: string) => log.filter(event => event.type === "drug" && event.name === name)

const RULES: readonly Rule[] = [
  { rule: "lipid", choices: ["Local anaesthetic systemic toxicity (LAST)"], triggers: log => log.filter(event => event.type === "fluid_start" && event.name === "Lipid emulsion 20%") },
  { rule: "dantrolene", choices: ["Malignant hyperthermia"], triggers: log => drugs(log, "Dantrolene") },
  { rule: "adenosine", choices: ["Supraventricular arrhythmia"], triggers: log => drugs(log, "Adenosine") },
  { rule: "unsynchronisedShock", choices: ["Ventricular fibrillation", "Ventricular tachycardia", "Cardiac arrest"], triggers: log => log.filter(event => event.type === "defibrillation" && !event.synchronized) },
  { rule: "synchronisedShock", choices: ["Atrial fibrillation", "Supraventricular arrhythmia", "Ventricular tachycardia"], triggers: log => log.filter(event => event.type === "defibrillation" && event.synchronized === true) },
  {
    rule: "massiveTransfusion", choices: ["Massive haemorrhage"],
    // The fourth unit of red cells within an hour.
    triggers: log => {
      const units = log.filter(event => event.type === "fluid_start" && RED_CELLS.test(event.name ?? ""))
      return units.filter((unit, index) => index >= 3 && ms(unit.ts) - ms(units[index - 3]!.ts) <= minutes(60))
    },
  },
  {
    rule: "rescueSugammadex", choices: ["CICO (can't intubate can't oxygenate)"],
    triggers: (log, context) => drugs(log, "Sugammadex").filter(event => context.patient.weightKg != null && dose(event) / context.patient.weightKg >= 16),
  },
  {
    rule: "arrestAdrenaline", choices: ["Cardiac arrest"],
    triggers: (log, context) => drugs(log, "Epinephrine / Adrenaline").filter(event => event.drugRoute !== "IM" && (isChild(context.patient)
      ? context.patient.weightKg != null && dose(event) >= 9 * context.patient.weightKg
      : dose(event) >= 1000)),
  },
  {
    rule: "calciumInsulin", choices: ["Hyperkalaemia"],
    triggers: log => {
      const calcium = log.filter(event => event.type === "drug" && (event.name === "Calcium chloride" || event.name === "Calcium gluconate"))
      const insulin = log.filter(event => (event.type === "drug" || event.type === "infusion_start") && event.name === "Regular insulin / Actrapid")
      // The later of the pair is the trigger.
      return [...calcium, ...insulin].filter(event => {
        const others = calcium.includes(event) ? insulin : calcium
        return others.some(other => ms(other.ts) <= ms(event.ts) && ms(event.ts) - ms(other.ts) <= minutes(15))
      })
    },
  },
  {
    rule: "secondUterotonic", choices: ["Massive haemorrhage"],
    triggers: log => {
      const given = log.filter(event => (event.type === "drug" || event.type === "infusion_start") && UTEROTONICS.has(event.name ?? ""))
      return given.filter((event, index) => SECOND_LINE_UTEROTONICS.has(event.name ?? "") && index > 0)
    },
  },
  { rule: "antidote", choices: ["Drug overdose", "Delayed emergence"], triggers: log => log.filter(event => event.type === "drug" && (event.name === "Naloxone" || event.name === "Flumazenil")) },
  { rule: "amiodarone", choices: ["Atrial fibrillation", "Ventricular tachycardia"], triggers: log => log.filter(event => (event.type === "drug" || event.type === "infusion_start") && event.name === "Amiodarone") },
  { rule: "salbutamol", choices: ["Bronchospasm"], triggers: log => drugs(log, "Salbutamol / Albuterol") },
]

export const reverseAnswerKind = (rule: ReverseRule) => `reverse:${rule}`
export const reverseComplicationId = (rule: ReverseRule, triggerId: string) => `rq-${rule}-${triggerId}`
export const reversePromptAnswerId = (rule: ReverseRule, triggerId: string) => `pa-reverse-${rule}-${triggerId}`

/** The reverse questions waiting now, oldest trigger first. */
export function reverseQuestions(log: LogEvent[], context: ReverseContext): ReverseQuestion[] {
  const ordered = sortIntraopEvents(log)
  const complications = ordered.filter(event => event.type === "complication")
  const dismissals = ordered.filter(event => event.type === "prompt_answer" && event.answerKind?.startsWith("reverse:"))
  const questions: ReverseQuestion[] = []
  for (const rule of RULES) {
    const triggers = rule.triggers(ordered, context)
    const trigger = triggers[triggers.length - 1]
    if (!trigger) continue
    // A dose given from a treatment card already knows its complication: asking again is noise (amiodarone in an arrest).
    if (cardOfSuggestion(trigger.suggestion) != null) continue
    const at = ms(trigger.ts)
    const nearby = complications.some(event => rule.choices.includes(canonicalComplicationLabel(event.label ?? ""))
      && Math.abs(ms(event.ts) - at) <= minutes(REVERSE_WINDOW_MINUTES))
    if (nearby) continue
    const dismissed = dismissals.some(event => event.answerKind === reverseAnswerKind(rule.rule)
      && at - ms(event.ts) >= 0 && at - ms(event.ts) <= minutes(REVERSE_WINDOW_MINUTES))
    if (dismissed) continue
    questions.push({ key: `reverse:${rule.rule}:${trigger.id}`, rule: rule.rule, trigger, choices: rule.choices })
  }
  // A blood loss over the massive threshold asks too, at the time it was read (the last entry with a time).
  if (massiveBloodLoss(context.bloodLossMl, context.patient)) {
    const already = complications.some(event => event.label === "Massive haemorrhage")
    const dismissed = dismissals.some(event => event.answerKind === reverseAnswerKind("massiveTransfusion") && event.answerFor === "blood-loss")
    if (!already && !dismissed && !questions.some(question => question.rule === "massiveTransfusion")) {
      const last = ordered[ordered.length - 1]
      if (last) questions.push({ key: "reverse:massiveTransfusion:blood-loss", rule: "massiveTransfusion", trigger: { ...last, id: "blood-loss" }, choices: ["Massive haemorrhage"] })
    }
  }
  return questions.sort((a, b) => ms(a.trigger.ts) - ms(b.trigger.ts))
}

/** What one answer writes: the complication picked, at the trigger's time; or the "Not now". */
export function reverseAnswerOps(question: ReverseQuestion, answer: { log: string } | "not_now", now: Date | string | number): IntraopEventOps {
  const recordedAt = new Date(now).toISOString()
  if (answer === "not_now") {
    return {
      add: [{ id: reversePromptAnswerId(question.rule, question.trigger.id), ts: question.trigger.ts, type: "prompt_answer",
        answerFor: question.trigger.id, answerKind: reverseAnswerKind(question.rule), answer: "not_now", recordedAt }],
      update: [],
      remove: [],
    }
  }
  if (!question.choices.includes(answer.log)) return { add: [], update: [], remove: [] }
  return {
    add: [{
      id: reverseComplicationId(question.rule, question.trigger.id),
      ts: question.trigger.ts,
      type: "complication",
      label: answer.log,
      color: "#ef4444",
      complicationSource: "suggestion",
      suggestion: reverseAnswerKind(question.rule),
      triggerReadingId: question.trigger.id,
      endTs: question.trigger.ts,
      recordedAt,
    }],
    update: [],
    remove: [],
  }
}
