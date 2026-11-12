import { describe, expect, it } from "vitest"
import { parseIntraopAutomation } from "@lospor/core/intraop-automation"
import { CONTEXT_LINK_IDS, contextLinkAnswerOps, contextLinkSuggestions, type ContextLinkAnswer, type ContextLinkItem } from "@lospor/core/intraop-suggestions"
import type { LogEvent } from "@lospor/core/intraop-types"
import { EVENT_PATCH_FORM_FIELDS } from "./event-patch-form"

// The contract between Core's suggestion answers and the form: every field an answer writes into the record must be one
// the form takes when the answer is saved (event-patch-form.ts). A field Core starts to write without the form taking
// it would leave the screen -- and the next suggestion -- on the old state until a reload (found 2026-11-11).

const T = "2026-11-05T10:00:00.000Z"
const settings = parseIntraopAutomation({ enabled: true, groups: { reminders: true } })
const context = (techniques: string[] = []) => ({
  settings, user: { automationLines: Object.fromEntries(Object.values(CONTEXT_LINK_IDS).map(id => [id, true])) },
  techniques, startedAt: T, now: T,
})
const fields = new Set<string>(EVENT_PATCH_FORM_FIELDS)

const scenarios: { name: string; log: LogEvent[]; techniques?: string[]; airwayDevices?: string[] }[] = [
  { name: "an induction drug without a technique", log: [{ id: "d", ts: T, type: "drug", name: "Propofol", dose: "120", unit: "mg", drugRoute: "IV" } as LogEvent] },
  { name: "an airway event without a technique", log: [{ id: "a", ts: T, type: "clinical_event", label: "Intubated" } as LogEvent] },
  { name: "a block event", log: [{ id: "b", ts: T, type: "clinical_event", label: "Block done" } as LogEvent] },
  { name: "a spinal event", log: [{ id: "s", ts: T, type: "clinical_event", label: "Spinal in" } as LogEvent] },
  { name: "an epidural event", log: [{ id: "e", ts: T, type: "clinical_event", label: "Epidural in" } as LogEvent] },
  { name: "a volatile agent without a technique", log: [{ id: "v", ts: T, type: "agent_start", name: "Sevoflurane" } as LogEvent] },
  { name: "an epidural local anaesthetic", log: [{ id: "la", ts: T, type: "drug", name: "Bupivacaine", dose: "20", unit: "mg", drugRoute: "EPIDURAL" } as LogEvent] },
]

function answersFor(item: ContextLinkItem): ContextLinkAnswer[] {
  const answers: ContextLinkAnswer[] = [{ type: "dismiss" }, { type: "no" }, { type: "complete" }, { type: "event", at: T }]
  for (const choice of item.techniqueChoices) {
    answers.push({ type: "technique", code: choice.value, side: "LEFT", at: T })
    answers.push({ type: "technique", code: choice.value, at: T })
    answers.push({ type: "induction", code: choice.value, at: T })
    for (const airway of item.airwayChoices.slice(0, 3)) {
      answers.push({ type: "induction", code: choice.value, airwayDevice: airway.value, replaceArrivalTube: false, at: T } as ContextLinkAnswer)
    }
  }
  for (const side of ["LEFT", "RIGHT", "BOTH"] as const) answers.push({ type: "side", side, at: T })
  return answers
}

describe("every field a suggestion's answer writes into the record is one the form takes", () => {
  for (const scenario of scenarios) {
    it(`covers the answers to ${scenario.name}`, () => {
      const items = contextLinkSuggestions(scenario.log, context(scenario.techniques))
      expect(items.length, "the scenario offers a card").toBeGreaterThan(0)
      let patches = 0
      for (const item of items) {
        for (const answer of answersFor(item)) {
          const ops = contextLinkAnswerOps(item, answer, T)
          for (const event of [...ops.add, ...ops.update]) {
            if (!event.intraopPatch) continue
            patches++
            for (const key of Object.keys(event.intraopPatch)) {
              expect(fields.has(key), `${item.automationId} writes "${key}", which the form does not take`).toBe(true)
            }
          }
        }
      }
      expect(patches, "some answer writes a patch").toBeGreaterThan(0)
    })
  }
})
