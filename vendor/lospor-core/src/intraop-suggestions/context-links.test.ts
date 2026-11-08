import { describe, expect, it } from "vitest"
import type { LogEvent } from "../intraop-types"
import { parseIntraopAutomation } from "../intraop-automation"
import { CONTEXT_LINK_IDS } from "./automations"
import { contextLinkAnswerOps, contextLinkSuggestions, INDUCTION_AGENT_NAMES } from "./context-links"
import { suggestionOutcomes } from "./acceptance"

const T = "2026-11-05T10:00:00.000Z"
const settings = parseIntraopAutomation({ enabled: true, groups: { reminders: true } })
const contextLines = Object.fromEntries(Object.values(CONTEXT_LINK_IDS).map(id => [id, true]))
const user = { automationLines: contextLines }

const context = (techniques: string[] = []) => ({ settings, user, techniques, startedAt: T, now: T })

describe("context links", () => {
  it("offers context lines by default, and not once the clinician turns one off", () => {
    const log: LogEvent = { id: "la", ts: T, type: "drug", name: "Bupivacaine", dose: "20", unit: "mg", drugRoute: "EPIDURAL" }
    expect(contextLinkSuggestions([log], { settings, techniques: [], now: T })).toHaveLength(1)
    expect(contextLinkSuggestions([log], { settings, user: { automationLines: { [CONTEXT_LINK_IDS.epiduralLocalAnaesthetic]: false } }, techniques: [], now: T })).toEqual([])
    expect(contextLinkSuggestions([log], context())).toMatchObject([
      { automationId: CONTEXT_LINK_IDS.epiduralLocalAnaesthetic, kind: "route", source: { id: "la" } },
    ])
  })

  it("offers the exact block and side after a generic Block done event", () => {
    const source: LogEvent = { id: "block", ts: T, type: "clinical_event", label: "Block done" }
    const [link] = contextLinkSuggestions([source], context())
      .filter(item => item.automationId === CONTEXT_LINK_IDS.blockEventTechnique)
    expect(link?.techniqueChoices.some(choice => choice.value === "BLOCK_FEMORAL")).toBe(true)

    const ops = contextLinkAnswerOps(link!, { type: "technique", code: "BLOCK_FEMORAL", side: "LEFT", at: T }, T)
    expect(ops.add).toHaveLength(1)
    expect(ops.update).toHaveLength(1)
    expect(ops.update[0]).toMatchObject({
      label: "Block done", suggestion: CONTEXT_LINK_IDS.blockEventTechnique, ts: T,
    })
    expect(ops.add.find(event => event.type === "prompt_answer")).toMatchObject({
      answer: "done", value: "technique:BLOCK_FEMORAL:LEFT",
      intraopPatch: { techniques: ["BLOCK_FEMORAL"], techniqueSides: { BLOCK_FEMORAL: "LEFT" } },
    })
  })

  it("coalesces a route signal with its already-charted clinical event", () => {
    const route: LogEvent = { id: "epidural-drug", ts: T, type: "drug", name: "Bupivacaine", dose: "20", unit: "mg", drugRoute: "EPIDURAL" }
    const placement: LogEvent = { id: "epidural-event", ts: T, type: "clinical_event", label: "Epidural in" }
    const ids = contextLinkSuggestions([route, placement], context()).map(item => item.automationId)
    expect(ids).not.toContain(CONTEXT_LINK_IDS.epiduralLocalAnaesthetic)
    expect(ids).toContain(CONTEXT_LINK_IDS.epiduralEventTechnique)
  })

  it("shows one reconciliation prompt when induction, volatile and TCI signals collide", () => {
    const log: LogEvent[] = [
      { id: "induction", ts: T, type: "drug", name: "Propofol", category: "Induction", dose: "100", unit: "mg" },
      { id: "volatile", ts: T, type: "agent_start", name: "Sevoflurane", value: "2" },
      { id: "tci", ts: T, type: "infusion_start", name: "Propofol", tciModel: "MARSH" },
    ]
    const links = contextLinkSuggestions(log, context())
      .filter(item => [CONTEXT_LINK_IDS.inductionAgent, CONTEXT_LINK_IDS.tciTechnique, CONTEXT_LINK_IDS.volatileTechnique].includes(item.automationId as never))
    expect(links).toHaveLength(1)
    expect(links[0]).toMatchObject({ automationId: CONTEXT_LINK_IDS.inductionAgent, kind: "induction" })
    expect(links[0]?.promptEn).toContain("Propofol")
  })

  it("turns an induction agent into an exact technique and airway record", () => {
    expect(INDUCTION_AGENT_NAMES).toEqual([
      "Propofol", "Etomidate", "Ketamine", "Esketamine", "Thiopental", "Methohexital",
    ])
    const source: LogEvent = { id: "propofol", ts: T, type: "drug", name: "Propofol", category: "Induction", dose: "100", unit: "mg" }
    const [link] = contextLinkSuggestions([source], context())
      .filter(item => item.automationId === CONTEXT_LINK_IDS.inductionAgent)
    expect(link?.techniqueChoices.map(choice => choice.value)).toEqual(expect.arrayContaining(["SEDATION_DEEP", "GENERAL_TIVA"]))

    const ops = contextLinkAnswerOps(link!, { type: "induction", code: "GENERAL_TIVA", airwayDevice: "ORAL_ETT", at: T }, T)
    expect(ops.add.find(event => event.type === "clinical_event" && event.label === "Induction")).toMatchObject({
      suggestion: CONTEXT_LINK_IDS.inductionAgent,
      intraopPatch: { techniques: ["GENERAL_TIVA"], airwayDevices: ["ORAL_ETT"] },
    })
    expect(ops.add.some(event => event.type === "clinical_event" && event.label === "Intubated")).toBe(true)
    expect(ops.add.find(event => event.type === "prompt_answer")).toMatchObject({ answer: "done", value: "induction:GENERAL_TIVA:ORAL_ETT" })
  })

  it("does not invent a clinical time when anaesthesia start is missing", () => {
    const source: LogEvent = { id: "propofol-no-start", ts: T, type: "drug", name: "Propofol", category: "Induction", dose: "100", unit: "mg" }
    const [link] = contextLinkSuggestions([source], { ...context(), startedAt: null })
      .filter(item => item.automationId === CONTEXT_LINK_IDS.inductionAgent)
    expect(link?.startedAt).toBeNull()
    expect(contextLinkAnswerOps(link!, { type: "induction", code: "GENERAL_TIVA", at: T }, T))
      .toEqual({ add: [], update: [], remove: [] })
    const ops = contextLinkAnswerOps(link!, { type: "induction", code: "GENERAL_TIVA", at: T, timeConfirmed: true }, T)
    expect(ops.add.find(event => event.type === "clinical_event" && event.label === "Induction")?.ts).toBe(T)
  })

  it("does not create a second active primary airway from an induction answer", () => {
    const source: LogEvent = { id: "propofol-existing", ts: T, type: "drug", name: "Propofol", category: "Induction", dose: "100", unit: "mg" }
    const [link] = contextLinkSuggestions([source], {
      ...context(), airwayDevices: ["ORAL_ETT"], airwayDeviceEntries: [{ id: "old", device: "ORAL_ETT", status: "in_use" }],
    }).filter(item => item.automationId === CONTEXT_LINK_IDS.inductionAgent)
    expect(contextLinkAnswerOps(link!, { type: "induction", code: "GENERAL_TIVA", airwayDevice: "ORAL_ETT", at: T }, T)).toEqual({ add: [], update: [], remove: [] })

    const ops = contextLinkAnswerOps(link!, { type: "induction", code: "GENERAL_TIVA", airwayDevice: "ORAL_ETT", at: T, replaceArrivalTube: true }, T)
    const induction = ops.add.find(event => event.type === "clinical_event" && event.label === "Induction")
    expect(induction).toMatchObject({ intraopPatch: { airwayDevices: ["ORAL_ETT"] } })
    expect((induction?.intraopPatch as { airwayDeviceEntries?: Array<{ id: string; status: string; replacedBy?: string | null }> }).airwayDeviceEntries)
      .toEqual(expect.arrayContaining([expect.objectContaining({ id: "old", status: "replaced", replacedBy: "context-airway-propofol-existing" }), expect.objectContaining({ id: "context-airway-propofol-existing", status: "in_use" })]))
    expect(ops.add.some(event => event.type === "clinical_event" && event.label === "Reintubation")).toBe(true)
  })

  it("asks whether the arrival tube was replaced before recording a new airway", () => {
    const source: LogEvent = { id: "propofol-arrival", ts: T, type: "drug", name: "Propofol", category: "Induction", dose: "100", unit: "mg" }
    const [link] = contextLinkSuggestions([source], { ...context(), presentsIntubated: true })
      .filter(item => item.automationId === CONTEXT_LINK_IDS.inductionAgent)
    const keep = contextLinkAnswerOps(link!, { type: "induction", code: "GENERAL_TIVA", airwayDevice: "ORAL_ETT", at: T, replaceArrivalTube: false }, T)
    expect(keep.add.some(event => event.type === "clinical_event" && ["Intubated", "Reintubation", "Airway exchange"].includes(event.label ?? ""))).toBe(false)
    expect(keep.add.find(event => event.type === "clinical_event" && event.label === "Induction")).toMatchObject({ intraopPatch: { techniques: ["GENERAL_TIVA"] } })
    const replace = contextLinkAnswerOps(link!, { type: "induction", code: "GENERAL_TIVA", airwayDevice: "ORAL_ETT", at: T, replaceArrivalTube: true }, T)
    expect(replace.add.some(event => event.type === "clinical_event" && event.label === "Reintubation")).toBe(true)
  })

  it("keeps adjunct airway records compatible with an arrival tube", () => {
    const source: LogEvent = { id: "propofol-arrival-adjunct", ts: T, type: "drug", name: "Propofol", category: "Induction", dose: "100", unit: "mg" }
    const [link] = contextLinkSuggestions([source], { ...context(), presentsIntubated: true })
      .filter(item => item.automationId === CONTEXT_LINK_IDS.inductionAgent)
    const ops = contextLinkAnswerOps(link!, { type: "induction", code: "GENERAL_TIVA", airwayDevice: "OPA", at: T }, T)
    expect(ops.add.some(event => event.type === "clinical_event" && event.label === "OPA in")).toBe(true)
    expect(ops.add.some(event => event.type === "clinical_event" && ["Reintubation", "Airway exchange"].includes(event.label ?? ""))).toBe(false)
    expect(ops.add.find(event => event.type === "clinical_event" && event.label === "Induction")).toMatchObject({
      intraopPatch: { airwayDevices: ["OPA"] },
    })
  })

  it("only prompts for TCI when Propofol TCI starts", () => {
    const remi: LogEvent = { id: "remi-tci", ts: T, type: "infusion_start", name: "Remifentanil", tciModel: "MINTO" }
    expect(contextLinkSuggestions([remi], context()).some(item => item.automationId === CONTEXT_LINK_IDS.tciTechnique)).toBe(false)
    const propofol: LogEvent = { id: "prop-tci", ts: T, type: "infusion_start", name: "Propofol", tciModel: "MARSH" }
    expect(contextLinkSuggestions([propofol], context()).some(item => item.automationId === CONTEXT_LINK_IDS.tciTechnique)).toBe(true)
  })

  it("asks one technique question when a Propofol TCI start and an airway record both lack a technique", () => {
    const propofol: LogEvent = { id: "prop-tci-airway", ts: T, type: "infusion_start", name: "Propofol", tciModel: "MARSH" }
    const items = contextLinkSuggestions([propofol], { ...context(), airwayDevices: ["LMA"] })
    expect(items.filter(item => item.clinicalRelation === "anaesthesia-technique").map(item => item.automationId)).toEqual([CONTEXT_LINK_IDS.tciTechnique])
  })

  it("persists a definitive dismissal and Status can count it", () => {
    const source: LogEvent = { id: "epidural", ts: T, type: "clinical_event", label: "Epidural in" }
    const [link] = contextLinkSuggestions([source], context())
      .filter(item => item.automationId === CONTEXT_LINK_IDS.epiduralEventTechnique)
    const dismissal = contextLinkAnswerOps(link!, { type: "dismiss" }, T).add[0]!
    expect(dismissal).toMatchObject({
      type: "prompt_answer", answerKind: CONTEXT_LINK_IDS.epiduralEventTechnique,
      answerFor: source.id, answer: "dismissed", suggestion: CONTEXT_LINK_IDS.epiduralEventTechnique,
    })
    expect(suggestionOutcomes([dismissal])).toEqual([{ id: CONTEXT_LINK_IDS.epiduralEventTechnique, outcome: "dismissed" }])
  })
})
