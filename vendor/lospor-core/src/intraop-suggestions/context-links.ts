import { AIRWAY_DEVICES } from "../catalog/airway-management"
import { CLINICAL_EVENT_CATS } from "../catalog/intraop-events"
import { canonicalTechnique } from "../intraop-domain"
import { normalizeAdministrationRoute } from "../clinical-rule-vocabulary"
import { airwayClinicalEvent } from "../airway-smart"
import { airwayDeviceEntriesOf, airwayPrimaryConflict, hasActiveTrachealTube, isPrimaryAirwayDevice } from "../airway-device-entries"
import { addAirwayDevice, airwayRecordFields } from "../airway-smart"
import type { IntraopEventOps } from "../intraop-timetable-edit"
import type { LogEvent } from "../intraop-types"
import { automationEnabled, type IntraopAutomationSettings, type UserAutomationSwitches } from "../intraop-automation"
import { CONTEXT_LINK_IDS, AUTOMATIONS } from "./automations"
import { drugClasses } from "./context"
import { TECHNIQUE_LEAVES, TECHNIQUE_SIDES, techniqueHasSide, isPropofolTciModel, type TechniqueSide } from "../technique-smart"
import { clinicalRelationForEventLabel, contextAnswerEventId, type ClinicalRelation } from "../intraop-automation-actions"

/** The first six induction agents in the catalogue. Midazolam and fentanyl are
 * deliberately not part of this link: they are common adjuncts, not a signal
 * that the case's anaesthetic technique is missing. */
export const INDUCTION_AGENT_NAMES = Object.freeze([
  "Propofol", "Etomidate", "Ketamine", "Esketamine", "Thiopental", "Methohexital",
] as const)

// The catalogue has historically carried thiopental under two display aliases.
// Keep those aliases accepted as signals without exposing duplicate choices in
// the suggestion catalogue.
const INDUCTION_AGENT_ALIASES = Object.freeze(["Thiopentone", "Thiopental / Thiopentone"])

export type ContextLinkKind = "route" | "induction" | "event-technique" | "side" | "tci" | "volatile" | "airway" | "extubation" | "technique-event"

export type ContextLinkChoice = {
  value: string
  label: string
  labelBg: string
}

export type ContextLinkItem = {
  type: "context"
  automationId: string
  key: string
  kind: ContextLinkKind
  source: LogEvent
  titleEn: string
  titleBg: string
  promptEn: string
  promptBg: string
  detailEn: string
  detailBg: string
  suggestedAt: string
  techniques: readonly string[]
  techniqueSides: Record<string, TechniqueSide>
  techniqueChoices: readonly ContextLinkChoice[]
  airwayChoices: readonly ContextLinkChoice[]
  airwayDevices: readonly string[]
  airwayDeviceEntries: readonly Record<string, unknown>[]
  presentsIntubated: boolean
  /** Null means the case has no documented anaesthesia start yet. */
  startedAt?: string | null
  timeZone?: string | null
  techniqueCode?: string
  eventLabel?: string
  clinicalRelation?: ClinicalRelation
}

export type ContextLinkContext = {
  settings: IntraopAutomationSettings
  user?: UserAutomationSwitches | null
  techniques: readonly string[]
  techniqueSides?: Record<string, TechniqueSide>
  airwayDevices?: readonly string[]
  airwayDeviceEntries?: readonly Record<string, unknown>[]
  presentsIntubated?: boolean
  /** Null means the clinical start is not documented yet. */
  startedAt?: string | null
  timeZone?: string | null
  now: Date | string | number
}

export type ContextLinkAnswer =
  | { type: "dismiss" }
  | { type: "no" }
  | { type: "complete" }
  | { type: "technique"; code: string; side?: TechniqueSide; at?: string; timeConfirmed?: boolean }
  | { type: "side"; side: TechniqueSide; at?: string; timeConfirmed?: boolean }
  | { type: "event"; at?: string; timeConfirmed?: boolean }
  | { type: "induction"; code: string; airwayDevice?: string; at?: string; timeConfirmed?: boolean; replaceArrivalTube?: boolean }

const none: IntraopEventOps = { add: [], update: [], remove: [] }
const iso = (value: Date | string | number) => new Date(value).toISOString()
const validIso = (value: unknown): value is string => typeof value === "string" && Number.isFinite(Date.parse(value))
const canonicalName = (value: string | undefined) => (value ?? "").trim().toLowerCase().replace(/\s+/g, " ")

const copyFor = (id: string) => AUTOMATIONS.find(item => item.id === id) ?? {
  id, group: "reminders" as const, en: id, bg: id, detailEn: "", detailBg: "",
}

const choices = (codes: readonly string[]): ContextLinkChoice[] => codes.flatMap(code => {
  const hit = TECHNIQUE_LEAVES.find(item => item.code === code)
  return hit ? [{ value: hit.code, label: hit.label, labelBg: hit.labelBg }] : []
})

const exact = (predicate: (code: string, ancestors: readonly string[]) => boolean): ContextLinkChoice[] =>
  choices(TECHNIQUE_LEAVES.filter(item => predicate(item.code, item.ancestors)).map(item => item.code))

const generalChoices = () => exact(code => code.startsWith("GENERAL_"))
const sedationChoices = () => exact(code => code.startsWith("SEDATION_"))
const epiduralChoices = () => exact((code, ancestors) => ancestors.includes("EPIDURAL") || ancestors.includes("CSE") || code === "DPE")
const spinalChoices = () => exact((code, ancestors) => ancestors.includes("SPINAL") || ancestors.includes("CSE") || code === "DPE")
const blockChoices = () => exact((_code, ancestors) => ancestors.includes("PERIPHERAL"))

const airwayChoices = (): ContextLinkChoice[] => AIRWAY_DEVICES.map(([value, label, labelBg]) => ({ value, label, labelBg }))

const eventColor = (label: string): string =>
  CLINICAL_EVENT_CATS.flatMap(category => category.events).find(event => event.label === label)?.color ?? "#64748b"

const eventLabelBg = (label: string): string =>
  CLINICAL_EVENT_CATS.flatMap(category => category.events).find(event => event.label === label)?.labelBg ?? label

const hasExactTechnique = (techniques: readonly string[], predicate: (code: string) => boolean) =>
  techniques.some(technique => predicate(canonicalTechnique(technique)))

const hasGeneralOrSedation = (techniques: readonly string[]) => techniques.some(technique => {
  const code = canonicalTechnique(technique)
  return code.startsWith("GENERAL_") || code.startsWith("SEDATION_")
})

const patchTechniques = (event: LogEvent): string[] => {
  const value = event.intraopPatch?.techniques
  return Array.isArray(value) ? value.filter((code): code is string => typeof code === "string").map(canonicalTechnique) : []
}

/** A same-labelled event only satisfies the exact technique that it carries.
 * A global "Block done" check made a second block in the same case disappear
 * after the first block was documented. */
const hasTechniqueEvent = (log: readonly LogEvent[], label: string, code: string): boolean => {
  const canonical = canonicalTechnique(code)
  return log.some(event => event.type === "clinical_event"
    && event.label === label
    && patchTechniques(event).includes(canonical))
}

const answerExists = (log: readonly LogEvent[], automationId: string, sourceId: string): boolean =>
  log.some(event => event.type === "prompt_answer"
    && event.answerKind === automationId
    && event.answerFor === sourceId
    && (event.answer === "done" || event.answer === "dismissed"))

const contextSource = (id: string, ts: string): LogEvent => ({ id, ts, type: "prompt_answer" })

function item(
  automationId: string,
  kind: ContextLinkKind,
  source: LogEvent,
  context: ContextLinkContext,
  prompt: [string, string],
  options: { techniqueChoices?: ContextLinkChoice[]; techniqueCode?: string; eventLabel?: string; clinicalRelation?: ClinicalRelation } = {},
): ContextLinkItem {
  const copy = copyFor(automationId)
  return {
    type: "context", automationId, kind, source,
    key: `${automationId}:${source.id}`,
    titleEn: copy.en, titleBg: copy.bg,
    promptEn: prompt[0], promptBg: prompt[1], detailEn: copy.detailEn, detailBg: copy.detailBg,
    suggestedAt: source.ts,
    techniques: context.techniques,
    techniqueSides: context.techniqueSides ?? {},
    techniqueChoices: options.techniqueChoices ?? [],
    airwayChoices: airwayChoices(),
    airwayDevices: context.airwayDevices ?? [],
    airwayDeviceEntries: context.airwayDeviceEntries ?? [],
    presentsIntubated: context.presentsIntubated === true,
    startedAt: context.startedAt,
    timeZone: context.timeZone ?? null,
    ...(options.techniqueCode ? { techniqueCode: options.techniqueCode } : {}),
    ...(options.eventLabel ? { eventLabel: options.eventLabel } : {}),
    ...(options.clinicalRelation ? { clinicalRelation: options.clinicalRelation } : {}),
  }
}

const firstPending = (log: readonly LogEvent[], automationId: string, events: readonly LogEvent[]): LogEvent | undefined =>
  events.find(event => !answerExists(log, automationId, event.id))

const isInductionAgent = (event: LogEvent): boolean =>
  event.type === "drug"
  && (event.category == null || event.category.toLowerCase() === "induction")
  && [...INDUCTION_AGENT_NAMES, ...INDUCTION_AGENT_ALIASES].some(name => canonicalName(name) === canonicalName(event.name))

const routeSources = (log: readonly LogEvent[], route: string): LogEvent[] => log.filter(event =>
  (event.type === "drug" || event.type === "infusion_start")
  && drugClasses(event).has("localAnaesthetic")
  && normalizeAdministrationRoute(event.drugRoute ?? "") === route,
)

/** Build the contextual links that turn an existing chart action into the
 * missing exact technique, side, event or airway record. */
export function contextLinkSuggestions(log: readonly LogEvent[], context: ContextLinkContext): ContextLinkItem[] {
  const result: ContextLinkItem[] = []
  const lineOn = (id: string) => automationEnabled(context.settings, "reminders", id, context.user)
  const addRoute = (route: "EPIDURAL" | "PERINEURAL" | "INTRATHECAL", automationId: string, prompt: [string, string], choicesForRoute: () => ContextLinkChoice[], eventLabel: string, techniquePresent: (code: string) => boolean) => {
    if (!lineOn(automationId) || hasExactTechnique(context.techniques, techniquePresent)) return
    // A clinical placement/block event is stronger evidence than its drug
    // route. Keep one prompt for the relation rather than showing both a
    // route-level and an event-level question for the same action.
    const placementAlreadyCharted = log.some(event => event.type === "clinical_event"
      && (event.label === eventLabel || (eventLabel === "Spinal in" && event.label === "CSE")))
    if (placementAlreadyCharted) return
    const source = firstPending(log, automationId, routeSources(log, route))
    if (!source) return
    result.push(item(automationId, "route", source, context, prompt, {
      techniqueChoices: choicesForRoute(), eventLabel,
      clinicalRelation: clinicalRelationForEventLabel(eventLabel) ?? undefined,
    }))
  }

  addRoute("EPIDURAL", CONTEXT_LINK_IDS.epiduralLocalAnaesthetic,
    ["Was an epidural placed during this procedure?", "Поставена ли е епидурална анестезия по време на тази процедура?"],
    epiduralChoices, "Epidural in", code => code.startsWith("EPIDURAL_") || code.startsWith("CSE") || code === "DPE")
  addRoute("PERINEURAL", CONTEXT_LINK_IDS.perineuralLocalAnaesthetic,
    ["Was a peripheral block done during this procedure?", "Извършен ли е периферен блок по време на тази процедура?"],
    blockChoices, "Block done", code => code.startsWith("BLOCK_"))
  addRoute("INTRATHECAL", CONTEXT_LINK_IDS.intrathecalLocalAnaesthetic,
    ["Was a spinal placed during this procedure?", "Поставена ли е спинална анестезия по време на тази процедура?"],
    spinalChoices, "Spinal in", code => code.startsWith("SPINAL") || code.startsWith("CSE") || code === "DPE")

  const inductionMissing = !hasGeneralOrSedation(context.techniques)
    && lineOn(CONTEXT_LINK_IDS.inductionAgent)
  const inductionSource = inductionMissing ? firstPending(log, CONTEXT_LINK_IDS.inductionAgent, log.filter(isInductionAgent)) : undefined

  const eventLink = (label: string, automationId: string, prompt: [string, string], choicesForEvent: () => ContextLinkChoice[]) => {
    if (!lineOn(automationId) || hasExactTechnique(context.techniques, code => {
      if (label === "Epidural in") return code.startsWith("EPIDURAL_") || code.startsWith("CSE") || code === "DPE"
      if (label === "Spinal in" || label === "CSE") return code.startsWith("SPINAL") || code.startsWith("CSE") || code === "DPE"
      return code.startsWith("BLOCK_")
    })) return
    const source = firstPending(log, automationId, log.filter(event => event.type === "clinical_event" && (label === "Block done" ? event.label === label : event.label === label || (label === "Spinal in" && event.label === "CSE"))))
    if (source) result.push(item(automationId, "event-technique", source, context, prompt, {
      techniqueChoices: choicesForEvent(), eventLabel: label,
      clinicalRelation: clinicalRelationForEventLabel(label) ?? undefined,
    }))
  }
  eventLink("Epidural in", CONTEXT_LINK_IDS.epiduralEventTechnique,
    ["Which exact epidural technique was used?", "Коя точна епидурална техника беше използвана?"], epiduralChoices)
  eventLink("Spinal in", CONTEXT_LINK_IDS.spinalEventTechnique,
    ["Which exact spinal technique was used?", "Коя точна спинална техника беше използвана?"], spinalChoices)
  eventLink("Block done", CONTEXT_LINK_IDS.blockEventTechnique,
    ["Which exact block technique and side was used?", "Коя точна блокова техника и коя страна бяха използвани?"], blockChoices)

  if (lineOn(CONTEXT_LINK_IDS.perineuralSide)) {
    const missing = context.techniques.find(code => canonicalTechnique(code).startsWith("BLOCK_") && techniqueHasSide(canonicalTechnique(code)) && !context.techniqueSides?.[code])
    if (missing) {
      const source = contextSource(`technique-side:${missing}`, iso(context.now))
      if (!answerExists(log, CONTEXT_LINK_IDS.perineuralSide, source.id)) {
        const hit = TECHNIQUE_LEAVES.find(item => item.code === canonicalTechnique(missing))
        result.push(item(CONTEXT_LINK_IDS.perineuralSide, "side", source, context,
          [`${hit?.label ?? missing}: which side?`, `${hit?.labelBg ?? missing}: коя страна?`], { techniqueCode: canonicalTechnique(missing) }))
      }
    }
  }

  const tci = lineOn(CONTEXT_LINK_IDS.tciTechnique)
    ? firstPending(log, CONTEXT_LINK_IDS.tciTechnique, log.filter(event => event.type === "infusion_start" && isPropofolTciModel(event.tciModel)))
    : undefined

  const volatile = !hasGeneralOrSedation(context.techniques) && lineOn(CONTEXT_LINK_IDS.volatileTechnique)
    ? firstPending(log, CONTEXT_LINK_IDS.volatileTechnique, log.filter(event => event.type === "agent_start"))
    : undefined
  // Several chart signals can arrive together (induction + volatile, or TCI +
  // volatile). They are one missing clinical decision, so show one
  // reconciliation prompt rather than competing prompts for the same case.
  if (!hasGeneralOrSedation(context.techniques)) {
    const techniqueSource = inductionSource ?? tci ?? volatile
    if (techniqueSource) {
      const signals = [inductionSource?.name, tci && "Propofol TCI", volatile?.name]
        .filter((value): value is string => Boolean(value))
      const techniqueChoices = inductionSource || (tci && volatile)
        ? [...sedationChoices(), ...generalChoices()]
        : tci
          ? choices(["GENERAL_TCI"])
          : generalChoices()
      const automationId = inductionSource
        ? CONTEXT_LINK_IDS.inductionAgent
        : tci
          ? CONTEXT_LINK_IDS.tciTechnique
          : CONTEXT_LINK_IDS.volatileTechnique
      const kind: ContextLinkKind = inductionSource ? "induction" : tci ? "tci" : "volatile"
      const prompt: [string, string] = inductionSource
        ? [`${signals.join(" + ")}: which exact technique?`, `${signals.join(" + ")}: коя е точната техника?`]
        : tci && volatile
          ? [`${signals.join(" + ")}: which exact technique applies?`, `${signals.join(" + ")}: коя точна техника се прилага?`]
          : tci
            ? ["Which exact TCI technique should be recorded?", "Коя точна TCI техника да се запише?"]
            : ["Which exact general anaesthesia technique is this?", "Коя точна техника на обща анестезия е това?"]
      result.push(item(automationId, kind, techniqueSource, context, prompt, {
        techniqueChoices,
        clinicalRelation: "anaesthesia-technique",
      }))
    }
  }

  const airwayEvent = log.find(event => event.type === "clinical_event" && clinicalRelationForEventLabel(event.label) === "airway-record")
  const structuredAirway = (context.airwayDevices ?? []).length > 0 || (context.airwayDeviceEntries ?? []).length > 0
  if (!hasGeneralOrSedation(context.techniques) && !inductionSource && !tci && !volatile && (airwayEvent || structuredAirway) && lineOn(CONTEXT_LINK_IDS.airwayTechnique)) {
    const source = firstPending(log, CONTEXT_LINK_IDS.airwayTechnique, airwayEvent ? [airwayEvent] : [contextSource("airway-record", iso(context.now))])
    if (source) result.push(item(CONTEXT_LINK_IDS.airwayTechnique, "airway", source, context,
      ["Which exact sedation or general technique applies?", "Коя точна техника на седация или обща анестезия се прилага?"], {
        techniqueChoices: [...sedationChoices(), ...generalChoices()],
        clinicalRelation: "anaesthesia-technique",
      }))
  }

  if (lineOn(CONTEXT_LINK_IDS.extubationAirway)) {
    const extubated = log.find(event => event.type === "clinical_event" && event.label === "Extubated")
    const hasAirwayRecord = log.some(event => event.type === "clinical_event" && clinicalRelationForEventLabel(event.label) === "airway-record") || structuredAirway
    if (extubated && !hasAirwayRecord) {
      const source = firstPending(log, CONTEXT_LINK_IDS.extubationAirway, [extubated])
      if (source) result.push(item(CONTEXT_LINK_IDS.extubationAirway, "extubation", source, context,
        ["Complete the airway record for this extubation?", "Да се попълни ли записът за дихателния път за тази екстубация?"], {
          clinicalRelation: "airway-record",
        }))
    }
  }

  if (lineOn(CONTEXT_LINK_IDS.techniqueEvent)) {
    for (const code of context.techniques.map(canonicalTechnique)) {
      if (!(code.startsWith("EPIDURAL_") || code.startsWith("SPINAL") || code.startsWith("CSE") || code === "DPE" || code.startsWith("BLOCK_"))) continue
      const label = code.startsWith("BLOCK_") ? "Block done" : code.startsWith("EPIDURAL_") || code.startsWith("DPE") ? "Epidural in" : code.startsWith("CSE") ? "CSE" : "Spinal in"
      if (hasTechniqueEvent(log, label, code)) continue
      const source = contextSource(`technique-event:${code}`, iso(context.now))
      if (answerExists(log, CONTEXT_LINK_IDS.techniqueEvent, source.id)) continue
      const hit = TECHNIQUE_LEAVES.find(item => item.code === code)
      result.push(item(CONTEXT_LINK_IDS.techniqueEvent, "technique-event", source, context,
        [`${hit?.label ?? code}: record the ${label.toLowerCase()} event?`, `${hit?.labelBg ?? code}: да се запише ли събитието „${eventLabelBg(label)}“?`], {
          techniqueChoices: choices([code]), techniqueCode: code, eventLabel: label,
          clinicalRelation: clinicalRelationForEventLabel(label) ?? undefined,
        }))
      break
    }
  }

  return result.sort((a, b) => Date.parse(a.source.ts) - Date.parse(b.source.ts))
}

function promptAnswer(item: ContextLinkItem, answer: "done" | "dismissed", value: string, now: string): LogEvent {
  return {
    id: contextAnswerEventId(item.automationId, item.source.id),
    ts: now,
    type: "prompt_answer",
    answerKind: item.automationId,
    answerFor: item.source.id,
    answer,
    value,
    suggestion: item.automationId,
    recordedAt: now,
  }
}

function techniquePatch(item: ContextLinkItem, code: string, side?: TechniqueSide): Record<string, unknown> {
  const techniques = [...new Set([...item.techniques, code])]
  const sides = { ...item.techniqueSides }
  if (side && techniqueHasSide(code)) sides[code] = side
  return { techniques, ...(Object.keys(sides).length > 0 ? { techniqueSides: sides } : {}) }
}

function selectedTechnique(item: ContextLinkItem, code: string): boolean {
  return item.techniqueChoices.some(choice => choice.value === code)
}

/** Turn a context-link answer into the same atomic event/patch operation used
 * by the ordinary airway, vascular and technique screens. */
export function contextLinkAnswerOps(item: ContextLinkItem, answer: ContextLinkAnswer, now: Date | string | number): IntraopEventOps {
  const recordedAt = iso(now)
  if (answer.type === "dismiss") return { ...none, add: [promptAnswer(item, "dismissed", "dismissed", recordedAt)] }
  if (answer.type === "no") return { ...none, add: [promptAnswer(item, "done", "no", recordedAt)] }
  if (answer.type === "complete") return { ...none, add: [promptAnswer(item, "done", "complete", recordedAt)] }

  const clinicalTime = (requested: string | undefined, confirmed: boolean | undefined): string | null => {
    // A context link without a documented anaesthesia start must be explicitly
    // timed by the clinician.  Do not let an omitted/invalid value quietly
    // turn into the source event's timestamp.
    if (item.startedAt == null && confirmed !== true) return null
    if (confirmed === true) return validIso(requested) ? new Date(requested).toISOString() : null
    return validIso(requested) ? new Date(requested).toISOString() : item.suggestedAt
  }

  if (answer.type === "side") {
    const code = item.techniqueCode
    if (!code || !techniqueHasSide(code) || !TECHNIQUE_SIDES.includes(answer.side)) return none
    const patch = techniquePatch(item, code, answer.side)
    if (!clinicalTime(answer.at, answer.timeConfirmed)) return none
    return { ...none, add: [{ ...promptAnswer(item, "done", `side:${answer.side}`, recordedAt), intraopPatch: patch }] }
  }

  if (answer.type === "event") {
    if (!item.eventLabel || !item.techniqueCode) return none
    const at = clinicalTime(answer.at, answer.timeConfirmed)
    if (!at) return none
    const patch = techniquePatch(item, item.techniqueCode)
    return {
      ...none,
      add: [
        { id: `context-event-${item.automationId}-${item.source.id}`, ts: at, type: "clinical_event", label: item.eventLabel, color: eventColor(item.eventLabel), suggestion: item.automationId, recordedAt, clinicalRelation: item.clinicalRelation, sourceEventId: item.source.id, intraopPatch: patch },
        promptAnswer(item, "done", `event:${at}`, recordedAt),
      ],
    }
  }

  if (answer.type === "technique") {
    if (!selectedTechnique(item, answer.code)) return none
    const side = answer.side
    if (techniqueHasSide(answer.code) && !side) return none
    if (side && !TECHNIQUE_SIDES.includes(side)) return none
    const at = clinicalTime(answer.at, answer.timeConfirmed)
    if (!at) return none
    const patch = techniquePatch(item, answer.code, side)
    const add: LogEvent[] = [{ ...promptAnswer(item, "done", `technique:${answer.code}${side ? `:${side}` : ""}`, recordedAt), intraopPatch: patch }]
    const update: LogEvent[] = []
    if (item.eventLabel && item.source.type === "clinical_event") {
      // The event-technique link qualifies the clinical event that already
      // triggered it. Adding a second event made the chart show two identical
      // blocks. Keep the original id and label; the prompt answer carries the
      // structured technique patch.
      update.push({ ...item.source, ts: at, suggestion: item.automationId, recordedAt, clinicalRelation: item.clinicalRelation, sourceEventId: item.source.id })
    } else if (item.eventLabel) {
      add.unshift({ id: `context-event-${item.automationId}-${item.source.id}`, ts: at, type: "clinical_event", label: item.eventLabel, color: eventColor(item.eventLabel), suggestion: item.automationId, recordedAt, clinicalRelation: item.clinicalRelation, sourceEventId: item.source.id })
    }
    return { ...none, add, update }
  }

  if (answer.type === "induction") {
    if (!selectedTechnique(item, answer.code)) return none
    const at = clinicalTime(answer.at, answer.timeConfirmed)
    if (!at) return none
    const patch = techniquePatch(item, answer.code)
    const add: LogEvent[] = []
    const inductionLabel = answer.code.startsWith("SEDATION_") ? "Sedation started" : "Induction"
    let fullPatch: Record<string, unknown> = { ...patch }
    // The airway event is written exactly when the airway entry is, so an entry
    // never points at an event that was not created.
    let airwayAdded = false
    if (answer.airwayDevice) {
      if (!item.airwayChoices.some(choice => choice.value === answer.airwayDevice)) return none
      const entries = airwayDeviceEntriesOf({ airwayDevices: item.airwayDevices, airwayDeviceEntries: item.airwayDeviceEntries })
      const conflict = airwayPrimaryConflict(entries, answer.airwayDevice)
      const replacementRequired = conflict != null || (item.presentsIntubated && isPrimaryAirwayDevice(answer.airwayDevice))
      // The UI asks this explicitly. Keep the core guard as well so an older
      // client or a replayed answer cannot create two active primary airways.
      if (replacementRequired && answer.replaceArrivalTube !== true) {
        if (answer.replaceArrivalTube !== false) return none
      } else {
        const id = `context-airway-${item.source.id}`
        const airwayEventId = `context-airway-event-${item.source.id}`
        const next = conflict
          ? addAirwayDevice(entries, { id, device: answer.airwayDevice, details: {}, insertedAt: at, sourceEventId: airwayEventId, replaces: { id: conflict.id, reason: "planned" } })
          : item.presentsIntubated
            ? [...entries, { id, device: answer.airwayDevice, details: {}, insertedAt: at, sourceEventId: airwayEventId, status: "in_use" as const, reason: "planned" as const }]
            : addAirwayDevice(entries, { id, device: answer.airwayDevice, details: {}, insertedAt: at, sourceEventId: airwayEventId })
        fullPatch = { ...fullPatch, ...airwayRecordFields(next) }
        airwayAdded = true
      }
    }
    add.push({ id: `context-induction-${item.source.id}`, ts: at, type: "clinical_event", label: inductionLabel, color: eventColor(inductionLabel), suggestion: item.automationId, recordedAt, clinicalRelation: "anaesthesia-technique", sourceEventId: item.source.id, intraopPatch: fullPatch })
    if (answer.airwayDevice && airwayAdded) {
      const entries = airwayDeviceEntriesOf({ airwayDevices: item.airwayDevices, airwayDeviceEntries: item.airwayDeviceEntries })
      const conflict = airwayPrimaryConflict(entries, answer.airwayDevice)
      const eventLabel = answer.airwayDevice === "FACE_MASK" ? "Mask vent" : airwayClinicalEvent(answer.airwayDevice, {
        replaces: conflict != null || (item.presentsIntubated && isPrimaryAirwayDevice(answer.airwayDevice)),
        priorTrachealTube: hasActiveTrachealTube(entries) || item.presentsIntubated,
      })
      if (eventLabel) add.push({ id: `context-airway-event-${item.source.id}`, ts: at, type: "clinical_event", label: eventLabel, color: eventColor(eventLabel), suggestion: item.automationId, recordedAt, clinicalRelation: "airway-record", sourceEventId: item.source.id })
    }
    add.push(promptAnswer(item, "done", `induction:${answer.code}${answer.airwayDevice ? `:${answer.airwayDevice}` : ""}${answer.replaceArrivalTube === true ? ":replace" : answer.replaceArrivalTube === false ? ":keep" : ""}`, recordedAt))
    return { ...none, add }
  }

  return none
}

export const contextLinkDismissOps = (item: ContextLinkItem, now: Date | string | number): IntraopEventOps =>
  contextLinkAnswerOps(item, { type: "dismiss" }, now)

export function contextLinkText(item: ContextLinkItem, locale: "en" | "bg"): string {
  const title = locale === "bg" ? item.titleBg : item.titleEn
  const prompt = locale === "bg" ? item.promptBg : item.promptEn
  return `${title}: ${prompt}`
}
