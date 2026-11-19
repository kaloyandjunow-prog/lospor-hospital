import { AGENT_CATALOG } from "./catalog/inhalational-agents"
import type { AdultDoseProfileRule } from "./clinical-rules/adult-profiles"
import type { PediatricAgentProfileRule } from "./clinical-rules/pediatric-profiles"

/**
 * How an inhaled agent's concentration is entered, for every client (10.7.0).
 *
 * Web and phone each wrote their own: 0 to 10 %, a step of 0.1 and the list
 * 0.5, 1, 1.5, 2, 3, and they differed on when to offer the quick values. The
 * catalogue already holds each agent's real range (sevoflurane 0 to 8,
 * desflurane 0 to 18, isoflurane 0 to 5), which neither used: with a ceiling of
 * 10, a desflurane at 12 % dropped to 10 % at the next press of +.
 *
 * The entry is the same in every mode, for an adult or a child, with the
 * hospital's guidance on or off: a slider with - and +, quick buttons, and
 * typing as the fallback. The starting value is always 0: the clinician moves
 * it, and an agent is not started at 0.
 */

export type AgentEntry = {
  min: number
  max: number
  /** The step of - and +, and of what is typed: 0.1. */
  step: number
  /** Where the slider lands: coarser than the step, so it is easy to set (0.5). */
  sliderStep: number
  /** Decimals to show: 1 for a step of 0.1. */
  precision: number
  /** The quick buttons, from the catalogue: the same on web and phone, with no second copy to drift. */
  quickValues: readonly number[]
  /** The value to start from: always 0, so the slider starts at the left and nothing is filled in. */
  prefill: number
}


const FALLBACK = { min: 0, max: 10, step: 0.1 } as const
const DEFAULT_QUICK_VALUES: readonly number[] = [0.5, 1, 1.5, 2, 3]
/** Sliding across 0 to 18 % in tenths is fiddly; the slider lands on halves, - and + keep tenths. */
const SLIDER_STEP = 0.5

function decimals(step: number): number {
  const text = String(step)
  const point = text.indexOf(".")
  return point < 0 ? 0 : text.length - point - 1
}

function catalogEntry(agent: string) {
  const key = agent.trim().toUpperCase()
  return AGENT_CATALOG.find(entry => entry.value.toUpperCase() === key || entry.label.toUpperCase() === key)
}

/** What a clinical rule says about an agent: the range, step and quick buttons. */
export type AgentRuleProfile = { min: number; max: number; step: number; quickValues: readonly number[] }

const sameAgent = (left: string, right: string) => left.trim().toUpperCase() === right.trim().toUpperCase()

/**
 * The active rule for an agent, if the ruleset has one: the adult rules for an
 * adult, the paediatric rules for a child. Baselines before v5 have none, and
 * the catalogue answers then.
 */
export function agentRuleFor(
  agent: string,
  rules: { adult: readonly AdultDoseProfileRule[]; paediatric: readonly PediatricAgentProfileRule[] },
  paediatric: boolean,
): AgentRuleProfile | null {
  const profile = paediatric
    ? rules.paediatric.find(rule => sameAgent(rule.itemKey, agent))?.profile
    : rules.adult.find(rule => rule.kind === "ADULT_AGENT_PROFILE" && sameAgent(rule.itemKey, agent))?.profile
  if (!profile || typeof profile.max !== "number" || typeof profile.step !== "number") return null
  return { min: profile.min ?? 0, max: profile.max, step: profile.step, quickValues: profile.quickValues ?? [] }
}

/**
 * How the agent is entered: the active rule's values when there is one, else
 * the catalogue's, so an appliance still on an older baseline works as before.
 */
export function agentEntry(agent: string, rule?: AgentRuleProfile | null): AgentEntry {
  const profile = (rule ?? catalogEntry(agent)?.profile) as { min?: number; max?: number; step?: number; quickValues?: readonly number[] } | undefined
  const min = typeof profile?.min === "number" ? profile.min : FALLBACK.min
  const step = typeof profile?.step === "number" && profile.step > 0 ? profile.step : FALLBACK.step
  const fromProfile = (profile?.quickValues ?? []).filter(value => Number.isFinite(value) && value >= min)
  const quickValues = fromProfile.length ? fromProfile : DEFAULT_QUICK_VALUES
  // A quick value above the catalogue's ceiling raises the ceiling to it: a
  // value offered must be one the control can hold.
  const max = Math.max(typeof profile?.max === "number" ? profile.max : FALLBACK.max, ...quickValues)
  return { min, max, step, sliderStep: Math.max(step, SLIDER_STEP), precision: decimals(step), quickValues, prefill: 0 }
}
