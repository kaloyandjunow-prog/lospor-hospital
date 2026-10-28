import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  View, Text, ScrollView, TouchableOpacity, Pressable,
  ActivityIndicator, KeyboardAvoidingView, Platform, Animated, useWindowDimensions,
} from "react-native"
import { useLocalSearchParams, useRouter, Stack } from "expo-router"
import { notify } from "@/lib/notify"
import { useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { apiJson } from "@/lib/api"
import { submitCaseForReview, submitForReviewMessage } from "@/lib/submit-case-for-review"
import type { CasePatchResponse, CasePatchResult } from "@/lib/offline-case-patches"
import { autosaveManager } from "@/lib/autosave-manager"
import { useLiveRefresh } from "@/lib/use-live-refresh"
import { ScreenState } from "@/components/clinical-ui"
import { AppHeader } from "@/components/AppHeader"
import { EditWindowBanner } from "@/components/EditWindowBanner"
import { colors, withAlpha } from "@/theme/colors"
import { useCaseLock } from "@/lib/use-case-lock"
import { WatchingOverlay } from "@/components/WatchingOverlay"
import { usePreferences } from "@/lib/preferences-context"
import { useRangeSpec } from "@/lib/use-option-library"
import { normaliseHandoverCodes, postopFormSchema, type PostopFormData as FormData, type PostopFormInput as FormInput } from "@/lib/postop-form-schema"
import { RecoverySummary, usePostopFocusScroll } from "@/components/postop/PostopFormSections"
import { usePreopProfiles } from "@/lib/use-preop-profile"
import { useSectionPager } from "@/lib/use-section-pager"
import { canonicalizePostopPatch } from "@lospor/core/case-payloads"
import type { BlockedSaveIssue } from "@lospor/core/sync"
import {
  aldreteBand,
  aldreteTotal as calculateAldreteTotal,
  stewardBand,
  stewardTotal as calculateStewardTotal,
  suggestAldreteCirculation,
  suggestAldreteSpO2,
} from "@lospor/core/postop"
import {
  POSTOP_PAIN_ITEM_FIELDS,
  flaccTotal,
  nipsTotal,
  paedOffered,
  paedTotal,
  painScaleLabel,
  painScalesFor,
  painSummaryEntries,
} from "@lospor/core/postop-pain"
import { preopSectionConfigFor } from "@lospor/core/preop-orders"
import type { PediatricAgeUnit } from "@lospor/core/pediatric"
import { aldreteFromServerPostop } from "@/lib/postop-aldrete-hydration"
import { aldreteCriteria, stewardCriteria } from "@/lib/postop-aldrete-criteria"
import { PostopVitalsAndScore } from "@/components/postop/PostopVitalsAndScore"
import { PostopPainDisposition } from "@/components/postop/PostopPainDisposition"

// ─── Schema ───────────────────────────────────────────────────────────────────

type AutosaveState = "idle" | "saving" | "saved" | "queued" | "blocked" | "error"

// ─── Data ─────────────────────────────────────────────────────────────────────

export default function PostopFormScreen() {
  const { id, continuedItems, focus } = useLocalSearchParams<{ id: string; continuedItems?: string; focus?: string }>()
  const focusScroll = usePostopFocusScroll(focus)
  const router    = useRouter()
  const { tc, t, heightUnit, weightUnit, temperatureUnit, etco2Unit, cvpUnit, shade, language, postopLayout } = usePreferences()
  const { width: screenWidth } = useWindowDimensions()
  const unitPrefs = { heightUnit, weightUnit, temperatureUnit, etco2Unit, cvpUnit }
  const recoveryBpSystolicRange  = useRangeSpec("BP_SYSTOLIC_RANGE")
  const recoveryBpDiastolicRange = useRangeSpec("BP_DIASTOLIC_RANGE")
  const recoveryHeartRateRange   = useRangeSpec("HEART_RATE_RANGE")
  const recoverySpo2Range        = useRangeSpec("SPO2_RANGE")
  const recoveryTemperatureRange = useRangeSpec("TEMPERATURE_RANGE")
  const { isWatching, takeover } = useCaseLock(id, true)
  const [saving, setSaving]   = useState(false)
  const [loading, setLoading] = useState(true)
  const [finalizedAt, setFinalizedAt] = useState<string | null>(null)
  const [caseStatus,  setCaseStatus]  = useState<string | null>(null)
  const [autosaveState, setAutosaveState] = useState<AutosaveState>("idle")
  const [autosaveErrMsg, setAutosaveErrMsg] = useState<string | null>(null)
  const [blockedIssue, setBlockedIssue] = useState<BlockedSaveIssue | null>(null)
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null)
  const lastSavedJsonRef = useRef("")
  const [clinicalMode, setClinicalMode] = useState<"ADULT" | "PEDIATRIC">("ADULT")
  const [patientAge, setPatientAge] = useState<{ ageValue: number | null; ageUnit: PediatricAgeUnit | null; ageYears: number | null }>({ ageValue: null, ageUnit: null, ageYears: null })
  const [preopSystolic, setPreopSystolic] = useState<number | null>(null)
  // The planned procedure was not yet known: the procedure done is then required (10.0.0).
  const [procedureUndetermined, setProcedureUndetermined] = useState(false)
  const [legacyPain, setLegacyPain] = useState<string | null>(null)
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const ALDRETE_CRITERIA = aldreteCriteria(tc)
  const STEWARD_CRITERIA = stewardCriteria(tc)

  const { control, handleSubmit, reset, getValues, setValue } = useForm<FormInput, unknown, FormData>({
    resolver: zodResolver(postopFormSchema),
    // Nothing clinical is pre-filled. These defaulted to 0 and false, and
    // autosave on any other postop field persisted them, so a patient nobody
    // had assessed was documented with an Aldrete of 0 — no movement, apnoeic,
    // circulatory collapse — and PONV explicitly ruled out. Undefined means
    // "not assessed", which is what it was.
    defaultValues: {
      handoverItems: [],
    },
  })

  // Watch all five Aldrete score fields to compute the live total
  const aldreteActivity      = useWatch({ control, name: "aldreteActivity" })
  const aldreteRespiration   = useWatch({ control, name: "aldreteRespiration" })
  const aldreteCirculation   = useWatch({ control, name: "aldreteCirculation" })
  const aldreteConsciousness = useWatch({ control, name: "aldreteConsciousness" })
  const aldreteSpO2          = useWatch({ control, name: "aldreteSpO2" })
  const stewardConsciousness = useWatch({ control, name: "stewardConsciousness" })
  const stewardAirway        = useWatch({ control, name: "stewardAirway" })
  const stewardMovement      = useWatch({ control, name: "stewardMovement" })
  const disposition        = useWatch({ control, name: "disposition" })
  const handoverItems      = useWatch({ control, name: "handoverItems" }) ?? []
  const dispositionNotes   = useWatch({ control, name: "dispositionNotes" })
  const ponv               = useWatch({ control, name: "ponv" })
  const formValues         = useWatch({ control })
  const pediatricMode = clinicalMode === "PEDIATRIC"
  const painLanguage = language === "bg" ? "bg" : "en"

  // The hospital's section switches (10.0.0), kept with the preop profile.
  const profiles = usePreopProfiles()
  const sectionConfig = preopSectionConfigFor(profiles?.sectionConfigs, clinicalMode)
  const showVitals = sectionConfig.sections.POSTOP_RECOVERY_VITALS
  const showPain = sectionConfig.sections.POSTOP_PAIN
  const showDelirium = paedOffered(clinicalMode) && sectionConfig.sections.POSTOP_DELIRIUM
  const showPonv = sectionConfig.sections.POSTOP_PONV
  const showHandover = sectionConfig.sections.POSTOP_HANDOVER
  const painScales = painScalesFor({ clinicalMode, ...patientAge })

  // Pain and delirium item by item.
  const items = formValues as Partial<Record<string, number | null>>
  const flacc = flaccTotal(items)
  const nips = nipsTotal(items)
  const paed = paedTotal(items)
  const painLine = painSummaryEntries({
    flaccTotal: flacc, nipsTotal: nips, fpsrScore: items.fpsrScore ?? null, painScoreNRS: items.painScoreNRS ?? null,
  }, painLanguage).map(entry => `${entry.label} ${entry.value.split(" · ")[0]}`).join(", ") || null

  // What the recovery observations suggest for two Aldrete items: outlined,
  // and set only by the clinician's tap.
  const suggestions: Partial<Record<string, { score: number; text: string }>> = {}
  if (!pediatricMode && showVitals) {
    const spo2Value = formValues.recoverySpO2Unobtainable ? null : formValues.recoverySpO2 ?? null
    const spo2 = suggestAldreteSpO2(spo2Value)
    if (spo2 != null) suggestions.aldreteSpO2 = { score: spo2, text: tc("suggestSpo2").replace("{score}", String(spo2)).replace("{value}", String(spo2Value)) }
    const sbp = formValues.recoveryBpUnobtainable ? null : formValues.recoveryBpSystolic ?? null
    const circulation = suggestAldreteCirculation(sbp, preopSystolic)
    if (circulation != null) {
      suggestions.aldreteCirculation = { score: circulation, text: tc("suggestCirculation").replace("{score}", String(circulation)).replace("{recovery}", String(sbp)).replace("{preop}", String(preopSystolic)) }
    }
  }

  useEffect(() => {
    if (disposition === "WARD" || disposition === "PACU") return
    if (handoverItems.length) setValue("handoverItems", [], { shouldDirty: true })
    if (dispositionNotes) setValue("dispositionNotes", "", { shouldDirty: true })
  }, [disposition, dispositionNotes, handoverItems.length, setValue])

  // A child is scored on Steward instead of Aldrete (10.0.0).
  const aldreteTotal = pediatricMode
    ? calculateStewardTotal({ stewardConsciousness, stewardAirway, stewardMovement })
    : calculateAldreteTotal({
      aldreteActivity,
      aldreteRespiration,
      aldreteCirculation,
      aldreteConsciousness,
      aldreteSpO2,
    })
  // Null until all components are recorded. Without this an unassessed
  // patient scored 0 and was labelled "continue recovery" as though someone had
  // looked and found them unresponsive.
  const aldreteStatus = aldreteTotal == null ? null : pediatricMode ? stewardBand(aldreteTotal) : aldreteBand(aldreteTotal)

  const aldreteLabel = tc(aldreteStatus === null ? "aldreteNotAssessed"
    : aldreteStatus === "ready" ? "summaryReadyDischarge"
    : aldreteStatus === "observe" ? "summaryMonitor" : "summaryContinueRecovery")

  type PostopRecord = Partial<FormData> & {
    activityScore?: number
    respirationScore?: number
    circulationScore?: number
    consciousnessScore?: number
    spO2Score?: number
    temperaturePostop?: number
    updatedAt?: string
    syncRevision?: number
  }
  type CaseResponse = { clinicalMode?: "ADULT" | "PEDIATRIC"; preop?: { ageYears?: number | null; ageValue?: number | null; ageUnit?: PediatricAgeUnit | null; bpSystolic?: number | null; proceduresJson?: unknown; procedureUndetermined?: boolean }; postop?: PostopRecord; finalizedAt?: string | null; status?: string }

  const valuesFromPostop = useCallback((p: PostopRecord, _mode: "ADULT" | "PEDIATRIC"): FormData => {    return {
      // See postop-aldrete-hydration: undefined, not 0, for unassessed -- 0 is a real, pathological score.
      ...aldreteFromServerPostop(p),
      // A recovery observation that was not recorded stays unrecorded. These
      // previously fell back to a random value in the normal adult range, which
      // was then pre-filled into the form and could be submitted unchanged --
      // the record then showed a reading nobody had taken.
      recoveryBpSystolic:   p.recoveryBpSystolic,
      recoveryBpDiastolic:  p.recoveryBpDiastolic,
      recoveryHeartRate:    p.recoveryHeartRate,
      recoverySpO2:         p.recoverySpO2,
      temperatureCelsius:   p.temperatureCelsius ?? p.temperaturePostop,
      recoveryBpUnobtainable:          p.recoveryBpUnobtainable          ?? false,
      recoveryHeartRateUnobtainable:   p.recoveryHeartRateUnobtainable   ?? false,
      recoverySpO2Unobtainable:        p.recoverySpO2Unobtainable        ?? false,
      recoveryTemperatureUnobtainable: p.recoveryTemperatureUnobtainable ?? false,
      painScoreNRS:       p.painScoreNRS,
      // null, not undefined: only null survives into a patch to clear an answer.
      ponv:               p.ponv ?? null,
      // The server sends null for "not chosen"; the form schema takes only
      // absent for these two, and a null made every autosave of a reopened
      // record fail its parse and skip without a word (10.0.0).
      disposition:        p.disposition ?? undefined,
      dispositionNotes:   p.dispositionNotes   ?? "",
      pediatricPainScale: p.pediatricPainScale ?? undefined,
      pediatricPainScore: p.pediatricPainScore,
      paedScore:          p.paedScore,
      // Pain and delirium item by item (10.0.0): unscored stays unscored.
      ...Object.fromEntries(POSTOP_PAIN_ITEM_FIELDS.map(field => [field, (p as Record<string, unknown>)[field] ?? undefined])),
      handoverItems:      normaliseHandoverCodes(Array.isArray(p.handoverItems) ? p.handoverItems : []),
      performedProcedures: Array.isArray((p as { performedProceduresJson?: unknown }).performedProceduresJson)
        ? (p as { performedProceduresJson: FormData["performedProcedures"] }).performedProceduresJson
        : Array.isArray((p as { performedProcedures?: unknown }).performedProcedures) ? (p as { performedProcedures: FormData["performedProcedures"] }).performedProcedures : [],
    }
  }, [])

  const payloadFrom = useCallback((data: FormData) => {
    return canonicalizePostopPatch(data)
  }, [])

  const blockedMessage = useCallback((issue: BlockedSaveIssue) => {
    const field = issue.field === "dispositionNotes" ? tc("dispNotes") : issue.field
    switch (issue.reason) {
      case "likely_name": return tc("piiLikelyName").replace("{field}", field)
      case "egn": return tc("piiEgn").replace("{field}", field)
      case "long_number": return tc("piiLongNumber").replace("{field}", field)
      case "date": return tc("piiDate").replace("{field}", field)
      case "email": return tc("piiEmail").replace("{field}", field)
      default: return issue.message || tc("piiGeneric").replace("{field}", field)
    }
  }, [tc])

  const markSaveResult = useCallback((
    result: CasePatchResult,
    response?: CasePatchResponse,
    blocked?: BlockedSaveIssue,
  ) => {
    if (result === "saved") {
      setLastSavedAt(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }))
      setAutosaveState("saved")
      setAutosaveErrMsg(null)
      setBlockedIssue(null)
      // The section saved, but the server refused individual values as out of
      // range. Name them: they are still on screen, so staying quiet would let
      // the clinician believe they were stored.
      const rejected = response?.rejectedFields ?? []
      if (rejected.length) {
        const labels: Record<string, string> = {
          recoverySystolic:  tc("sbpLabel"),
          recoveryDiastolic: tc("dbpLabel"),
          recoveryHeartRate: tc("heartRateLabel"),
          recoverySpo2:      "SpO₂",
          recoveryTemp:      tc("temperatureLabel"),
          painNrs:           tc("painNRS"),
        }
        const names = rejected.map(r => {
          const key = r.path.split(".").pop() ?? r.path
          return labels[key] ?? key
        })
        notify(tc("fieldNotSavedOutOfRange"), names.join(", "))
      }
    } else if (result === "blocked" && blocked) {
      setBlockedIssue(blocked)
      setAutosaveErrMsg(blockedMessage(blocked))
      setAutosaveState("blocked")
    } else if (result === "queued" || result === "failed") {
      setBlockedIssue(null)
      setAutosaveErrMsg(null)
      setAutosaveState("queued")
    }
  }, [blockedMessage, tc])

  const persistPostop = useCallback(async (data: FormData): Promise<CasePatchResult> => {
    const payload = payloadFrom(data)
    const { result, response, blocked } = await autosaveManager.saveSection(
      id,
      "postop",
      payload as Record<string, unknown>,
      { fullPayload: payload as Record<string, unknown> },
    )
    lastSavedJsonRef.current = JSON.stringify(payload)
    markSaveResult(result, response, blocked)
    return result
  }, [id, markSaveResult, payloadFrom])

  useEffect(() => {
    // Drain a durable local change before hydrating the form so a stale server
    // snapshot cannot overwrite work recovered after an app restart.
    autosaveManager.flushCase(id).catch(() => {}).then(() =>
      apiJson<CaseResponse>(`/api/cases/${id}`)
    )
      .then(async (c) => {
        const p = c.postop ?? {}
        const mode = c.clinicalMode ?? "ADULT"
        setClinicalMode(mode)
        setPatientAge({ ageValue: c.preop?.ageValue ?? null, ageUnit: c.preop?.ageUnit ?? null, ageYears: c.preop?.ageYears ?? null })
        setPreopSystolic(c.preop?.bpSystolic ?? null)
        setProcedureUndetermined(c.preop?.procedureUndetermined === true)
        setLegacyPain(p.pediatricPainScale && p.pediatricPainScore != null
          ? tc("painEarlier").replace("{scale}", painScaleLabel(p.pediatricPainScale)).replace("{score}", String(p.pediatricPainScore))
          : null)
        const serverValues = valuesFromPostop(p, mode)
        const queuedPostop = await autosaveManager.outbox.load<Record<string, unknown>>(id, "postop")
        const nextValues = valuesFromPostop({ ...p, ...(queuedPostop ?? {}) }, mode)
        lastSavedJsonRef.current = JSON.stringify(payloadFrom(nextValues))
        // The procedure done starts as the one planned (10.0.0).
        if (!nextValues.performedProcedures?.length && Array.isArray(c.preop?.proceduresJson) && c.preop.proceduresJson.length > 0) {
          nextValues.performedProcedures = c.preop.proceduresJson as FormData["performedProcedures"]
        }
        // Pre-populate dispositionNotes with continued-postop items if field is empty
        if (continuedItems && !nextValues.dispositionNotes) {
          const itemList = decodeURIComponent(continuedItems).split("|").filter(Boolean)
          if (itemList.length > 0) {
            nextValues.dispositionNotes = t("continuedPostop") + " " + itemList.join(", ")
          }
        }
        autosaveManager.hydrateSection(
          id,
          "postop",
          payloadFrom(serverValues) as Record<string, unknown>,
          p.syncRevision ?? p.updatedAt ?? null,
        )
        reset(nextValues)
        setFinalizedAt(c.finalizedAt ?? null)
        setCaseStatus(c.status ?? null)
        const managerState = autosaveManager.getState(id)
        if (managerState.status === "blocked" && managerState.blocked) {
          markSaveResult("blocked", undefined, managerState.blocked)
        } else if (managerState.pending > 0) {
          markSaveResult("queued")
        } else {
          markSaveResult("saved")
        }
      })
      .catch(() => notify(tc("errorLabel"), tc("caseLoadFailed")))
      .finally(() => setLoading(false))
  }, [continuedItems, id, markSaveResult, payloadFrom, reset, t, tc, valuesFromPostop])

  useEffect(() => {
    if (loading) return
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current)

    autosaveTimerRef.current = setTimeout(async () => {
      const parsed = postopFormSchema.safeParse(getValues())
      if (!parsed.success) return
      const payload = payloadFrom(parsed.data)
      const nextJson = JSON.stringify(payload)
      if (nextJson === lastSavedJsonRef.current) return

      setAutosaveState("saving")
      setAutosaveErrMsg(null)
      try {
        await persistPostop(parsed.data)
      } catch {
        setAutosaveErrMsg(tc("autosaveError"))
        setAutosaveState("error")
      }
    }, 900)

    return () => {
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current)
    }
  }, [formValues, getValues, loading, persistPostop, payloadFrom, tc])

  useLiveRefresh(async () => {
    await autosaveManager.flushCase(id)
    if (autosaveManager.getState(id).pending === 0) markSaveResult("saved")
  }, { enabled: !loading && autosaveState === "queued", intervalMs: 10_000 })


  // ── Sections (10.0.0): one at a time with a swipe, or all in one scroll,
  // as the preop form is set. Recovery score and discharge are always there:
  // both are needed to finalise.
  type PostopSectionKey = "vitals" | "score" | "pain" | "discharge"
  const sectionList: { key: PostopSectionKey; label: string; required: boolean; missing: boolean }[] = [
    ...(showVitals ? [{ key: "vitals" as const, label: tc("postopSectionVitals"), required: false, missing: false }] : []),
    { key: "score", label: tc("postopSectionScore"), required: true, missing: aldreteTotal == null },
    ...(showPain || showDelirium || showPonv ? [{ key: "pain" as const, label: tc("postopSectionPain"), required: false, missing: false }] : []),
    { key: "discharge", label: tc("postopSectionDischarge"), required: true, missing: !disposition },
  ]
  const sectionKeys = sectionList.map(section => section.key).join("|")
  const pagerKeys = useMemo(() => sectionKeys.split("|") as PostopSectionKey[], [sectionKeys])
  const paged = postopLayout === "sections"
  const pager = useSectionPager(pagerKeys, paged, screenWidth)
  const pagerGo = pager.go
  // Where each section starts in the scroll: its place in the section block plus
  // where that block starts, below the summary.
  const sectionY = useRef<Partial<Record<PostopSectionKey, number>>>({})
  const blockY = useRef(0)
  const sectionTop = useCallback((key: PostopSectionKey) => blockY.current + (sectionY.current[key] ?? 0), [])
  // In the scrolling layout the strip follows the scroll.
  const followScroll = (y: number) => {
    if (paged) return
    const passed = sectionList.filter(section => sectionTop(section.key) <= y + 24)
    const current = passed[passed.length - 1]?.key ?? sectionList[0].key
    if (current !== pager.active) pager.go(current)
  }
  const markY = (key: PostopSectionKey) => (event: { nativeEvent: { layout: { y: number } } }) => { sectionY.current[key] = event.nativeEvent.layout.y }
  const jumpTo = useCallback((key: PostopSectionKey) => {
    pagerGo(key)
    if (!paged) setTimeout(() => focusScroll.ref.current?.scrollTo({ y: Math.max(0, sectionTop(key) - 8), animated: true }), 30)
  }, [focusScroll.ref, pagerGo, paged, sectionTop])
  // A readiness "Go to" opens its section.
  useEffect(() => {
    const key = focus === "recovery" ? "score" : focus === "disposition" ? "discharge" : null
    if (loading || !key) return
    // Scrolling: once the sections have been laid out.
    jumpTo(key)
  }, [focus, jumpTo, loading])
  // Each section opens at its top.
  useEffect(() => {
    if (paged) focusScroll.ref.current?.scrollTo({ y: 0, animated: false })
  }, [focusScroll.ref, paged, pager.active])
  const nextSection = paged ? sectionList[sectionList.findIndex(section => section.key === pager.active) + 1] : undefined
  // The open section's pill is kept in view, centred, as preop's are: the last
  // one sat half off the screen (10.0.0).
  const stripRef = useRef<ScrollView>(null)
  const pillX = useRef<Partial<Record<PostopSectionKey, { x: number; width: number }>>>({})
  useEffect(() => {
    const pill = pillX.current[pager.active]
    if (pill) stripRef.current?.scrollTo({ x: Math.max(0, pill.x + pill.width / 2 - screenWidth / 2), animated: true })
  }, [pager.active, screenWidth])

  async function onSubmit(data: FormData) {
    setSaving(true)
    try {
      const result = await persistPostop(data)
      if (result === "saved") {
        // The postop is stored either way; a refusal means no closure countdown
        // started, and it used to be swallowed. A case finalised elsewhere is
        // named, then opened like a submitted one.
        const submitted = await submitCaseForReview(id)
        if (!submitted.ok) notify(tc("errorLabel"), tc(submitForReviewMessage(submitted)))
        if (!submitted.ok && submitted.reason !== "finalised") return
        router.replace(`/(app)/cases/${id}`)
      } else if (result === "blocked") {
        notify(tc("draftBlocked"), autosaveManager.getState(id).error ?? tc("autosaveError"))
      } else {
        notify(t("savedLocally"), t("savedLocallyMsg"))
      }
    } catch {
      notify(tc("errorLabel"), t("couldNotOverwrite"))
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <ScreenState title={t("loadingRecovery")} loading />
      </View>
    )
  }

  return (
    <>
      <Stack.Screen options={{ title: tc("postopTitle"), headerShown: false }} />
      <AppHeader title={tc("postopTitle")} showNewCase={false} />
      {caseStatus === "COMPLETE" && finalizedAt && (
        <EditWindowBanner finalizedAt={finalizedAt} caseId={id} showBackButton />
      )}
      <TouchableOpacity
        onPress={() => router.replace(`/(app)/cases/intraop/${id}`)}
        style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingVertical: 10, gap: 6, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.surface }}
      >
        <Text style={{ color: colors.primary, fontSize: 13, fontWeight: "800" }}>{t("backToIntraop")}</Text>
      </TouchableOpacity>
      {isWatching && <WatchingOverlay onTakeover={takeover} />}
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: colors.background }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        {/* The sections, as a strip: a red dot where a field needed to finalise is empty. */}
        <View style={{ borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.background }}>
          <ScrollView ref={stripRef} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 8, gap: 8 }}>
            {sectionList.map(section => {
              const isActive = pager.active === section.key
              return (
                <Pressable
                  key={section.key}
                  testID={`postop-pill-${section.key}`}
                  onLayout={event => { pillX.current[section.key] = { x: event.nativeEvent.layout.x, width: event.nativeEvent.layout.width } }}
                  onPress={() => jumpTo(section.key)}
                  style={{
                    minHeight: 40,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: isActive ? withAlpha(colors.primary, "AA") : colors.border,
                    backgroundColor: isActive ? colors.primarySoft : colors.surfaceRaised,
                    paddingHorizontal: 15,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <Text style={{ color: isActive ? colors.primary : colors.textSecondary, fontSize: 13, fontWeight: "900" }}>
                    {section.label}{section.required ? <Text style={{ color: colors.danger }}> *</Text> : null}
                  </Text>
                  {section.missing ? <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: colors.danger }} /> : null}
                </Pressable>
              )
            })}
          </ScrollView>
        </View>
        <View style={{ flex: 1 }} {...pager.panHandlers}>
        <ScrollView ref={focusScroll.ref} style={{ paddingHorizontal: 20, paddingTop: 2 }} contentContainerStyle={{ paddingBottom: 80 }} keyboardShouldPersistTaps="handled" scrollEventThrottle={64} onScroll={event => followScroll(event.nativeEvent.contentOffset.y)}>
          <RecoverySummary
            total={aldreteTotal}
            status={aldreteStatus}
            steward={pediatricMode}
            label={aldreteLabel}
            disposition={disposition}
            pain={painLine}
            ponv={ponv}
            compact={paged}
          />
          <Text style={{ color: autosaveState === "error" || autosaveState === "blocked" ? colors.danger : autosaveState === "queued" ? colors.warning : colors.textMuted, fontSize: 12, fontWeight: "800", marginTop: 2, marginBottom: 4, textAlign: "right" }}>
            {autosaveState === "saving"
              ? tc("autosaveSaving")
              : autosaveState === "queued"
              ? tc("autosaveQueued")
              : autosaveState === "blocked"
              ? (autosaveErrMsg ?? tc("draftBlocked"))
              : autosaveState === "error"
              ? (autosaveErrMsg ?? tc("autosaveError"))
              : lastSavedAt
              ? `${t("savedAt")} ${lastSavedAt}`
              : tc("autosaveReady")}
          </Text>

          <Animated.View style={pager.style} onLayout={event => { blockY.current = event.nativeEvent.layout.y }}>
          {(pager.shown("vitals") || pager.shown("score")) && <PostopVitalsAndScore control={control} pediatricMode={pediatricMode} screenWidth={screenWidth} unitPrefs={unitPrefs} tc={tc} recoveryBpSystolicRange={recoveryBpSystolicRange} recoveryBpDiastolicRange={recoveryBpDiastolicRange} recoveryHeartRateRange={recoveryHeartRateRange} recoverySpo2Range={recoverySpo2Range} recoveryTemperatureRange={recoveryTemperatureRange} aldreteCriteria={ALDRETE_CRITERIA} stewardCriteria={STEWARD_CRITERIA} suggestions={suggestions} markY={markY} />}

          <PostopPainDisposition control={control} setValue={setValue} tc={tc} handoverNotesPlaceholder={t("handoverNotesPlaceholder")} items={items} painLanguage={painLanguage} painScales={painScales} legacyPain={legacyPain} flacc={flacc} nips={nips} paed={paed} showPainSection={pager.shown("pain")} showDischargeSection={pager.shown("discharge")} showPain={showPain} showDelirium={showDelirium} showPonv={showPonv} ponv={ponv} disposition={disposition} procedureUndetermined={procedureUndetermined} showHandover={showHandover} blockedDispositionMessage={blockedIssue?.field === "dispositionNotes" && blockedIssue ? blockedMessage(blockedIssue) : undefined} markY={markY} />

          {nextSection ? (
            <TouchableOpacity
              testID="postop-next-section"
              accessibilityRole="button"
              onPress={() => jumpTo(nextSection.key)}
              style={{ backgroundColor: colors.primarySoft, borderRadius: 16, borderCurve: "continuous", paddingVertical: 15, alignItems: "center", marginTop: 22, borderWidth: 1, borderColor: withAlpha(colors.primary, "88") }}
            >
              <Text style={{ color: colors.primary, fontWeight: "900", fontSize: 16 }}>{tc("postopNext").replace("{section}", nextSection.label)} →</Text>
            </TouchableOpacity>
          ) : (
          <TouchableOpacity
              style={{
                backgroundColor: colors.success,
                borderRadius: 16,
                borderCurve: "continuous",
                paddingVertical: 15,
                alignItems: "center",
                marginTop: 22,
                borderWidth: 1,
                borderColor: withAlpha(colors.success, "99"),
                boxShadow: "0 12px 26px rgba(0, 0, 0, 0.32)",
              }}
              onPress={handleSubmit(onSubmit)}
              disabled={isWatching || saving}
            >
              {saving ? (
                <ActivityIndicator color={shade("#fff")} />
              ) : (
                <Text style={{ color: colors.background, fontWeight: "900", fontSize: 16 }}>{tc("continueToSummary")}</Text>
              )}
            </TouchableOpacity>
          )}
          </Animated.View>

        </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </>
  )
}
