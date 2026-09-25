import { useCallback, useEffect, useState } from "react"
import {
  isPreopQuestionShown,
  isPreopScoreAvailable,
  PREOP_LEGACY_FIELD_BY_QUESTION,
  preopAnswerStates,
  type PREOP_SCORE_INPUTS,
  type PreopAssessmentProfile,
} from "@lospor/core/preop-assessment"
import { apiFetch, apiJson } from "./api"
import { clinicalSyncKv } from "./clinical-sync-kv"
import type { PreopPendingSuggestion, PreopQuestionAnswer } from "@/components/preop/PreopQuestionList"

const PROFILE_CACHE_KEY = "lospor_preop_profile_v1"

/** Baseline question behind each legacy form field. */
const QUESTION_OF_FIELD: Record<string, string> = Object.fromEntries(
  Object.entries(PREOP_LEGACY_FIELD_BY_QUESTION).map(([stableKey, field]) => [field, stableKey]),
)

type FormAccess = {
  getAnswers: () => PreopQuestionAnswer[]
  setAnswers: (answers: PreopQuestionAnswer[]) => void
}

/**
 * The hospital's preoperative profile for this form: which questions are on,
 * in what order, which are required, and the case's pending suggestions.
 *
 * The profile is appliance-wide, so it is fetched once and kept on the device:
 * offline, the form follows the last profile it saw rather than falling back
 * to showing everything. Before any profile has ever been seen the form keeps
 * the bundled baseline, which is what a fresh appliance starts with anyway.
 */
export function usePreopProfile({
  caseId,
  pediatric,
  values,
  form,
}: {
  caseId: string | null
  pediatric: boolean
  values: Record<string, unknown>
  form: FormAccess
}) {
  const [profile, setProfile] = useState<PreopAssessmentProfile | null>(null)
  const [suggestions, setSuggestions] = useState<PreopPendingSuggestion[]>([])
  const mode = pediatric ? "PEDIATRIC" : "ADULT"

  useEffect(() => {
    let cancelled = false
    clinicalSyncKv.get(PROFILE_CACHE_KEY)
      .then(cached => { if (!cancelled && cached) setProfile(current => current ?? JSON.parse(cached) as PreopAssessmentProfile) })
      .catch(() => {})
    apiJson<PreopAssessmentProfile>("/api/preop/profile")
      .then(fresh => {
        if (cancelled) return
        setProfile(fresh)
        void clinicalSyncKv.set(PROFILE_CACHE_KEY, JSON.stringify(fresh)).catch(() => {})
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  const loadSuggestions = useCallback(async () => {
    if (!caseId) return setSuggestions([])
    const rows = await apiJson<Array<{ id: string; status: string; proposedState: PreopPendingSuggestion["proposedState"]; question?: { stableKey?: string } }>>(
      `/api/cases/${encodeURIComponent(caseId)}/preop-suggestions`,
    ).catch(() => null)
    if (!rows) return
    setSuggestions(rows
      .filter(row => row.status === "PENDING" && row.question?.stableKey)
      .map(row => ({ id: row.id, stableKey: row.question!.stableKey!, proposedState: row.proposedState })))
  }, [caseId])
  useEffect(() => { void loadSuggestions() }, [loadSuggestions])

  // preopAnswers is sent as the complete set, so dropping an entry is how an
  // answer is cleared; a parent answered anything but YES takes its
  // follow-ups with it.
  const answerQuestion = useCallback((stableKey: string, answer: PreopQuestionAnswer | null) => {
    const followUps = new Set((profile?.questions ?? []).filter(item => item.parentKey === stableKey).map(item => item.stableKey))
    const keep = form.getAnswers().filter(item => item.stableKey !== stableKey
      && !(answer?.state !== "YES" && followUps.has(item.stableKey)))
    form.setAnswers(answer ? [...keep, answer] : keep)
  }, [form, profile])

  const reviewSuggestion = useCallback(async (suggestionId: string, status: "ACCEPTED" | "REJECTED") => {
    if (!caseId) return
    const suggestion = suggestions.find(item => item.id === suggestionId)
    const response = await apiFetch(`/api/cases/${encodeURIComponent(caseId)}/preop-suggestions/${encodeURIComponent(suggestionId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    }).catch(() => null)
    if (response?.ok && status === "ACCEPTED" && suggestion?.proposedState && suggestion.proposedState !== "NOT_ASKED") {
      const state = suggestion.proposedState
      answerQuestion(suggestion.stableKey, { stableKey: suggestion.stableKey, state, optionKey: state === "YES" || state === "NO" ? state : null })
    }
    await loadSuggestions()
  }, [answerQuestion, caseId, loadSuggestions, suggestions])

  return {
    profile,
    mode: mode as "ADULT" | "PEDIATRIC",
    states: preopAnswerStates(values),
    suggestions,
    answerQuestion,
    reviewSuggestion,
    /** Whether the control for this legacy form field is shown. */
    shownField: (field: string) => !QUESTION_OF_FIELD[field] || isPreopQuestionShown(profile, QUESTION_OF_FIELD[field], mode),
    scoreAvailable: (score: keyof typeof PREOP_SCORE_INPUTS) => isPreopScoreAvailable(profile, score),
  }
}
