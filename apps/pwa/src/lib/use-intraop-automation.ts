import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { AUTOMATION_GROUPS, automationGroupEnabled, DEFAULT_INTRAOP_AUTOMATION, parseIntraopAutomation, vitalQuestionsEnabled, type IntraopAutomationSettings } from "@lospor/core/intraop-automation"
import { suggestionFactsFromPreop, type SuggestionContext } from "@lospor/core/intraop-suggestions"
import type { LabResult } from "@lospor/core/labs"
import { preopAgeDays, type VitalQuestionContext, type VitalStatsTable } from "@lospor/core/vital-questions"
import { parseSuccessionLinks, type SuccessionLink } from "@lospor/core/event-succession"
import { apiJson } from "@/lib/api"
import { useAuth } from "@/lib/auth-context"
import type { IntraopPreopSummary } from "@/lib/intraop-preop-summary"
import { usePreferences } from "@/lib/preferences-context"

/**
 * Intraoperative automation (10.1.0): what the hospital switched on in
 * Status, and the reading counts the vitals questions are measured against.
 * Until the first policy read, nothing is asked rather than silently using
 * Core's shared defaults. Kept for the session once read, so a dropped
 * connection mid-case is not the hospital switching the questions off.
 */
type Automation = {
  settings: IntraopAutomationSettings
  stats: VitalStatsTable | null
  succession: SuccessionLink[]
  /** A policy has been read from the API for this session (or from a prior successful read). */
  ready: boolean
  /** The first policy read failed; do not silently run the shared defaults. */
  unavailable: boolean
}

// All intraoperative hooks on the PWA consume one account-wide policy read.
// Without a shared in-flight request, the case screen, vitals hook and
// suggestion hook could observe different responses while Status was changing
// the policy, which looked like an automation collision even though the API
// had one account-wide value.
let loading: { accountId: string; promise: Promise<Automation> } | null = null

async function fetchIntraopAutomation(accountId: string): Promise<Automation> {
  if (loading?.accountId === accountId) return loading.promise
  const request = apiJson<unknown>("/api/intraop/automation")
    .then(value => parseIntraopAutomationResponse(value))
  const promise = request.finally(() => {
    if (loading?.promise === promise) loading = null
  })
  loading = { accountId, promise }
  return promise
}

export function parseIntraopAutomationResponse(value: unknown): Automation {
  const body = typeof value === "object" && value !== null ? value as Record<string, unknown> : {}
  const settings = parseIntraopAutomation(body.settings)
  const stats = vitalQuestionsEnabled(settings) && typeof body.stats === "object" && body.stats !== null
    ? body.stats as VitalStatsTable
    : null
  // What usually comes next (10.2.0): the starting values and what the cases show, sent while the reminders are on.
  return { settings, stats, succession: parseSuccessionLinks(body.succession), ready: true, unavailable: false }
}

export function useIntraopAutomation(): Automation & { reload: () => Promise<void> } {
  const { state: authState, accountId } = useAuth()
  const requestVersion = useRef(0)
  const [automation, setAutomation] = useState<Automation>({
    settings: DEFAULT_INTRAOP_AUTOMATION,
    stats: null,
    succession: [],
    ready: false,
    unavailable: false,
  })
  const reload = useCallback(async () => {
    const version = ++requestVersion.current
    if (authState !== "authenticated" || !accountId) {
      setAutomation({
        settings: DEFAULT_INTRAOP_AUTOMATION,
        stats: null,
        succession: [],
        ready: false,
        unavailable: false,
      })
      return
    }
    try {
      const next = await fetchIntraopAutomation(accountId)
      // A request can outlive logout/login. Never let its response cross an
      // account boundary or overwrite a newer policy read.
      if (version === requestVersion.current && authState === "authenticated" && accountId) setAutomation(next)
    } catch {
      // A previously successful policy remains safe to use mid-case, but the
      // initial render must never silently fall back to Core's shared demo default.
      if (version === requestVersion.current && authState === "authenticated" && accountId) {
        setAutomation(current => ({ ...current, unavailable: true }))
      }
    }
  }, [accountId, authState])
  useEffect(() => { void reload() }, [reload])
  return { ...automation, reload }
}

/**
 * What the vitals questions need on this screen, or null when they are not
 * asked here: switched off, the patient's age unknown, or the case open on
 * another screen (watching mode) -- the screen that holds the case asks.
 */
export function useVitalQuestionContext(preop: IntraopPreopSummary | null, isWatching: boolean): VitalQuestionContext | null {
  const { settings, stats, ready } = useIntraopAutomation()
  const { vitalEpisodeAutoLog, automationGroups, automationLines } = usePreferences()
  const user = useMemo(() => ({ ...automationGroups, automationLines }), [automationGroups, automationLines])
  const ageDays = preopAgeDays(preop ? { ageValue: preop.ageValue, ageUnit: preop.ageUnit, ageYears: preop.age, ageApproxDays: preop.ageApproxDays } : null)
  const systolic = preop?.bpSystolic ?? null
  const diastolic = preop?.bpDiastolic ?? null
  return useMemo(() => {
    if (ready === false || isWatching || !vitalQuestionsEnabled(settings, user) || ageDays == null) return null
    return { settings, user, stats, ageDays, keepLogging: vitalEpisodeAutoLog, preopPressure: { systolic, diastolic } }
  }, [ready, isWatching, settings, stats, ageDays, vitalEpisodeAutoLog, user, systolic, diastolic])
}

/** What the screen knows of the case beyond the preop record. */
export type SuggestionCaseFacts = {
  idealWeightKg?: number | null
  tofMonitor?: boolean
  labs?: readonly LabResult[]
  bloodLossMl?: number | null
  startedAt?: string | null
  endedAt?: string | null
  techniques?: readonly string[]
  techniqueSides?: Record<string, "LEFT" | "RIGHT" | "BOTH">
  airwayDevices?: readonly string[]
  airwayDeviceEntries?: readonly Record<string, unknown>[]
  presentsIntubated?: boolean
  timeZone?: string | null
}

/**
 * What the suggestions (10.2.0) need on this screen, or null when none are
 * asked: every group off (in Status, or by this clinician), or the case open
 * on another screen. "now" is left to the attention hook, which ticks.
 */
export function useSuggestionContext(preop: IntraopPreopSummary | null, facts: SuggestionCaseFacts, isWatching: boolean): Omit<SuggestionContext, "now"> | null {
  const { settings, ready } = useIntraopAutomation()
  const { vitalEpisodeAutoLog, automationGroups, automationLines } = usePreferences()
  const { idealWeightKg, tofMonitor, labs, bloodLossMl, startedAt, endedAt, techniques, techniqueSides, airwayDevices, airwayDeviceEntries, presentsIntubated, timeZone } = facts
  const user = useMemo(() => ({ ...automationGroups, automationLines }), [automationGroups, automationLines])
  const base = useMemo(() => suggestionFactsFromPreop(preop ? {
    ageValue: preop.ageValue, ageUnit: preop.ageUnit, ageYears: preop.age, ageApproxDays: preop.ageApproxDays,
    weightKg: preop.weight, sex: preop.sex,
    malignantHyperthermiaHistory: preop.malignantHyperthermiaHistory, familyAnesthesiaProblems: preop.familyAnesthesiaProblems,
    latexAllergy: preop.latexAllergy, apfelScore: preop.apfelScore, apfelPONVHistory: preop.apfelPONVHistory,
    comorbidities: preop.comorbidities, currentMedications: preop.currentMedications,
  } : null, idealWeightKg), [preop, idealWeightKg])
  return useMemo(() => {
    if (ready === false || isWatching || !AUTOMATION_GROUPS.some(group => automationGroupEnabled(settings, group, user))) return null
    return {
      settings, user, patient: base.patient, preop: base.preop,
      tofMonitor: tofMonitor === true, keepLogging: vitalEpisodeAutoLog,
      labs: labs ?? [], bloodLossMl: bloodLossMl ?? null, startedAt: startedAt ?? null, endedAt: endedAt ?? null,
      techniques: techniques ?? [], techniqueSides, airwayDevices, airwayDeviceEntries, presentsIntubated, timeZone: timeZone ?? null,
    }
  }, [ready, isWatching, settings, user, base, tofMonitor, vitalEpisodeAutoLog, labs, bloodLossMl, startedAt, endedAt, techniques, techniqueSides, airwayDevices, airwayDeviceEntries, presentsIntubated, timeZone])
}
