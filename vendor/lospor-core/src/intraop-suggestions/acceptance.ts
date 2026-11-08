import type { LogEvent } from "../intraop-types"
import { cardAutomationId, labAutomationId, readingAutomationId, REMINDER_IDS, reverseAutomationId, timerAutomationId, AUTOMATION_IDS } from "./automations"
import { suggestionCardFor } from "./catalogue"
import type { TimerKind } from "./timers"
import { SEQUENCE_EVENTS, SUCCESSION_ANSWER_KIND, SUCCESSION_DISMISS_ANSWER } from "../event-succession"
import { VITAL_QUESTION_KINDS, vitalQuestionAutomationId } from "../intraop-automation"

/**
 * What became of the suggestions on one case (10.2.0), read from the saved
 * chart alone: nothing extra is recorded to measure them. A suggestion that
 * was acted on leaves an entry carrying its tag; one put away leaves a
 * dismissal answer. One never answered leaves nothing, so it counts as neither.
 *
 * - accepted: the question was answered yes (a complication made from it), or a
 *   card had an entry saved from one of its rows or was closed with Done. A card
 *   counts once per case, however many of its rows were used.
 * - dismissed: a "Not now" on an ordinary prompt, or a definitive
 *   `dismissed` answer on a succession prompt.
 *
 * Reminders and follow-ups open a sheet without tagging what is saved, so for
 * them only dismissals are seen; their acceptance is not measured.
 */
export type SuggestionOutcome = { id: string; outcome: "accepted" | "dismissed" }

const REMINDER_KIND: Record<string, string> = { ponv: REMINDER_IDS.ponv, glucose: REMINDER_IDS.glucose }

/**
 * Succession rules may be learned after release, so their ids cannot be
 * limited to the seeded automation catalogue. Keep the same validation as
 * Core's succession id builder: both sides must be known clinical sequence
 * events.
 */
function isSuccessionId(value: string): boolean {
  if (!value.startsWith("succession:")) return false
  const pair = value.slice("succession:".length)
  const separator = pair.indexOf(">")
  if (separator <= 0 || separator === pair.length - 1) return false
  return SEQUENCE_EVENTS.has(pair.slice(0, separator)) && SEQUENCE_EVENTS.has(pair.slice(separator + 1))
}

function knownAutomationId(value: string): boolean {
  return AUTOMATION_IDS.has(value) || isSuccessionId(value)
}

/** The automation a prompt answer's kind belongs to, or null for one this does not know. */
function automationOfAnswer(kind: string, answerFor: string | undefined, log: LogEvent[]): string | null {
  if (kind === SUCCESSION_ANSWER_KIND) return answerFor && knownAutomationId(answerFor) ? answerFor : null
  const vitalKind = VITAL_QUESTION_KINDS.find(value => value === kind)
  if (vitalKind) return vitalQuestionAutomationId(vitalKind)
  if (kind.startsWith("context:")) return knownAutomationId(kind) ? kind : null
  if (kind === "card") {
    const complication = log.find(event => event.id === answerFor && event.type === "complication")
    const def = suggestionCardFor(complication?.label)
    return def ? cardAutomationId(def.complications[0]!) : null
  }
  const [family, ...rest] = kind.split(":")
  const name = rest.join(":")
  if (family === "reverse") return reverseAutomationId(name)
  if (family === "reading") return readingAutomationId(name)
  if (family === "lab") return labAutomationId(name)
  if (family === "reminder") return REMINDER_KIND[name] ?? null
  if (family === "timer") return timerAutomationId(name as TimerKind)
  if (family === "monitor") return knownAutomationId(kind) ? kind : null
  return null
}

/** The automation a suggestion tag names: a card row (card:Label:row) or a rule's own tag (reverse:lipid). */
function automationOfTag(tag: string): string | null {
  if (tag.startsWith("card:")) {
    const label = tag.slice("card:".length, tag.lastIndexOf(":"))
    const def = suggestionCardFor(label)
    return def ? cardAutomationId(def.complications[0]!) : null
  }
  return knownAutomationId(tag) ? tag : null
}

export function suggestionOutcomes(log: readonly LogEvent[]): SuggestionOutcome[] {
  const events = [...log]
  const outcomes: SuggestionOutcome[] = []
  const acceptedActionKeys = new Set<string>()
  const acceptedCards = new Set<string>()
  const dismissedSuggestions = new Set<string>()
  const actionKey = (event: LogEvent, id: string): string =>
    event.type === "prompt_answer" || event.recordedAt
      ? `${id}:${event.recordedAt ?? event.ts}`
      : `${id}:event:${event.id}`
  for (const event of events) {
    if (event.type === "prompt_answer" && event.answerKind) {
      // Succession dismissals carry the exact rule id in both answerFor and
      // suggestion. This keeps the prompt kind stable while preserving the
      // provenance contract used by accepted clinical events.
      const id = automationOfAnswer(event.answerKind, event.answerFor, events)
      if (!id || !knownAutomationId(id)) continue
      const dismissed = event.answer === "not_now"
        || event.answer === SUCCESSION_DISMISS_ANSWER
      if (dismissed) {
        // Historical clients could send the same definitive dismissal twice
        // before the first save reached the UI. Keep Status counts correct even
        // for those rows; new clients also use a deterministic event id.
        if (event.answer !== SUCCESSION_DISMISS_ANSWER || !dismissedSuggestions.has(id)) {
          outcomes.push({ id, outcome: "dismissed" })
        }
        if (event.answer === SUCCESSION_DISMISS_ANSWER) dismissedSuggestions.add(id)
      }
      else if (event.answer === "done" && event.answerKind === "card") {
        if (!acceptedCards.has(id)) {
          acceptedCards.add(id)
          outcomes.push({ id, outcome: "accepted" })
        }
      }
      else if (event.answer === "done" && event.answerKind.startsWith("context:") && event.value !== "no") {
        const key = actionKey(event, id)
        if (!acceptedActionKeys.has(key)) {
          acceptedActionKeys.add(key)
          outcomes.push({ id, outcome: "accepted" })
        }
      }
      continue
    }
    const tag = event.suggestion
    if (!tag) continue
    const id = automationOfTag(tag)
    if (!id) continue
    if (tag.startsWith("card:")) {
      if (acceptedCards.has(id)) continue
      acceptedCards.add(id)
    } else {
      const key = actionKey(event, id)
      if (acceptedActionKeys.has(key)) continue
      acceptedActionKeys.add(key)
    }
    outcomes.push({ id, outcome: "accepted" })
  }
  // A card closed with Not now after something was given from it was used, not
  // put away. Context/succession prompts remain separate occurrences; only
  // records carrying the same action timestamp are collapsed.
  return outcomes.filter(item => !(item.outcome === "dismissed" && acceptedCards.has(item.id)))
}

/** Counts per automation, to add up over many cases. */
export type SuggestionCounts = Record<string, { accepted: number; dismissed: number }>

export function addOutcomes(counts: SuggestionCounts, outcomes: readonly SuggestionOutcome[]): SuggestionCounts {
  for (const { id, outcome } of outcomes) {
    const entry = (counts[id] ??= { accepted: 0, dismissed: 0 })
    entry[outcome] += 1
  }
  return counts
}
