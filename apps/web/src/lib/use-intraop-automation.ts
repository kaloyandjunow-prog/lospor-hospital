"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  AUTOMATION_GROUPS,
  automationGroupEnabled,
  DEFAULT_INTRAOP_AUTOMATION,
  parseIntraopAutomation,
  vitalQuestionsEnabled,
  type IntraopAutomationSettings,
  type UserAutomationSwitches,
} from "@lospor/core/intraop-automation"
import { suggestionFactsFromPreop, type SuggestionContext, type SuggestionPreopRecord } from "@lospor/core/intraop-suggestions"
import type { LabResult } from "@lospor/core/labs"
import { preopAgeDays, type VitalQuestionContext, type VitalStatsTable } from "@lospor/core/vital-questions"
import { SEED_SUCCESSION, likelyNext, parseSuccessionLinks, successionContext, successionDismissedIds, SUCCESSION_ANSWER_KIND, SUCCESSION_DISMISS_ANSWER, type LikelyEvent, type SuccessionLink, type SuccessionStructuredRecords } from "@lospor/core/event-succession"
import { successionDismissalEventId } from "@lospor/core/intraop-automation-actions"
import type { IntraopEventOps } from "@lospor/core/intraop-timetable-edit"
import { serverNow } from "@/lib/intraop-clock"
import { getWebClinicalPreferencesOwner, readWebClinicalPreferences, syncWebClinicalPreferences, useWebClinicalPreferencesOwner } from "@/lib/clinical-preferences-web"

/**
 * Intraoperative automation (10.1.0) on the web: what the hospital switched
 * on in Status and the reading counts the vitals questions are measured
 * against -- the same response the PWA reads. Until the first read answers,
 * nothing is asked. If it cannot be read (offline, server down), the last
 * settings this browser read for the account are used, else Core's defaults,
 * so the suggestions keep working; statistics are left out until a read works.
 */
type Automation = {
  settings: IntraopAutomationSettings
  stats: VitalStatsTable | null
  succession: SuccessionLink[]
  /** A policy has been read from the API for this session (or from a prior successful read). */
  ready: boolean
  /** The last read failed: these are remembered or default settings, not fresh ones. */
  unavailable: boolean
}

const LAST_POLICY_KEY = "lospor_intraop_automation_last:"

function rememberPolicy(ownerId: string, automation: Automation): void {
  try {
    localStorage.setItem(LAST_POLICY_KEY + ownerId, JSON.stringify({ settings: automation.settings, succession: automation.succession }))
  } catch { /* a full or blocked store only loses the fallback */ }
}

/** The settings to use when the server cannot be read: the last good read for this account, else the defaults. */
export function fallbackAutomation(ownerId: string | null): Automation {
  try {
    const raw = ownerId ? localStorage.getItem(LAST_POLICY_KEY + ownerId) : null
    if (raw) {
      const stored = JSON.parse(raw) as { settings?: unknown; succession?: unknown }
      // Statistics are not remembered: they go stale and are large. Without them only the fixed limits ask.
      return { settings: parseIntraopAutomation(stored.settings), stats: null, succession: parseSuccessionLinks(stored.succession), ready: true, unavailable: true }
    }
  } catch { /* unreadable: use the defaults */ }
  return { settings: DEFAULT_INTRAOP_AUTOMATION, stats: null, succession: [...SEED_SUCCESSION], ready: true, unavailable: true }
}

let loading: { ownerId: string; promise: Promise<Automation> } | null = null

async function fetchIntraopAutomation(ownerId: string): Promise<Automation> {
  if (loading?.ownerId === ownerId) return loading.promise
  const request = fetch("/api/intraop/automation", { cache: "no-store" })
    .then(response => {
      if (!response.ok) throw new Error(`automation policy request failed: ${response.status}`)
      return response.json()
    })
    .then(body => {
      if (body == null) throw new Error("automation policy response was empty")
      return parseIntraopAutomationResponse(body)
    })
  const promise = request.finally(() => {
    if (loading?.promise === promise) loading = null
  })
  loading = { ownerId, promise }
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
  const ownerId = useWebClinicalPreferencesOwner()
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
    if (!ownerId) {
      setAutomation({ settings: DEFAULT_INTRAOP_AUTOMATION, stats: null, succession: [], ready: false, unavailable: false })
      return
    }
    try {
      const next = await fetchIntraopAutomation(ownerId)
      if (version === requestVersion.current && getWebClinicalPreferencesOwner() === ownerId) {
        rememberPolicy(ownerId, next)
        setAutomation(next)
      }
    } catch {
      if (version === requestVersion.current && getWebClinicalPreferencesOwner() === ownerId) {
        setAutomation(fallbackAutomation(ownerId))
      }
    }
  }, [ownerId])
  useEffect(() => {
    let active = true
    queueMicrotask(() => {
      if (active) void reload()
    })
    return () => { active = false }
  }, [reload])
  return { ...automation, reload }
}

type PreopAge = {
  ageValue?: number | null; ageUnit?: string | null; ageYears?: number | null; ageApproxDays?: number | null
  /** The preop BP: the hypertension baseline when it was entered. */
  bpSystolic?: number | null; bpDiastolic?: number | null
} | null | undefined

/**
 * What the vitals questions need on this form, or null when they are not
 * asked here: switched off, the patient's age unknown, or the case being
 * edited on another screen (read-only) -- the screen that holds it asks.
 */
export function useVitalQuestionContext(preop: PreopAge, readOnly: boolean): VitalQuestionContext | null {
  const { settings, stats, ready } = useIntraopAutomation()
  const { keepLogging, user } = useAutomationPreferences()
  const ageDays = preopAgeDays(preop ?? null)
  const systolic = preop?.bpSystolic ?? null
  const diastolic = preop?.bpDiastolic ?? null
  return useMemo(() => {
    if (ready === false || readOnly || !vitalQuestionsEnabled(settings, user) || ageDays == null) return null
    return { settings, user, stats, ageDays, keepLogging, preopPressure: { systolic, diastolic } }
  }, [ready, readOnly, settings, stats, ageDays, keepLogging, user, systolic, diastolic])
}

/** The clinician's own switches (Settings): keep logging, and the groups turned off (10.2.0). */
export function useAutomationPreferences(): { keepLogging: boolean; user: UserAutomationSwitches } {
  const ownerId = useWebClinicalPreferencesOwner()
  const [preferences, setPreferences] = useState(() => readWebClinicalPreferences())
  useEffect(() => {
    let active = true
    const reset = () => {
      if (active) setPreferences(readWebClinicalPreferences())
    }
    if (!ownerId) {
      queueMicrotask(reset)
      return () => { active = false }
    }
    queueMicrotask(reset)
    void syncWebClinicalPreferences().then(next => {
      if (active && getWebClinicalPreferencesOwner() === ownerId) setPreferences(next)
    }).catch(() => {})
    return () => { active = false }
  }, [ownerId])
  return useMemo(
    () => ({
      keepLogging: preferences.vitalEpisodeAutoLog,
      user: { ...(preferences.automationGroups ?? {}), automationLines: preferences.automationLines ?? {} },
    }),
    [preferences],
  )
}

/**
 * The events likely to come next on this case (10.2.0): at most two, only ones not yet charted, once the usual gap has
 * passed after the event they follow. Nothing when the reminders are off in Status or for this clinician, or the case
 * is held on another screen. What is likely, and why, is Core's (event-succession); this only hands it the case.
 */
export function useLikelyEvents(args: {
  log: ReadonlyArray<{ type: string; label?: string | null; ts: string }>
  structured?: SuccessionStructuredRecords
  techniques: readonly string[]
  child: boolean
  enabled: boolean
  onEventOps?: (ops: IntraopEventOps) => void | Promise<void>
}): { likely: LikelyEvent[]; dismiss: (suggestionId: string) => void } {
  const { settings, succession, ready } = useIntraopAutomation()
  const { user } = useAutomationPreferences()
  const [now, setNow] = useState(() => Date.now())
  const dismissalInFlight = useRef(new Set<string>())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(timer)
  }, [])
  const { log, techniques, child, enabled } = args
  const likely = useMemo(() => {
    if (ready === false || !enabled) return []
    return likelyNext({
      log: log.filter(event => event.type === "clinical_event").map(event => ({ label: event.label, ts: event.ts })),
      structured: args.structured,
      context: successionContext(techniques, child), links: succession, now, dismissed: successionDismissedIds(log), settings, user,
    })
  }, [ready, enabled, log, techniques, child, succession, now, settings, user, args.structured])
  return {
    likely,
    dismiss: suggestionId => {
      if (!args.onEventOps || !suggestionId.startsWith("succession:")) return
      if (dismissalInFlight.current.has(suggestionId)) return
      dismissalInFlight.current.add(suggestionId)
      const ts = serverNow().toISOString()
      try {
        const result = args.onEventOps({
          add: [{ id: successionDismissalEventId(suggestionId), ts, type: "prompt_answer", answerKind: SUCCESSION_ANSWER_KIND, answerFor: suggestionId, answer: SUCCESSION_DISMISS_ANSWER, suggestion: suggestionId, recordedAt: ts }],
          update: [], remove: [],
        })
        void Promise.resolve(result).finally(() => dismissalInFlight.current.delete(suggestionId)).catch(() => {})
      } catch {
        dismissalInFlight.current.delete(suggestionId)
      }
    },
  }
}

/** What the screen knows of the case beyond the preop record. */
export type SuggestionCaseFacts = {
  idealWeightKg?: number | null
  tofMonitor?: boolean | null
  labs?: readonly LabResult[] | null
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
 * What the suggestions (10.2.0) need on this form, or null when none are
 * asked here: every group off (in Status, or by this clinician), or the case
 * held on another screen. "now" is left to the attention hook, which ticks.
 */
export function useSuggestionContext(
  preop: SuggestionPreopRecord | null | undefined,
  facts: SuggestionCaseFacts,
  readOnly: boolean,
): Omit<SuggestionContext, "now"> | null {
  const { settings, ready } = useIntraopAutomation()
  const { keepLogging, user } = useAutomationPreferences()
  const { idealWeightKg, tofMonitor, labs, bloodLossMl, startedAt, endedAt, techniques, techniqueSides, airwayDevices, airwayDeviceEntries, presentsIntubated, timeZone } = facts
  const base = useMemo(() => suggestionFactsFromPreop(preop, idealWeightKg), [preop, idealWeightKg])
  return useMemo(() => {
    if (ready === false || readOnly || !AUTOMATION_GROUPS.some(group => automationGroupEnabled(settings, group, user))) return null
    return {
      settings,
      user,
      patient: base.patient,
      preop: base.preop,
      tofMonitor: tofMonitor === true,
      keepLogging,
      labs: labs ?? [],
      bloodLossMl: bloodLossMl ?? null,
      startedAt: startedAt ?? null,
      endedAt: endedAt ?? null,
      techniques: techniques ?? [],
      techniqueSides,
      airwayDevices,
      airwayDeviceEntries,
      presentsIntubated,
      timeZone: timeZone ?? null,
    }
  }, [ready, readOnly, settings, user, base, tofMonitor, keepLogging, labs, bloodLossMl, startedAt, endedAt, techniques, techniqueSides, airwayDevices, airwayDeviceEntries, presentsIntubated, timeZone])
}
