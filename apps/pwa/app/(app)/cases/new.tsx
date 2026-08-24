import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  ActivityIndicator,
  Animated,
  Easing,
  BackHandler,
  KeyboardAvoidingView,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native"
import { hapticTick } from "@/lib/haptic"
import { Stack, useRouter, useLocalSearchParams, useFocusEffect } from "expo-router"
import Ionicons from "@expo/vector-icons/Ionicons"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { Controller, useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { ApiError, apiFetch, apiJson } from "@/lib/api"
import { autosaveManager } from "@/lib/autosave-manager"
import { deleteLocalCaseDraft, loadLocalCaseDraft, makeLocalCaseId, saveLocalCaseDraft } from "@/lib/local-case-store"
import { buildPreopPayload } from "@/lib/preop-payload"
import { preopFormSchema, type PreopFormData as FormData, type PreopFormInput as FormInput, type PreopSection } from "@/lib/preop-form-schema"
import { buildPreopSectionItems } from "@/lib/preop-section-overview"
import { localizedPreopSectionLabels } from "@/lib/preop-section-labels"
import { valuesFromServerPreop, type ServerPreop } from "@/lib/preop-server-values"
import { PREOP_REQUIRED_FIELD_SECTION, preopInvalidSubmitMessage } from "@/lib/preop-validation-navigation"
import { postPreopServerCase } from "@/lib/preop-server-create"
import { suggestASAFromTags } from "@/lib/preop-asa-suggestion"
import { monthYearForDate } from "@/lib/intraop-timing"
import { ChecklistGroup, ChecklistRow, ClinicalSwitchRow, Field, PrimaryButton, SectionHeader, StyledInput } from "@/components/ui"
import { ClinicalYesNoRow } from "@/components/ClinicalYesNoRow"
import { SearchTagInput } from "@/components/SearchTagInput"
import { notify } from "@/lib/notify"
import { ClinicalNumberInput } from "@/components/ClinicalNumberInput"
import { PreopSectionCard as SectionCard } from "@/components/preop/PreopSectionCard"
import { convertedMeasurement } from "@/lib/use-converted-measurement"
import { LabScanPanel } from "@/components/LabScanPanel"
import { AiAdvisorPanel } from "@/components/AiAdvisorPanel"
import {
  capabilityMessageKey,
  useDeploymentCapabilities,
} from "@/lib/deployment-capabilities"
import { AppHeader } from "@/components/AppHeader"
import { EditWindowBanner } from "@/components/EditWindowBanner"
import { colors, withAlpha } from "@/theme/colors"
import { usePreferences } from "@/lib/preferences-context"
import { localizedPreopValidationMessage } from "@/lib/preop-validation-messages"
import { useOptionLibrary, useRangeSpec } from "@/lib/use-option-library"
import { resolveIdealBodyWeight } from "@lospor/core/ideal-body-weight"
import { displayOption } from "@/lib/clinical-display"
import type { BlockedSaveIssue } from "@lospor/core/sync"
import { suggestRcriIschemicHeart, suggestRcriCHF, suggestRcriCVD, suggestRcriInsulinDM, suggestRcriCreatinine, suggestStopBangBP } from "@/lib/risk-derivation"
import {
  AsaPicker,
  BloodGrid,
  ComorbiditiesBySystem,
  ManualLabPanel,
  MetricBadge,
  ScoreBadge,
  SegmentedSelect,
  VitalNumber,
  apfelRiskLabel,
  rcriRiskLabel,
  stopBangRiskLabel,
} from "@/components/preop/PreopFormWidgets"
import {
  PediatricModeAgeFields,
  PediatricRiskAndCalculators,
  PediatricVitalReferenceNote,
} from "@/components/preop/PediatricPreopSections"

const SECTION_RAIL_EXPANDED_HEIGHT = 68

function impact() {
  hapticTick()
}

export default function NewCaseScreen() {
  const router = useRouter()
  const { continue: continueId, localId: localIdParam } = useLocalSearchParams<{ continue?: string; localId?: string }>()
  const insets = useSafeAreaInsets()
  const { preopLayout, tc, language, heightUnit, weightUnit, temperatureUnit, etco2Unit } = usePreferences()
  const { clinicalAi, pediatricMode: pediatricModeCapability } = useDeploymentCapabilities()
  const unitPrefs = { heightUnit, weightUnit, temperatureUnit, etco2Unit }
  const ageRange         = useRangeSpec("AGE_RANGE")
  const heightRange      = useRangeSpec("HEIGHT_RANGE")
  const weightRange      = useRangeSpec("WEIGHT_RANGE")
  const bpSystolicRange  = useRangeSpec("BP_SYSTOLIC_RANGE")
  const bpDiastolicRange = useRangeSpec("BP_DIASTOLIC_RANGE")
  const heartRateRange   = useRangeSpec("HEART_RATE_RANGE")
  const spo2Range        = useRangeSpec("SPO2_RANGE")
  const temperatureRange = useRangeSpec("TEMPERATURE_RANGE")
  const respiratoryRange = useRangeSpec("RESPIRATORY_RATE_RANGE")
  const mouthOpeningRange= useRangeSpec("MOUTH_OPENING_RANGE")
  const thyromentalRange = useRangeSpec("THYROMENTAL_RANGE")
  const { options: mallampatiOptions }    = useOptionLibrary("MALLAMPATI")
  const { options: neckMobilityOptions }  = useOptionLibrary("NECK_MOBILITY")
  const { options: upperLipBiteOptions }  = useOptionLibrary("UPPER_LIP_BITE")
  const { options: cormackLehaneOptions } = useOptionLibrary("CORMACK_LEHANE")

  const SECTION_LABELS = useMemo(() => localizedPreopSectionLabels(tc), [tc])
  const { width: screenWidth } = useWindowDimensions()
  const primaryHeaderHeight = insets.top + 60
  const scrollRef = useRef<ScrollView>(null)
  const sectionRailRef = useRef<ScrollView>(null)
  const pillLayouts = useRef<Partial<Record<PreopSection, { x: number; width: number }>>>({})
  const sectionY = useRef<Partial<Record<PreopSection, number>>>({})
  const lastScrollY = useRef(0)

  function scrollToSection(section: PreopSection, extraOffset = 0) {
    const y = (sectionY.current[section] ?? 0) + extraOffset
    scrollRef.current?.scrollTo({ y: Math.max(0, y - 40), animated: true })
  }
  const activeSectionRef = useRef<PreopSection>("patient")
  const slideAnim = useRef(new Animated.Value(0)).current
  const gestureScale = useRef(new Animated.Value(1)).current
  const slideDir = useRef<1 | -1>(1)
  const headerAnim = useRef(new Animated.Value(0)).current
  const headerCollapseRef = useRef(0)
  const scrollYAnim = useRef(new Animated.Value(0)).current
  const scrollRailVisibleRef = useRef(false)
  const maxScrollYRef = useRef(1)
  const isScrollingRef = useRef(false)
  const scrollEndTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [saving, setSaving] = useState(false)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiText, setAiText] = useState("")
  const [aiError, setAiError] = useState("")
  const [activeSection, setActiveSection] = useState<PreopSection>("patient")
  const [preopMode, setPreopMode] = useState<"overview" | "editing">("overview")
  const preopModeRef = useRef<"overview" | "editing">("overview")

  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener("hardwareBackPress", () => {
        if (preopModeRef.current === "editing") {
          setPreopMode("overview")
          preopModeRef.current = "overview"
          return true // consumed — don't bubble to navigator
        }
        return false // let the navigator handle it (goes to dashboard)
      })
      return () => sub.remove()
    }, [])
  )

  const [scrollRailVisible, setScrollRailVisible] = useState(false)
  const [appHeaderHidden, setAppHeaderHidden] = useState(false)
  const [railHeight, setRailHeight] = useState(1)
  const [maxScrollY, setMaxScrollY] = useState(1)
  const scrollRailTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [draftState, setDraftState] = useState<"idle" | "saving" | "saved" | "queued" | "blocked">("idle")
  const [saveError, setSaveError] = useState<string | null>(null)
  const [blockedIssue, setBlockedIssue] = useState<BlockedSaveIssue | null>(null)

  const blockedMessage = useCallback((issue: BlockedSaveIssue) => {
    const field = (() => {
      switch (issue.field) {
        case "diagnosis":
        case "diagnoses": return tc("diagnosisLabel")
        case "plannedProcedure":
        case "procedures": return tc("procedureLabel")
        case "comorbidities": return tc("activeComorbidities")
        case "teamNotes": return tc("teamNotesLabel")
        case "allergyDetails": return tc("allergenSearch")
        case "currentMedications": return tc("medicationSearch")
        case "familyAnesthesiaDetails": return tc("familyAnesthesiaDetails")
        case "difficultAirwayNotes": return tc("difficultAirwayNotes")
        case "physicalExamReport": return tc("physicalExamReport")
        default: return issue.field
      }
    })()
    switch (issue.reason) {
      case "likely_name": return tc("piiLikelyName").replace("{field}", field)
      case "egn": return tc("piiEgn").replace("{field}", field)
      case "long_number": return tc("piiLongNumber").replace("{field}", field)
      case "date": return tc("piiDate").replace("{field}", field)
      case "email": return tc("piiEmail").replace("{field}", field)
      default: return tc("piiGeneric").replace("{field}", field)
    }
  }, [tc])

  // Turn server-rejected paths ("preop.heightCm") into clinical field names.
  // Defined here rather than reusing requiredFieldLabels below, which is
  // declared after the autosave callback that needs this.
  const rejectedFieldsMessage = useCallback((rejected: { path: string }[]) => {
    const labels: Record<string, string> = {
      ageYears:         tc("ageYears"),
      heightCm:         tc("heightCm"),
      weightKg:         tc("weightKg"),
      bpSystolic:       tc("sbpLabel"),
      bpDiastolic:      tc("dbpLabel"),
      heartRate:        tc("heartRateLabel"),
      respiratoryRate:  tc("respiratoryRateLabel"),
    }
    const names = rejected.map(r => {
      const key = r.path.split(".").pop() ?? r.path
      return labels[key] ?? key
    })
    return `${tc("fieldNotSavedOutOfRange")}: ${names.join(", ")}`
  }, [tc])
  const localIdRef = useRef<string | null>(localIdParam ?? null)
  const autosaveDraftRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const autosaveInFlightRef = useRef<Promise<void> | null>(null)
  const flushAutosaveRef = useRef<() => void>(() => {})
  const submittingRef = useRef(false)
  const caseIdRef = useRef<string | null>(null)
  const draftIdRef = useRef<string>(makeLocalCaseId())
  const [caseId, setCaseId] = useState<string | null>(null)
  const [persistedPediatricRecord, setPersistedPediatricRecord] = useState(false)
  const [preopFinalizedAt, setPreopFinalizedAt] = useState<string | null>(null)
  const [preopCaseStatus,  setPreopCaseStatus]  = useState<string | null>(null)

  const { control, handleSubmit, setValue, getValues, reset, formState: { errors } } = useForm<FormInput, unknown, FormData>({
    resolver: zodResolver(preopFormSchema),
    defaultValues: {
      clinicalMode: "ADULT",
      // Sex, ASA and elective/emergency start unset, and the vital signs start
      // empty. They used to be pre-answered as MALE / ASA I / elective with
      // random observations inside normal adult ranges, so a case saved before
      // the clinician reached those fields recorded assumptions as findings --
      // and biased the register toward healthy elective adult males.
      emergencySurgery: false,
      highRiskSurgery: false,
      diagnoses: [],
      procedures: [],
      comorbidities: [],
      currentMedications: [],
      allergyDetails: [],
      labResults: [],
    },
  })

  // Batched watch subscriptions — 4 groups instead of 17 individual calls
  const [clinicalMode, sex, smoking, ageYears, heightCm, weightKg, bloodType, rhFactor,
         allergies, familyAnesthesiaProblems, airwayUnobtainable, difficultAirwayHistory,
         labResults, _aiOptIn, highRiskSurgery, emergencySurgery, comorbidities, currentMedications,
         ageValue, ageUnit] =
    useWatch({ control, name: ["clinicalMode", "sex", "smoking", "ageYears", "heightCm", "weightKg", "bloodType", "rhFactor",
               "allergies", "familyAnesthesiaProblems", "airwayUnobtainable", "difficultAirwayHistory",
               "labResults", "aiOptIn", "highRiskSurgery", "emergencySurgery", "comorbidities", "currentMedications",
               "ageValue", "ageUnit"] })

  const pediatricMode = clinicalMode === "PEDIATRIC"

  const rcriInputs = useWatch({ control, name: ["rcriIschemicHeart", "rcriCHF", "rcriCVD", "rcriInsulinDM", "rcriCreatinine"] })
  const stopbangInputs = useWatch({ control, name: ["stopbangSnoring", "stopbangTired", "stopbangObserved", "stopbangBP", "stopbangNeck"] })
  const [apfelPONVHistory, apfelPostopOpioids] = useWatch({ control, name: ["apfelPONVHistory", "apfelPostopOpioids"] })

  const bmi = heightCm && weightKg ? weightKg / ((heightCm / 100) ** 2) : null

  // Suggestions only — never silently auto-checked, same rule as the ASA suggestion.
  const rcriSuggested = {
    rcriIschemicHeart: suggestRcriIschemicHeart(comorbidities ?? []),
    rcriCHF:            suggestRcriCHF(comorbidities ?? []),
    rcriCVD:            suggestRcriCVD(comorbidities ?? []),
    rcriInsulinDM:      suggestRcriInsulinDM(comorbidities ?? [], currentMedications ?? []),
    rcriCreatinine:     suggestRcriCreatinine(labResults ?? []),
  }
  const stopBangBPSuggested = suggestStopBangBP(comorbidities ?? [], currentMedications ?? [])
  const RCRI_HINT = tc("suggestionReviewHint")
  const asaSuggestion = suggestASAFromTags(comorbidities ?? [], bmi)
  const ibwResolution = useMemo(() => resolveIdealBodyWeight({
    clinicalMode: pediatricMode ? "PEDIATRIC" : "ADULT",
    heightCm,
    sex,
    age: pediatricMode && ageValue != null && ageUnit
      ? { value: ageValue, unit: ageUnit }
      : null,
  }), [ageUnit, ageValue, heightCm, pediatricMode, sex])
  const ibw = ibwResolution.available ? ibwResolution.roundedKg : null
  const abw = !pediatricMode && ibw != null && weightKg && weightKg > ibw ? ibw + 0.4 * (weightKg - ibw) : null
  const rcriScore = [highRiskSurgery, ...rcriInputs].filter(Boolean).length
  const apfelScore = [sex === "FEMALE", !smoking, apfelPONVHistory, apfelPostopOpioids].filter(Boolean).length
  const stopBangScore = [
    stopbangInputs[0],
    stopbangInputs[1],
    stopbangInputs[2],
    stopbangInputs[3],
    bmi != null && bmi > 35,
    ageYears != null && ageYears > 50,
    stopbangInputs[4],
    sex === "MALE",
  ].filter(Boolean).length

  useEffect(() => {
    if (!allergies && (getValues("allergyDetails")?.length ?? 0) > 0) {
      setValue("allergyDetails", [], { shouldDirty: true })
    }
    if (!familyAnesthesiaProblems && getValues("familyAnesthesiaDetails")) {
      setValue("familyAnesthesiaDetails", "", { shouldDirty: true })
    }
  }, [allergies, familyAnesthesiaProblems, getValues, setValue])

  const SECTION_KEYS = useMemo(() => SECTION_LABELS.map(s => s.key), [SECTION_LABELS])
  const activeIndex = SECTION_KEYS.indexOf(activeSection)
  function showSection(section: PreopSection): boolean {
    return preopLayout !== "sections" || activeSection === section
  }

  const goNextSection = useCallback(() => {
    if (activeIndex < SECTION_KEYS.length - 1) {
      impact()
      slideDir.current = 1
      setActiveSection(SECTION_KEYS[activeIndex + 1])
    }
  }, [SECTION_KEYS, activeIndex])

  const goPrevSection = useCallback(() => {
    if (activeIndex > 0) {
      impact()
      slideDir.current = -1
      setActiveSection(SECTION_KEYS[activeIndex - 1])
    }
  }, [SECTION_KEYS, activeIndex])

  const sectionSwipeResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponder: (_, { dx, dy }) =>
      preopLayout === "sections" && Math.abs(dx) > Math.abs(dy) * 1.5 && Math.abs(dx) > 20,
    onPanResponderRelease: (_, { dx }) => {
      if (dx < -50) goNextSection()
      else if (dx > 50) goPrevSection()
    },

  }), [goNextSection, goPrevSection, preopLayout])

  useEffect(() => {
    return () => {
      if (scrollRailTimer.current) clearTimeout(scrollRailTimer.current)
      if (autosaveDraftRef.current) {
        // A pending debounced autosave was about to fire — flush it instead
        // of just cancelling, or edits made in the last 2s before navigating
        // away are silently lost (never sent to the server, never written
        // to the local draft fallback either, since that only happens
        // inside the timer body).
        clearTimeout(autosaveDraftRef.current)
        flushAutosaveRef.current()
      }
    }
  }, [])

  // Helper: build the canonical preop payload from current form values
  // buildPreopPayload is imported from @/lib/preop-payload (shared with the offline flusher)

  // Attempt to create the case on the server with current form values.
  // Returns the new caseId on success, null on failure.
  const clearLocalDraft = useCallback(async () => {
    if (localIdRef.current) {
      await deleteLocalCaseDraft(localIdRef.current)
      localIdRef.current = null
    }
  }, [])

  const tryCreateServerCase = useCallback(async (values: FormInput): Promise<string | null> => {
    const result = await postPreopServerCase(values, draftIdRef.current, apiFetch)
    if (!result) return null
    if (!result.ok) {
      if (result.status != null) {
        console.error("[LOSPOR] POST /api/cases failed", result.status, result.body ?? {})
      } else {
        console.error("[LOSPOR] POST /api/cases network error", result.error)
      }
      setSaveError(tc("caseSaveFailed"))
      return null
    }
    setSaveError(null)
    caseIdRef.current = result.id
    setCaseId(result.id)
    setPersistedPediatricRecord(values.clinicalMode === "PEDIATRIC")
    void clearLocalDraft()
    autosaveManager.hydrateSection(
      result.id,
      "preop",
      result.acceptedPayload,
      result.revision ?? result.updatedAt,
    )
    if (result.blocked) {
      const fullPayload = buildPreopPayload(values)
      const outcome = await autosaveManager.saveSection(result.id, "preop", fullPayload, {
        fullPayload,
      })
      const issue = outcome.blocked ?? result.blocked
      setBlockedIssue(issue)
      setSaveError(blockedMessage(issue))
    } else {
      setBlockedIssue(null)
    }
    return result.id
  }, [blockedMessage, clearLocalDraft, tc])

  const persistLocalDraft = useCallback(async (values: FormInput): Promise<boolean> => {
    if (!localIdRef.current) localIdRef.current = makeLocalCaseId()
    const ok = await saveLocalCaseDraft(
      localIdRef.current,
      values,
      caseIdRef.current ?? undefined,
    )
    if (!ok) {
      // Storage write failed — tell the user the draft is NOT saved
      setSaveError(tc("storageDraftFailed"))
    }
    return ok
  }, [tc])

  // Load existing case when ?continue=<id> is in the URL
  useEffect(() => {
    if (!continueId) return
    caseIdRef.current = continueId
    setCaseId(continueId)
    // Flush any queued-but-unsent preop patch for this case before fetching —
    // otherwise a patch queued from a previous offline autosave sits unsent
    // until the periodic background flusher's next tick (up to 15s), and the
    // GET below would silently reset the form to that stale pre-edit
    // snapshot in the meantime, discarding the queued edit.
    autosaveManager.flushCase(continueId).catch(() => {}).then(() => Promise.all([
      apiJson<{ clinicalMode?: "ADULT" | "PEDIATRIC"; preop?: ServerPreop; finalizedAt?: string | null; status?: string }>(`/api/cases/${continueId}`),
      autosaveManager.outbox.load<Record<string, unknown>>(continueId, "preop").catch(() => null),
    ]))
      .then(([caseData, queuedPreop]) => {
        const p = caseData.preop ?? {}
        const loadedValues = valuesFromServerPreop({ ...p, ...(queuedPreop ?? {}) }, caseData.clinicalMode) as FormInput
        autosaveManager.hydrateSection(
          continueId,
          "preop",
          buildPreopPayload(valuesFromServerPreop(p, caseData.clinicalMode) as FormInput),
          p.syncRevision ?? p.updatedAt ?? null,
        )
        reset(loadedValues)
        setPersistedPediatricRecord(
          (caseData.clinicalMode ?? loadedValues.clinicalMode) === "PEDIATRIC",
        )
        const managerState = autosaveManager.getState(continueId)
        if (managerState.status === "blocked" && managerState.blocked) {
          setBlockedIssue(managerState.blocked)
          setSaveError(blockedMessage(managerState.blocked))
          setDraftState("blocked")
        }
        setPreopFinalizedAt(caseData.finalizedAt ?? null)
        setPreopCaseStatus(caseData.status ?? null)
        void clearLocalDraft()
      })
      .catch(async (err: Error) => {
        if (err instanceof ApiError && err.status === 404) {
          caseIdRef.current = null
          setCaseId(null)
          setPersistedPediatricRecord(false)
          notify(tc("errorLabel"), tc("draftNoLongerExists"))
          router.replace("/(app)")
          return
        }
        notify(tc("errorLabel"), tc("caseLoadFailed"))
      })

  }, [blockedMessage, clearLocalDraft, continueId, reset, router, tc])

  // Restore local draft silently when opened from the dashboard via ?localId=
  useEffect(() => {
    if (continueId || !localIdParam) return
    loadLocalCaseDraft(localIdParam).then(draft => {
      if (!draft) return
      reset(draft.formValues as FormInput)
      setDraftState("queued")
    })

  }, [continueId, localIdParam, reset])

  // useWatch triggers a React re-render on every field change — works on both native and web.
  // (watch(callback) subscription doesn't fire reliably on Expo web builds.)
  const _allFormValues = useWatch({ control })
  // Previous snapshot so the effect can tell WHAT changed: a tap on a toggle/
  // pill (boolean value) saves near-instantly; typing keeps the long pause.
  const prevFormValuesRef = useRef<Record<string, unknown> | null>(null)

  // Autosave on every form change (2s debounce; 300ms for discrete taps):
  // server-first, local fallback
  useEffect(() => {
    if (submittingRef.current) return
    // Marking "saving" here fired a second render on every keystroke, for a
    // save that had not started and would not start for another 2 seconds. The
    // state is set inside `runAutosave`, when a save actually begins.
    if (autosaveDraftRef.current) clearTimeout(autosaveDraftRef.current)

    // Classify this change: a toggle/pill tap saves quickly, typing waits.
    //
    // This used to `JSON.stringify` both sides of all 106 fields on every
    // keystroke — over 200 serialisations per character, across an object graph
    // that grows as diagnoses, procedures, medications and labs are added. The
    // form therefore got measurably slower the more of it you filled in, which
    // is the opposite of what a form should do.
    //
    // Only booleans can make a change "discrete", so only booleans need
    // comparing, and they compare with `!==`. Everything else is irrelevant to
    // the question being asked.
    const current = (_allFormValues ?? {}) as Record<string, unknown>
    const prev = prevFormValuesRef.current
    prevFormValuesRef.current = current
    let discreteTap = false
    if (prev) {
      let changed = 0
      let allBoolean = true
      for (const key of Object.keys(current)) {
        const now = current[key]
        const before = prev[key]
        const isBoolean = typeof now === "boolean" || typeof before === "boolean"
        if (isBoolean) {
          if (now !== before) changed += 1
          continue
        }
        // Non-boolean fields: a reference change is enough to count as changed.
        // react-hook-form hands back new references for edited values, and a
        // false negative here only costs the slower debounce.
        if (now !== before) {
          changed += 1
          allBoolean = false
        }
      }
      discreteTap = changed > 0 && allBoolean
    }

    function runAutosave() {
      setDraftState("saving")
      const previousAutosave = autosaveInFlightRef.current
      const task = (async () => {
        let values = getValues()
        try {
          await previousAutosave?.catch(() => {})
          values = getValues()
          if (!caseIdRef.current) {
            // First save: try to create the case on the server
            const id = await tryCreateServerCase(values)
            if (id) {
              await clearLocalDraft()
              setDraftState(autosaveManager.getState(id).status === "blocked" ? "blocked" : "saved")
              return
            }
            // Offline or error: save locally so the case appears on the dashboard
            await persistLocalDraft(values)
            setDraftState("queued")
            return
          }
          const preopPayload = buildPreopPayload(values)
          const result = await autosaveManager.saveSection(caseIdRef.current, "preop", preopPayload, {
            fullPayload: preopPayload,
          })
          if (result.result === "saved") {
            await clearLocalDraft()
            setDraftState("saved")
            setBlockedIssue(null)
            setPersistedPediatricRecord(values.clinicalMode === "PEDIATRIC")
            // The section saved, but the server refused individual values (out of
            // range). Name them: they are still visible on screen, so silence
            // would imply they were stored. Retrying is pointless until the
            // clinician changes the value, so we don't re-queue.
            const rejected = result.response?.rejectedFields ?? []
            setSaveError(rejected.length ? rejectedFieldsMessage(rejected) : null)
          } else if (result.result === "blocked" && result.blocked) {
            setBlockedIssue(result.blocked)
            setSaveError(blockedMessage(result.blocked))
            setDraftState("blocked")
          } else if (result.result === "queued" || result.result === "failed") {
            const failure = result.failure
            setSaveError(
              failure?.kind === "http"
                ? tc("caseSaveQueued")
                : tc("caseSaveQueued"),
            )
            await persistLocalDraft(values)
            setDraftState("queued")
          } else {
            setDraftState("idle")
          }
        } catch (error) {
          if (error instanceof ApiError && error.status === 404 && caseIdRef.current) {
            caseIdRef.current = null
            setCaseId(null)
            setPersistedPediatricRecord(false)
            const replacementId = await tryCreateServerCase(values)
            if (replacementId) {
              await clearLocalDraft()
              setDraftState(autosaveManager.getState(replacementId).status === "blocked" ? "blocked" : "saved")
              return
            }
          }
          // Surface 4xx server rejections (e.g. PII violation) instead of silently showing "saved locally"
          if (error instanceof ApiError && error.status >= 400 && error.status < 500 && error.status !== 404 && error.status !== 409) {
            setSaveError(tc("caseSaveFailed"))
          }
          await persistLocalDraft(values).catch(() => {})
          setDraftState("queued")
        }
      })()
      autosaveInFlightRef.current = task
      void task.finally(() => {
        if (autosaveInFlightRef.current === task) autosaveInFlightRef.current = null
      })
    }

    flushAutosaveRef.current = runAutosave
    autosaveDraftRef.current = setTimeout(runAutosave, discreteTap ? 300 : 2000)

  }, [_allFormValues, blockedMessage, clearLocalDraft, getValues, persistLocalDraft, rejectedFieldsMessage, tc, tryCreateServerCase])

  useEffect(() => {
    activeSectionRef.current = activeSection
    const layout = pillLayouts.current[activeSection]
    if (layout) {
      const scrollX = Math.max(0, layout.x + layout.width / 2 - screenWidth / 2)
      sectionRailRef.current?.scrollTo({ x: scrollX, animated: !isScrollingRef.current })
    } else {
      const index = SECTION_LABELS.findIndex((s) => s.key === activeSection)
      if (index >= 0) {
        sectionRailRef.current?.scrollTo({ x: Math.max(0, index * 118 - screenWidth / 2 + 59), animated: !isScrollingRef.current })
      }
    }
  }, [SECTION_LABELS, activeSection, screenWidth])

  const runSectionEnterAnim = useCallback((fromDir: 1 | -1) => {
    slideAnim.setValue(fromDir * screenWidth * 0.35)
    gestureScale.setValue(0.93)
    Animated.parallel([
      Animated.timing(slideAnim, { toValue: 0, duration: 280, useNativeDriver: true, easing: Easing.out(Easing.cubic) }),
      Animated.timing(gestureScale, { toValue: 1, duration: 280, useNativeDriver: true, easing: Easing.out(Easing.cubic) }),
    ]).start()
  }, [gestureScale, screenWidth, slideAnim])

  useEffect(() => {
    if (preopLayout !== "sections") return
    runSectionEnterAnim(slideDir.current)

  }, [activeSection, preopLayout, runSectionEnterAnim])

  const sectionPan = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_, gs) =>
      Math.abs(gs.dx) > 10 && Math.abs(gs.dx) > Math.abs(gs.dy) * 1.4,
    onPanResponderGrant: () => {
      slideAnim.stopAnimation()
      gestureScale.stopAnimation()
    },
    onPanResponderMove: (_, gs) => {
      const curIdx = SECTION_KEYS.indexOf(activeSectionRef.current)
      const canLeft  = curIdx < SECTION_KEYS.length - 1
      const canRight = curIdx > 0
      if ((gs.dx < 0 && canLeft) || (gs.dx > 0 && canRight)) {
        slideAnim.setValue(gs.dx)
        gestureScale.setValue(1 - 0.07 * Math.min(1, Math.abs(gs.dx) / screenWidth))
      }
    },
    onPanResponderRelease: (_, gs) => {
      const threshold = screenWidth * 0.26
      const curIdx  = SECTION_KEYS.indexOf(activeSectionRef.current)
      const canLeft  = curIdx < SECTION_KEYS.length - 1
      const canRight = curIdx > 0
      const goLeft  = gs.dx < 0 && (Math.abs(gs.dx) > threshold || gs.vx < -0.5) && canLeft
      const goRight = gs.dx > 0 && (Math.abs(gs.dx) > threshold || gs.vx >  0.5) && canRight
      if (goLeft || goRight) {
        const dir = goLeft ? -1 : 1
        const target = SECTION_KEYS[curIdx - dir] as PreopSection
        Animated.parallel([
          Animated.timing(slideAnim,    { toValue: dir * screenWidth * 0.6, duration: 150, useNativeDriver: true, easing: Easing.in(Easing.cubic) }),
          Animated.timing(gestureScale, { toValue: 0.93, duration: 150, useNativeDriver: true }),
        ]).start(() => {
          slideDir.current = -dir as 1 | -1
          setActiveSection(target)
          preopModeRef.current = "editing"
          setPreopMode("editing")
        })
      } else {
        Animated.parallel([
          Animated.spring(slideAnim,    { toValue: 0, useNativeDriver: true, tension: 200, friction: 26 }),
          Animated.spring(gestureScale, { toValue: 1, useNativeDriver: true, tension: 200, friction: 26 }),
        ]).start()
      }
    },
    onPanResponderTerminate: () => {
      Animated.parallel([
        Animated.spring(slideAnim,    { toValue: 0, useNativeDriver: true, tension: 200, friction: 26 }),
        Animated.spring(gestureScale, { toValue: 1, useNativeDriver: true, tension: 200, friction: 26 }),
      ]).start()
    },
  })).current

  function jumpTo(section: PreopSection) {
    impact()
    const currentIndex = SECTION_KEYS.indexOf(activeSectionRef.current)
    const targetIndex = SECTION_KEYS.indexOf(section)
    const dir = targetIndex > currentIndex ? -1 : 1
    if (preopLayout === "sections") {
      if (preopModeRef.current !== "editing") {
        // Entering editing from overview — skip exit animation, slide in cleanly from right
        slideDir.current = 1
        activeSectionRef.current = section
        setActiveSection(section)
        preopModeRef.current = "editing"
        slideAnim.setValue(screenWidth * 0.35)
        gestureScale.setValue(0.93)
        setPreopMode("editing")
        Animated.parallel([
          Animated.timing(slideAnim,    { toValue: 0, duration: 280, useNativeDriver: true, easing: Easing.out(Easing.cubic) }),
          Animated.timing(gestureScale, { toValue: 1, duration: 280, useNativeDriver: true, easing: Easing.out(Easing.cubic) }),
        ]).start()
        return
      }
      Animated.parallel([
        Animated.timing(slideAnim,    { toValue: -dir * screenWidth * 0.4, duration: 140, useNativeDriver: true, easing: Easing.in(Easing.quad) }),
        Animated.timing(gestureScale, { toValue: 0.93, duration: 140, useNativeDriver: true }),
      ]).start(() => {
        slideDir.current = dir as 1 | -1
        setActiveSection(section)
        preopModeRef.current = "editing"
        setPreopMode("editing")
      })
    } else {
      setActiveSection(section)
      preopModeRef.current = "editing"
      setPreopMode("editing")
      setTimeout(() => scrollRef.current?.scrollTo({ y: Math.max(0, (sectionY.current[section] ?? 0) - 8), animated: true }), 50)
    }
  }

  function handleScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
    isScrollingRef.current = true
    if (scrollEndTimerRef.current) clearTimeout(scrollEndTimerRef.current)
    scrollEndTimerRef.current = setTimeout(() => { isScrollingRef.current = false }, 350)

    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent
    const y = contentOffset.y
    const maxY = Math.max(1, contentSize.height - layoutMeasurement.height)
    if (Math.abs(maxY - maxScrollYRef.current) > 32) {
      maxScrollYRef.current = maxY
      setMaxScrollY(maxY)
    }
    const delta = y - lastScrollY.current
    lastScrollY.current = y

    const collapseDeadZone = 58
    const collapseDistance = 172
    if (y <= 4) {
      headerCollapseRef.current = 0
    } else if (y > collapseDeadZone) {
      const smoothDelta = Math.max(-48, Math.min(48, delta))
      headerCollapseRef.current = Math.min(1, Math.max(0, headerCollapseRef.current + smoothDelta / collapseDistance))
    }
    headerAnim.setValue(headerCollapseRef.current)
    const hidden = headerCollapseRef.current > 0.92
    if (hidden !== appHeaderHidden) setAppHeaderHidden(hidden)

    if (!scrollRailVisibleRef.current) {
      scrollRailVisibleRef.current = true
      setScrollRailVisible(true)
    }
    if (scrollRailTimer.current) clearTimeout(scrollRailTimer.current)
    scrollRailTimer.current = setTimeout(() => {
      scrollRailVisibleRef.current = false
      setScrollRailVisible(false)
    }, 650)

    if (preopLayout !== "sections") {
      const probeY = y + 40
      let current = SECTION_LABELS[0].key
      for (const section of SECTION_LABELS) {
        const sectionTop = sectionY.current[section.key]
        if (sectionTop != null && sectionTop <= probeY) current = section.key
      }
      if (current !== activeSectionRef.current) {
        activeSectionRef.current = current
        setActiveSection(current)
      }
    }
  }

  async function runAdvisor() {
    if (getValues("clinicalMode") === "PEDIATRIC") {
      setAiError(tc("aiPediatricUnavailable"))
      return
    }

    setAiLoading(true)
    setAiText("")
    setAiError("")
    try {
      if (!caseIdRef.current) {
        // tryCreateServerCase sends current values including aiOptIn — no race here
        const created = await tryCreateServerCase(getValues())
        if (!created) {
          setAiError(tc("caseSaveFailed"))
          setAiLoading(false)
          return
        }
      } else {
        // Flush any in-flight autosave so aiOptIn is persisted before the consent check
        if (autosaveInFlightRef.current) await autosaveInFlightRef.current
      }

      // Retry once if the debounce hadn't fired yet and DB still has aiOptIn=false
      for (let attempt = 0; attempt <= 1; attempt++) {
        const res = await apiFetch(`/api/cases/${caseIdRef.current}/ai/advise`, { method: "POST" })
        if (!res.ok) {
          if (res.status === 403 && attempt === 0) {
            const body = await res.json().catch(() => ({}))
            if (body.error?.includes("not enabled") && getValues().aiOptIn) {
              // Race: debounce hasn't fired yet — wait for it then retry
              await new Promise(r => setTimeout(r, 2500))
              continue
            }
            throw new Error(body.error ?? tc("aiRequestFailed"))
          }
          if (res.status === 429) throw new Error(tc("aiRateLimit"))
          const body = await res.json().catch(() => ({}))
          throw new Error(body.error ?? tc("aiRequestFailed"))
        }

        const reader = res.body?.getReader()
        if (!reader) throw new Error(tc("aiNoResponseStream"))

        const decoder = new TextDecoder()
        let text = ""
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          text += decoder.decode(value, { stream: true })
          setAiText(text)
        }
        break
      }
    } catch (error) {
      const known = new Set([tc("aiRateLimit"), tc("aiRequestFailed"), tc("aiNoResponseStream")])
      setAiError(error instanceof Error && known.has(error.message) ? error.message : tc("aiRequestFailed"))
    } finally {
      setAiLoading(false)
    }
  }

  const requiredFieldLabels = {
    ageYears: tc("ageYears"),
    ageValue: tc("preciseAge"),
    sex: tc("sexLabel"),
    heightCm: tc("heightCm"),
    weightKg: tc("weightKg"),
    diagnoses: tc("diagnosisLabel"),
    procedures: tc("procedureLabel"),
    bpSystolic: tc("sbpLabel"),
    bpDiastolic: tc("dbpLabel"),
    heartRate: tc("heartRateLabel"),
    respiratoryRate: tc("respiratoryRateLabel"),
    mallampati: tc("mallampatiLabel"),
    asaScore: tc("asaPhysicalStatus"),
  }

  function onInvalid(invalid: Record<string, unknown>) {
    const keys = Object.keys(invalid)
    const first = keys[0]
    const target = first ? PREOP_REQUIRED_FIELD_SECTION[first] : undefined
    if (target) jumpTo(target)
    notify(
      tc("requiredFieldsMissing"),
      preopInvalidSubmitMessage(keys, requiredFieldLabels, tc("completeBeforeProceeding")),
    )
  }

  async function onSubmit(data: FormData) {
    submittingRef.current = true
    if (autosaveDraftRef.current) {
      clearTimeout(autosaveDraftRef.current)
      autosaveDraftRef.current = null
    }
    setSaving(true)
    try {
      await autosaveInFlightRef.current
      const preopPayload = buildPreopPayload(data)
      let id: string
      if (caseIdRef.current) {
        const patchResult = await autosaveManager.saveSection(caseIdRef.current, "preop", preopPayload, {
          fullPayload: preopPayload,
        })
        if (patchResult.result === "saved") {
          id = caseIdRef.current
        } else if (patchResult.result === "blocked" && patchResult.blocked) {
          const message = blockedMessage(patchResult.blocked)
          setBlockedIssue(patchResult.blocked)
          setSaveError(message)
          setDraftState("blocked")
          notify(tc("errorLabel"), message)
          return
        } else {
          await persistLocalDraft(getValues())
          notify(
            tc("savePendingTitle"),
            tc("savePendingBody"),
          )
          return
        }
      } else {
        // No server case yet (offline during autosave); create it now
        const createResult = await postPreopServerCase(data, draftIdRef.current, apiFetch)
        if (!createResult) throw new Error("Save failed")
        if (!createResult.ok) throw new Error(createResult.message)
        id = createResult.id
        caseIdRef.current = createResult.id
        setCaseId(createResult.id)
        autosaveManager.hydrateSection(
          createResult.id,
          "preop",
          createResult.acceptedPayload,
          createResult.revision ?? createResult.updatedAt,
        )
        if (createResult.blocked) {
          const patchResult = await autosaveManager.saveSection(
            createResult.id,
            "preop",
            preopPayload,
            { fullPayload: preopPayload },
          )
          const issue = patchResult.blocked ?? createResult.blocked
          const message = blockedMessage(issue)
          setBlockedIssue(issue)
          setSaveError(message)
          setDraftState("blocked")
          notify(tc("errorLabel"), message)
          return
        }
      }
      const transition = await autosaveManager.saveSection(
        id,
        "intraop",
        { monthYear: monthYearForDate(new Date()) },
        { partial: true },
      )
      if (transition.result !== "saved" && transition.result !== "queued") {
        await persistLocalDraft(getValues())
        notify(
          tc("savePendingTitle"),
          tc("savePendingBody"),
        )
        return
      }
      await clearLocalDraft()
      router.replace(`/(app)/cases/intraop/${id}`)
    } catch {
      notify(tc("errorLabel"), tc("couldCreateCase"))
    } finally {
      submittingRef.current = false
      setSaving(false)
    }
  }

  function computeSectionItems() {
    return buildPreopSectionItems(getValues(), SECTION_LABELS, {
      patientHint: tc("overviewPatientHint"),
      diagnosisAndProcedure: tc("diagnosisAndProcedure"),
      comorbidities: tc("overviewComorbidities"),
      meds: tc("overviewMeds"),
      flags: tc("overviewFlags"),
      vitalsRequired: tc("overviewVitalsReq"),
      mallampatiRequired: tc("overviewMallampatiReq"),
      labsHint: tc("overviewLabsHint"),
      asaRequired: tc("overviewASAReq"),
    })
  }

  const blockedField =
    blockedIssue?.field === "diagnosis" ? "diagnoses"
    : blockedIssue?.field === "plannedProcedure" ? "procedures"
    : blockedIssue?.field
  const blockedFieldMessage = blockedIssue ? blockedMessage(blockedIssue) : undefined
  const blockedErrorFor = (field: string) => blockedField === field ? blockedFieldMessage : undefined

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        {preopMode === "overview" ? (
          <View style={{ flex: 1, backgroundColor: colors.background }}>
            <AppHeader title={tc("preopTitle")} showNewCase={false} />
            {preopCaseStatus === "COMPLETE" && preopFinalizedAt && (
              <EditWindowBanner finalizedAt={preopFinalizedAt} caseId={continueId ?? undefined} showBackButton />
            )}
            <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 60 }}>
              <Text style={{ color: colors.textPrimary, fontSize: 22, fontWeight: "900", marginBottom: 4 }}>{tc("preopTitle")}</Text>
              <Text style={{ color: colors.textMuted, fontSize: 13, marginBottom: 20 }}>{tc("tapSectionHint")}</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 24 }}>
                {computeSectionItems().map(({ key, label, done, required, summary }) => (
                  <TouchableOpacity
                    key={key}
                    onPress={() => jumpTo(key)}
                    style={{
                      width: "47%", minHeight: 80, justifyContent: "center", gap: 4,
                      borderRadius: 16, borderCurve: "continuous", paddingHorizontal: 14, paddingVertical: 12,
                      backgroundColor: done ? withAlpha(colors.success, "12") : required ? withAlpha(colors.warning, "10") : colors.surfaceRaised,
                      borderWidth: 1.5,
                      borderColor: done ? withAlpha(colors.success, "77") : required ? withAlpha(colors.warning, "66") : colors.border,
                    }}
                  >
                    <Text style={{ color: done ? colors.success : required ? colors.warning : colors.textMuted, fontSize: 10, fontWeight: "900", textTransform: "uppercase", letterSpacing: 0.8 }}>
                      {done ? tc("overviewReady") : required ? tc("overviewRequired") : tc("overviewOptional")}
                    </Text>
                    <Text style={{ color: colors.textPrimary, fontSize: 14, fontWeight: "900" }}>{label}</Text>
                    <Text style={{ color: colors.textMuted, fontSize: 11 }} numberOfLines={1}>{summary}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TouchableOpacity
                onPress={handleSubmit(onSubmit, onInvalid)}
                disabled={saving}
                style={{
                  backgroundColor: colors.primary, borderRadius: 16, borderCurve: "continuous",
                  paddingVertical: 15, alignItems: "center", borderWidth: 1,
                  borderColor: withAlpha(colors.primary, "99"),
                  opacity: saving ? 0.6 : 1,
                }}
              >
                {saving ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff", fontWeight: "900", fontSize: 16 }}>{tc("continueIntraop")}</Text>}
              </TouchableOpacity>
            </ScrollView>
          </View>
        ) : <View style={{ flex: 1 }} {...(preopLayout === "sections" ? sectionSwipeResponder.panHandlers : {})}>
        <Animated.View
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            zIndex: 30,
            height: primaryHeaderHeight,
            overflow: "hidden",
            backgroundColor: colors.background,
            opacity: headerAnim.interpolate({ inputRange: [0, 0.75, 1], outputRange: [1, 0.2, 0] }),
            transform: [{ translateY: headerAnim.interpolate({ inputRange: [0, 1], outputRange: [0, -primaryHeaderHeight] }) }],
          }}
        >
          <AppHeader title={tc("preopTitle")} showNewCase={false} />
        </Animated.View>

        <Animated.View
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            zIndex: 29,
            backgroundColor: colors.background,
            paddingTop: headerAnim.interpolate({ inputRange: [0, 1], outputRange: [12, insets.top + 10] }),
            paddingBottom: 12,
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
            transform: [{ translateY: headerAnim.interpolate({ inputRange: [0, 1], outputRange: [primaryHeaderHeight, 0] }) }],
          }}
        >
          <ScrollView ref={sectionRailRef} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, gap: 10 }}>
            {SECTION_LABELS.map((section) => {
              const isActive = activeSection === section.key
              return (
                <View
                  key={section.key}
                  style={{ alignItems: "center" }}
                  onLayout={(e) => {
                    pillLayouts.current[section.key] = { x: e.nativeEvent.layout.x, width: e.nativeEvent.layout.width }
                  }}
                >
                  <Pressable
                    onPress={() => jumpTo(section.key)}
                    style={{
                      minHeight: 44,
                      borderRadius: 999,
                      borderWidth: 1,
                      borderColor: isActive ? withAlpha(colors.primary, "AA") : colors.border,
                      backgroundColor: isActive ? colors.primarySoft : colors.surfaceRaised,
                      paddingHorizontal: 17,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Text style={{ color: isActive ? colors.primary : colors.textSecondary, fontSize: 13, fontWeight: "900" }}>{section.label}</Text>
                  </Pressable>
                  {isActive && (
                    <View style={{ height: 2, borderRadius: 1, backgroundColor: colors.primary, width: "80%", marginTop: 3 }} />
                  )}
                </View>
              )
            })}
          </ScrollView>
        </Animated.View>

        <Animated.ScrollView
          ref={scrollRef}
          contentContainerStyle={{ paddingTop: primaryHeaderHeight + SECTION_RAIL_EXPANDED_HEIGHT, paddingBottom: 90 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          onScroll={Animated.event(
            [{ nativeEvent: { contentOffset: { y: scrollYAnim } } }],
            { useNativeDriver: false, listener: handleScroll }
          )}
          scrollEventThrottle={16}
          {...(preopLayout === "sections" ? sectionPan.panHandlers : {})}
        >
          <Animated.View style={preopLayout === "sections" ? { transform: [{ translateX: slideAnim }, { scale: gestureScale }] } : undefined}>
          <View style={{ paddingHorizontal: 20, paddingTop: 16 }}>
            {draftState !== "idle" && (
              <Text style={{ color: draftState === "blocked" ? colors.danger : draftState === "queued" ? colors.warning : colors.textMuted, fontSize: 11, fontWeight: "700", textAlign: "right", marginBottom: saveError ? 2 : 4 }}>
                {draftState === "saving" ? tc("draftSaving") : draftState === "saved" ? tc("draftSaved") : draftState === "blocked" ? tc("draftBlocked") : tc("draftLocal")}
              </Text>
            )}
            {saveError && (draftState === "queued" || draftState === "blocked") && (
              <Text style={{ color: colors.danger, fontSize: 10, textAlign: "right", marginBottom: 4 }} selectable>
                {saveError}
              </Text>
            )}
            <SectionCard title={tc("sectionPatient")} onLayout={(y) => { sectionY.current.patient = y }} visible={showSection("patient")}>
              <PediatricModeAgeFields
                control={control}
                setValue={setValue}
                tc={tc}
                language={language}
                pediatricModeCapability={pediatricModeCapability}
                existingPediatricRecord={persistedPediatricRecord && pediatricMode}
              />
              {!pediatricMode ? (
                <Field label={tc("ageYears")} required error={localizedPreopValidationMessage(errors.ageYears?.message, tc)}>
                  <Controller control={control} name="ageYears" render={({ field }) => <ClinicalNumberInput value={field.value} onChange={field.onChange} min={ageRange?.min ?? 0} max={ageRange?.max ?? 149} step={ageRange?.step ?? 1} placeholder={tc("agePlaceholder")} showSteppers={false} />} />
                </Field>
              ) : null}
              <Field label={tc("heightCm")} required error={localizedPreopValidationMessage(errors.heightCm?.message, tc)}>
                <Controller control={control} name="heightCm" render={({ field }) => {
                  const cv = convertedMeasurement("height", unitPrefs, field.value, field.onChange, pediatricMode ? 20 : heightRange?.min ?? 30, pediatricMode ? 280 : heightRange?.max ?? 250, heightRange?.step ?? 1)
                  return <ClinicalNumberInput value={cv.value} onChange={cv.onChange} min={cv.min} max={cv.max} step={cv.step} precision={cv.precision} unit={cv.unit} placeholder={tc("heightPlaceholder")} showSteppers={false} />
                }} />
              </Field>
              <Field label={tc("weightKg")} required error={localizedPreopValidationMessage(errors.weightKg?.message, tc)}>
                <Controller control={control} name="weightKg" render={({ field }) => {
                  // Paediatric weight starts at 0.1 kg and moves in tenths; the
                  // ceiling stays the API's, as the web form does. It was 700 kg
                  // here, which no child approaches and which made the wheel
                  // seven times longer than it needed to be.
                  const cv = convertedMeasurement("weight", unitPrefs, field.value, field.onChange, pediatricMode ? 0.1 : weightRange?.min ?? 0.5, weightRange?.max ?? 250, pediatricMode ? 0.1 : weightRange?.step ?? 1)
                  return <ClinicalNumberInput value={cv.value} onChange={cv.onChange} min={cv.min} max={cv.max} step={cv.step} precision={cv.precision} unit={cv.unit} placeholder={tc("weightPlaceholder")} showSteppers={false} />
                }} />
              </Field>
              {(bmi || ibw != null || abw) ? (
                <View style={{ flexDirection: "row", gap: 8, marginBottom: 14 }}>
                  {bmi ? <MetricBadge label="BMI" value={bmi.toFixed(1)} unit="kg/m2" tone={bmi >= 35 ? colors.warning : colors.primary} /> : null}
                  {ibw != null ? <MetricBadge label={pediatricMode ? "IBW · McLaren" : "IBW"} value={ibw.toFixed(1)} unit="kg" tone={colors.agent} /> : null}
                  {abw ? <MetricBadge label="ABW" value={String(Math.round(abw))} unit="kg" tone={colors.fluid} /> : null}
                </View>
              ) : null}
              <Field label={tc("sexLabel")} required error={localizedPreopValidationMessage(errors.sex?.message, tc)}>
                <Controller control={control} name="sex" render={({ field }) => (
                  <SegmentedSelect value={field.value} onChange={field.onChange} options={[{ value: "MALE", label: tc("male") }, { value: "FEMALE", label: tc("female") }, { value: "OTHER", label: tc("other") }]} />
                )} />
              </Field>
              <Field label={tc("bloodGroup")}>
                <BloodGrid bloodType={bloodType} rhFactor={rhFactor} onChange={(bt, rh) => { setValue("bloodType", bt); setValue("rhFactor", rh) }} />
              </Field>
            </SectionCard>

            <SectionCard title={tc("sectionCaseDetails")} onLayout={(y) => { sectionY.current.case = y }} visible={showSection("case")}>
              <Controller control={control} name="diagnoses" render={({ field }) => (
                <SearchTagInput kind="icd10" label={tc("diagnosisLabel")} value={(field.value ?? []).map((item) => ({ code: item.code ?? item.label, label: item.label, system: item.system, labelEn: item.labelEn, labelBg: item.labelBg }))} onChange={(items) => field.onChange(items.map((item) => ({ ...(item.vocabularyVersion ? { vocabularyVersion: item.vocabularyVersion } : {}), code: item.code, sub: item.code, label: item.label, system: item.system ?? "ICD-10", labelEn: item.labelEn, labelBg: item.labelBg })))} endpoint="/api/search/icd10" placeholder={tc("diagnosisPlaceholder")} onFocus={() => scrollToSection("case", 60)} required error={localizedPreopValidationMessage(errors.diagnoses?.message, tc) ?? blockedErrorFor("diagnoses")} />
              )} />
              <Controller control={control} name="procedures" render={({ field }) => (
                <SearchTagInput kind="procedure" label={tc("procedureLabel")} value={(field.value ?? []).map((item) => ({ code: item.code ?? item.label, label: item.label }))} onChange={(items) => field.onChange(items.map((item) => ({ ...(item.vocabularyVersion ? { vocabularyVersion: item.vocabularyVersion } : {}), code: item.code, label: item.label })))} endpoint="/api/search/procedures" placeholder={tc("procedureSearchPlaceholder")} onFocus={() => scrollToSection("case", 160)} required error={localizedPreopValidationMessage(errors.procedures?.message, tc) ?? blockedErrorFor("procedures")} />
              )} />
              <Controller control={control} name="highRiskSurgery" render={({ field }) => <ClinicalSwitchRow label={tc("highRiskSurgery")} value={!!field.value} onValueChange={field.onChange} activeColor={colors.warning} />} />
              <Controller control={control} name="emergencySurgery" render={({ field }) => (
                <ClinicalSwitchRow label={field.value ? tc("emergencySurgery") : tc("electiveSurgery")} value={!!field.value}
                  onValueChange={(v) => { field.onChange(v); setValue("elective", !v) }} activeColor={colors.danger} />
              )} />
              <Field label={tc("teamNotesLabel")} error={blockedErrorFor("teamNotes")}>
                <Controller control={control} name="teamNotes" render={({ field }) => (
                  <StyledInput value={field.value ?? ""} onChangeText={field.onChange} maxLength={500} multiline placeholder={tc("teamNotesPlaceholder")} />
                )} />
              </Field>
            </SectionCard>

            <SectionCard title={tc("sectionHistory")} subtitle={tc("historySubtitle")} onLayout={(y) => { sectionY.current.history = y }} visible={showSection("history")}>
              <Controller control={control} name="comorbidities" render={({ field }) => (
                <>
                  <SearchTagInput kind="icd10" label={tc("activeComorbidities")} value={(field.value ?? []).map((item) => ({ code: item.code ?? item.label, label: item.label, system: item.system, labelEn: item.labelEn, labelBg: item.labelBg }))} onChange={(items) => field.onChange(items.map((item) => ({ ...(item.vocabularyVersion ? { vocabularyVersion: item.vocabularyVersion } : {}), code: item.code, sub: item.code, label: item.label, system: item.system ?? "ICD-10", labelEn: item.labelEn, labelBg: item.labelBg })))} endpoint="/api/search/icd10" placeholder={tc("searchComorbidities")} onFocus={() => scrollToSection("history", 80)} error={blockedErrorFor("comorbidities")} />
                  <ComorbiditiesBySystem
                    items={field.value ?? []}
                    onRemove={(label) => field.onChange((field.value ?? []).filter((c: { label: string }) => c.label !== label))}
                  />
                </>
              )} />
            </SectionCard>

            <SectionCard title={tc("sectionMeds")} onLayout={(y) => { sectionY.current.meds = y }} visible={showSection("meds")}>
              <Controller control={control} name="currentMedications" render={({ field }) => (
                <SearchTagInput kind="medication" label={tc("medicationSearch")} value={(field.value ?? []).map((item) => ({ code: item.atcCode ?? item.inn ?? item.label, label: item.label, inn: item.inn, atcCode: item.atcCode }))} onChange={(items) => field.onChange(items.map((item) => ({ label: item.label, inn: item.inn, atcCode: item.atcCode })))} endpoint="/api/search/drugs" placeholder={tc("searchMedications")} onFocus={() => scrollToSection("meds", 60)} error={blockedErrorFor("currentMedications")} />
              )} />
            </SectionCard>

            <SectionCard title={tc("sectionAnamnesis")} onLayout={(y) => { sectionY.current.anamnesis = y }} visible={showSection("anamnesis")}>
              <Controller control={control} name="allergies" render={({ field }) => <ClinicalYesNoRow label={tc("drugAllergy")} value={field.value ?? null} onValueChange={(value) => {
                field.onChange(value)
                if (!value) setValue("allergyDetails", [], { shouldDirty: true })
              }} activeColor={colors.danger} />} />
              {allergies ? (
                <Controller control={control} name="allergyDetails" render={({ field }) => (
                  <SearchTagInput kind="medication" label={tc("allergenSearch")} value={(field.value ?? []).map((item) => ({ code: item.atcCode ?? item.inn ?? item.label, label: item.label, inn: item.inn, atcCode: item.atcCode }))} onChange={(items) => field.onChange(items.map((item) => ({ label: item.label, inn: item.inn, atcCode: item.atcCode })))} endpoint="/api/search/drugs" placeholder={tc("allergenSearchPlaceholder")} onFocus={() => scrollToSection("history", 200)} error={blockedErrorFor("allergyDetails")} />
                )} />
              ) : null}
              <Controller control={control} name="latexAllergy" render={({ field }) => <ClinicalYesNoRow label={tc("latexAllergy")} value={field.value ?? null} onValueChange={field.onChange} activeColor={colors.danger} />} />
              <Controller control={control} name="familyAnesthesiaProblems" render={({ field }) => <ClinicalYesNoRow label={tc("familyAnesthesia")} value={field.value ?? null} onValueChange={(value) => {
                field.onChange(value)
                if (!value) setValue("familyAnesthesiaDetails", "", { shouldDirty: true })
              }} activeColor={colors.warning} />} />
              {familyAnesthesiaProblems ? <Field label={tc("familyAnesthesiaDetails")} error={blockedErrorFor("familyAnesthesiaDetails")}><Controller control={control} name="familyAnesthesiaDetails" render={({ field }) => <StyledInput value={field.value ?? ""} onChangeText={field.onChange} maxLength={500} multiline placeholder={tc("familyAnesthesiaHint")} />} /></Field> : null}
              <Controller control={control} name="dentalProsthetics" render={({ field }) => <ClinicalYesNoRow label={tc("dentalProsthetics")} value={field.value ?? null} onValueChange={field.onChange} />} />
              <Controller control={control} name="looseTeeth" render={({ field }) => <ClinicalYesNoRow label={tc("looseTeeth")} value={field.value ?? null} onValueChange={field.onChange} activeColor={colors.warning} />} />
              <Controller control={control} name="smoking" render={({ field }) => <ClinicalYesNoRow label={tc("smoking")} value={field.value ?? null} onValueChange={field.onChange} />} />
              <Controller control={control} name="substanceAbuse" render={({ field }) => <ClinicalYesNoRow label={tc("substanceAbuse")} value={field.value ?? null} onValueChange={field.onChange} activeColor={colors.warning} />} />

              {!pediatricMode ? <>
              <SectionHeader title={tc("rcriSection")} />
              <ChecklistGroup>
                <Controller control={control} name="rcriIschemicHeart" render={({ field }) => <ChecklistRow label={tc("rcriIschemicHeart")} checked={!!field.value} onPress={() => field.onChange(!field.value)} hint={rcriSuggested.rcriIschemicHeart ? RCRI_HINT : undefined} />} />
                <Controller control={control} name="rcriCHF" render={({ field }) => <ChecklistRow label={tc("rcriCHF")} checked={!!field.value} onPress={() => field.onChange(!field.value)} hint={rcriSuggested.rcriCHF ? RCRI_HINT : undefined} />} />
                <Controller control={control} name="rcriCVD" render={({ field }) => <ChecklistRow label={tc("rcriCVD")} checked={!!field.value} onPress={() => field.onChange(!field.value)} hint={rcriSuggested.rcriCVD ? RCRI_HINT : undefined} />} />
                <Controller control={control} name="rcriInsulinDM" render={({ field }) => <ChecklistRow label={tc("rcriInsulinDM")} checked={!!field.value} onPress={() => field.onChange(!field.value)} hint={rcriSuggested.rcriInsulinDM ? RCRI_HINT : undefined} />} />
                <Controller control={control} name="rcriCreatinine" render={({ field }) => <ChecklistRow label={tc("rcriCreatinine")} checked={!!field.value} onPress={() => field.onChange(!field.value)} hint={rcriSuggested.rcriCreatinine ? RCRI_HINT : undefined} last />} />
              </ChecklistGroup>

              <SectionHeader title={tc("apfelSection")} />
              <ChecklistGroup>
                <ChecklistRow label={tc("apfelFemaleSex")} checked={sex === "FEMALE"} muted />
                <ChecklistRow label={tc("apfelNonSmoker")} checked={!smoking} muted />
                <Controller control={control} name="apfelPONVHistory" render={({ field }) => <ChecklistRow label={tc("apfelPONV")} checked={!!field.value} onPress={() => field.onChange(!field.value)} />} />
                <Controller control={control} name="apfelPostopOpioids" render={({ field }) => <ChecklistRow label={tc("apfelOpioids")} checked={!!field.value} onPress={() => field.onChange(!field.value)} last />} />
              </ChecklistGroup>

              <SectionHeader title={tc("stopbangSection")} />
              <ChecklistGroup>
                <Controller control={control} name="stopbangSnoring" render={({ field }) => <ChecklistRow label={tc("stopbangSnoring")} checked={!!field.value} onPress={() => field.onChange(!field.value)} />} />
                <Controller control={control} name="stopbangTired" render={({ field }) => <ChecklistRow label={tc("stopbangTired")} checked={!!field.value} onPress={() => field.onChange(!field.value)} />} />
                <Controller control={control} name="stopbangObserved" render={({ field }) => <ChecklistRow label={tc("stopbangObserved")} checked={!!field.value} onPress={() => field.onChange(!field.value)} />} />
                <Controller control={control} name="stopbangBP" render={({ field }) => <ChecklistRow label={tc("stopbangBP")} checked={!!field.value} onPress={() => field.onChange(!field.value)} hint={stopBangBPSuggested ? RCRI_HINT : undefined} />} />
                <ChecklistRow label={`${tc("stopbangBMI")}: ${bmi ? bmi.toFixed(1) : "-"}`} checked={bmi != null && bmi > 35} muted />
                <ChecklistRow label={`${tc("stopbangAge")}: ${ageYears ?? "-"}`} checked={ageYears != null && ageYears > 50} muted />
                <Controller control={control} name="stopbangNeck" render={({ field }) => <ChecklistRow label={tc("stopbangNeck")} checked={!!field.value} onPress={() => field.onChange(!field.value)} />} />
                <ChecklistRow label={tc("stopbangMale")} checked={sex === "MALE"} muted last />
              </ChecklistGroup>
              </> : null}
            </SectionCard>

            <SectionCard title={tc("sectionExam")} onLayout={(y) => { sectionY.current.exam = y }} visible={showSection("exam")}>
              <PediatricVitalReferenceNote control={control} language={language} />
              <View style={{ flexDirection: "row", gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Controller control={control} name="bpSystolic" render={({ field }) => (
                    <Controller control={control} name="bpUnobtainable" render={({ field: uto }) => (
                      <VitalNumber label={tc("sbpLabel")} unit="mmHg" value={field.value} onChange={field.onChange} min={pediatricMode ? 10 : bpSystolicRange?.min ?? 1} max={bpSystolicRange?.max ?? 300} step={bpSystolicRange?.step ?? 1} unobtainable={!!uto.value} onToggleUnobtainable={() => { uto.onChange(!uto.value); if (!uto.value) field.onChange(undefined) }} labelUnableToObtain={tc("unableToObtain")} required error={localizedPreopValidationMessage(errors.bpSystolic?.message, tc)} />
                    )} />
                  )} />
                </View>
                <View style={{ flex: 1 }}>
                  <Controller control={control} name="bpDiastolic" render={({ field }) => (
                    <Controller control={control} name="bpUnobtainable" render={({ field: uto }) => (
                      <VitalNumber label={tc("dbpLabel")} unit="mmHg" value={field.value} onChange={field.onChange} min={pediatricMode ? 5 : bpDiastolicRange?.min ?? 1} max={bpDiastolicRange?.max ?? 200} step={bpDiastolicRange?.step ?? 1} unobtainable={!!uto.value} onToggleUnobtainable={() => { uto.onChange(!uto.value); if (!uto.value) field.onChange(undefined) }} labelUnableToObtain={tc("unableToObtain")} required />
                    )} />
                  )} />
                </View>
              </View>
              <Controller control={control} name="heartRate" render={({ field }) => (
                <Controller control={control} name="heartRateUnobtainable" render={({ field: uto }) => (
                  <VitalNumber label={tc("heartRateLabel")} unit="bpm" value={field.value} onChange={field.onChange} min={pediatricMode ? 10 : heartRateRange?.min ?? 1} max={pediatricMode ? 350 : heartRateRange?.max ?? 300} step={heartRateRange?.step ?? 1} unobtainable={!!uto.value} onToggleUnobtainable={() => { uto.onChange(!uto.value); if (!uto.value) field.onChange(undefined) }} labelUnableToObtain={tc("unableToObtain")} required error={localizedPreopValidationMessage(errors.heartRate?.message, tc)} />
                )} />
              )} />
              <Controller control={control} name="heartArrhythmia" render={({ field }) => <ClinicalYesNoRow label={tc("arrhythmiaLabel")} value={field.value ?? null} onValueChange={field.onChange} activeColor={colors.warning} />} />
              <Controller control={control} name="spO2" render={({ field }) => (
                <Controller control={control} name="spO2Unobtainable" render={({ field: uto }) => (
                  <VitalNumber label={tc("spO2Label")} unit="%" value={field.value} onChange={field.onChange} min={spo2Range?.min ?? 0} max={spo2Range?.max ?? 100} step={spo2Range?.step ?? 1} unobtainable={!!uto.value} onToggleUnobtainable={() => { uto.onChange(!uto.value); if (!uto.value) field.onChange(undefined) }} labelUnableToObtain={tc("unableToObtain")} />
                )} />
              )} />
              <Controller control={control} name="temperature" render={({ field }) => (
                <Controller control={control} name="temperatureUnobtainable" render={({ field: uto }) => {
                  const cv = convertedMeasurement("temperature", unitPrefs, field.value, field.onChange, temperatureRange?.min ?? 0, temperatureRange?.max ?? 45, temperatureRange?.step ?? 0.1)
                  return <VitalNumber label={tc("temperatureLabel")} unit={cv.unit} value={cv.value} onChange={cv.onChange} min={cv.min} max={cv.max} step={cv.step} precision={cv.precision || 1} unobtainable={!!uto.value} onToggleUnobtainable={() => { uto.onChange(!uto.value); if (!uto.value) field.onChange(undefined) }} labelUnableToObtain={tc("unableToObtain")} />
                }} />
              )} />
              <Controller control={control} name="respiratoryRate" render={({ field }) => (
                <Controller control={control} name="respiratoryRateUnobtainable" render={({ field: uto }) => (
                  <VitalNumber label={tc("respiratoryRateLabel")} unit="/min" value={field.value} onChange={field.onChange} min={respiratoryRange?.min ?? 0} max={pediatricMode ? 150 : respiratoryRange?.max ?? 50} step={respiratoryRange?.step ?? 1} unobtainable={!!uto.value} onToggleUnobtainable={() => { uto.onChange(!uto.value); if (!uto.value) field.onChange(undefined) }} labelUnableToObtain={tc("unableToObtain")} required error={localizedPreopValidationMessage(errors.respiratoryRate?.message, tc)} />
                )} />
              )} />
              <Field label={tc("physicalExamReport")} error={blockedErrorFor("physicalExamReport")}>
                <Controller control={control} name="physicalExamReport" render={({ field }) => <StyledInput value={field.value ?? ""} onChangeText={field.onChange} maxLength={500} multiline placeholder={tc("physicalExamHint")} />} />
              </Field>
            </SectionCard>

            <SectionCard title={tc("sectionAirway")} onLayout={(y) => { sectionY.current.airway = y }} visible={showSection("airway")}>
              <Controller control={control} name="airwayUnobtainable" render={({ field }) => <ClinicalSwitchRow label={field.value ? tc("airwayUnableToObtain") : tc("unableToObtain")} value={!!field.value} onValueChange={field.onChange} activeColor={colors.warning} />} />
              {!airwayUnobtainable ? (
                <>
                  <Field label={tc("mallampatiLabel")} required error={localizedPreopValidationMessage(errors.mallampati?.message, tc)}>
                    <Controller control={control} name="mallampati" render={({ field }) => <SegmentedSelect value={field.value} onChange={field.onChange} options={mallampatiOptions.map(o => ({ value: o.value, label: o.value }))} />} />
                  </Field>
                  <Field label={tc("mouthOpeningLabel")}>
                    <Controller control={control} name="mouthOpeningCm" render={({ field }) => <ClinicalNumberInput value={field.value} onChange={field.onChange} min={mouthOpeningRange?.min ?? 0} max={mouthOpeningRange?.max ?? 10} step={mouthOpeningRange?.step ?? 0.5} precision={1} unit="cm" placeholder={tc("mouthOpeningPlaceholder")} quickValues={[3, 3.5, 4, 4.5, 5]} showSteppers={false} />} />
                  </Field>
                  <Field label={tc("thyromental")}>
                    <Controller control={control} name="thyromental" render={({ field }) => <ClinicalNumberInput value={field.value} onChange={field.onChange} min={thyromentalRange?.min ?? 0} max={thyromentalRange?.max ?? 15} step={thyromentalRange?.step ?? 1} precision={0} unit="cm" placeholder={tc("thyromentalPlaceholder")} quickValues={[5, 6, 7, 8, 9]} showSteppers={false} />} />
                  </Field>
                  <Field label={tc("neckMobility")}>
                    <Controller control={control} name="neckMobility" render={({ field }) => <SegmentedSelect value={field.value} onChange={field.onChange} options={neckMobilityOptions.map(option => ({ value: option.value, label: displayOption("NECK_MOBILITY", option, language) }))} />} />
                  </Field>
                  <Field label={tc("ulbtLabel")}>
                    <Controller control={control} name="upperLipBiteTest" render={({ field }) => <SegmentedSelect value={field.value} onChange={field.onChange} options={upperLipBiteOptions.map(option => ({ value: option.value, label: displayOption("UPPER_LIP_BITE", option, language) }))} />} />
                  </Field>
                  <Field label={tc("cormackLehane")}>
                    <Controller control={control} name="cormackLehane" render={({ field }) => <SegmentedSelect value={field.value} onChange={field.onChange} options={cormackLehaneOptions.map(option => ({ value: option.value, label: displayOption("CORMACK_LEHANE", option, language) }))} />} />
                  </Field>
                  <Controller control={control} name="retrognathia" render={({ field }) => <ClinicalYesNoRow label={tc("retrognathia")} value={field.value ?? null} onValueChange={field.onChange} />} />
                  <Controller control={control} name="prominentIncisors" render={({ field }) => <ClinicalYesNoRow label={tc("prominentIncisors")} value={field.value ?? null} onValueChange={field.onChange} />} />
                  <Controller control={control} name="facialHair" render={({ field }) => <ClinicalYesNoRow label={tc("facialHair")} value={field.value ?? null} onValueChange={field.onChange} />} />
                  <Controller control={control} name="difficultAirwayHistory" render={({ field }) => <ClinicalYesNoRow label={tc("difficultAirwayHx")} value={field.value ?? null} onValueChange={(value) => {
                    field.onChange(value)
                    if (!value) setValue("difficultAirwayNotes", "", { shouldDirty: true })
                  }} activeColor={colors.danger} />} />
                  {difficultAirwayHistory ? <Field label={tc("difficultAirwayNotes")} error={blockedErrorFor("difficultAirwayNotes")}><Controller control={control} name="difficultAirwayNotes" render={({ field }) => <StyledInput value={field.value ?? ""} onChangeText={field.onChange} maxLength={500} multiline placeholder={tc("difficultAirwayHint")} />} /></Field> : null}
                </>
              ) : null}
            </SectionCard>

            <SectionCard
              title={tc("sectionLabs")}
              subtitle={tc(clinicalAi.labImageExtraction.enabled
                ? "labsPrivacyNote"
                : capabilityMessageKey(clinicalAi.labImageExtraction.reason))}
              onLayout={(y) => { sectionY.current.labs = y }}
              visible={showSection("labs")}
            >
              <Controller control={control} name="labResults" render={({ field }) => (
                <>
                  {clinicalAi.labImageExtraction.enabled ? (
                    <LabScanPanel value={field.value ?? []} onAddResults={(results) => field.onChange([...(field.value ?? []), ...results])} />
                  ) : null}
                  <ManualLabPanel value={field.value ?? []} onChange={field.onChange} labelManualLabEntry={tc("manualLabEntry")} labelHideManualLab={tc("hideManualLab")} labelSearchLabs={tc("searchLabs")} />
                </>
              )} />
            </SectionCard>

            <SectionCard title={tc("sectionRisk")} onLayout={(y) => { sectionY.current.risk = y }} visible={showSection("risk")}>
              <Field label={tc("asaPhysicalStatus")} required error={localizedPreopValidationMessage(errors.asaScore?.message, tc)}>
                <Controller control={control} name="asaScore" render={({ field }) => (
                  <AsaPicker
                    value={field.value}
                    onChange={(v) => field.onChange(v || undefined)}
                    emergencySurgery={!!emergencySurgery}
                    suggestion={asaSuggestion}
                    labelSuggested={tc("asaSuggested")}
                    labelSuggestedReview={tc("asaSuggestedReview")}
                    labelEmergencySuffix={tc("emergencySuffix")}
                  />
                )} />
              </Field>
              {!pediatricMode ? (
                <View style={{ flexDirection: "row", gap: 8, marginBottom: 14 }}>
                  <ScoreBadge label="RCRI" score={rcriScore} max={6} riskLabel={rcriRiskLabel(rcriScore, tc)} />
                  <ScoreBadge label="Apfel" score={apfelScore} max={4} riskLabel={apfelRiskLabel(apfelScore, tc)} />
                  <ScoreBadge label="STOP-BANG" score={stopBangScore} max={8} riskLabel={stopBangRiskLabel(stopBangScore, tc)} />
                </View>
              ) : (
                <PediatricRiskAndCalculators control={control} setValue={setValue} tc={tc} language={language} caseId={caseId} />
              )}
              {!pediatricMode && clinicalAi.clinicalAdvice.enabled ? (
                <Controller control={control} name="aiOptIn" render={({ field }) => (
                  <AiAdvisorPanel
                    aiOptIn={!!field.value}
                    onToggleOptIn={field.onChange}
                    analysing={aiLoading}
                    streamedText={aiText}
                    error={aiError}
                    onRun={runAdvisor}
                    tc={tc}
                  />
                )} />
              ) : !pediatricMode ? (
                <Text style={{ color: colors.textMuted, fontSize: 12, lineHeight: 18, marginBottom: 14 }}>
                  {tc(capabilityMessageKey(clinicalAi.clinicalAdvice.reason))}
                </Text>
              ) : null}
            </SectionCard>

            <PrimaryButton label={tc("continueIntraop")} onPress={handleSubmit(onSubmit, onInvalid)} loading={saving} />
          </View>
          </Animated.View>
        </Animated.ScrollView>

        {scrollRailVisible && preopLayout !== "sections" ? (
          <View pointerEvents="none" style={{ position: "absolute", right: 6, top: appHeaderHidden ? insets.top + 78 : 182, bottom: 34, width: 210, alignItems: "flex-end" }}>
            <View onLayout={(event) => setRailHeight(Math.max(1, event.nativeEvent.layout.height))} style={{ flex: 1, width: 18, alignItems: "center", justifyContent: "center" }}>
              <View style={{ position: "absolute", top: 0, bottom: 0, width: 3, borderRadius: 999, backgroundColor: withAlpha(colors.borderStrong, "AA") }} />
              <Animated.View
                style={{
                  position: "absolute",
                  top: 0,
                  width: 3,
                  height: scrollYAnim.interpolate({ inputRange: [0, maxScrollY], outputRange: [0, railHeight], extrapolate: "clamp" }),
                  borderRadius: 999,
                  backgroundColor: colors.primary,
                }}
              />
              <Animated.View
                style={{
                  position: "absolute",
                  top: 0,
                  right: 4,
                  width: 10,
                  height: 10,
                  borderRadius: 999,
                  backgroundColor: colors.primary,
                  transform: [{ translateY: scrollYAnim.interpolate({ inputRange: [0, maxScrollY], outputRange: [-5, railHeight - 5], extrapolate: "clamp" }) }],
                }}
              />
              <Animated.View
                style={{
                  position: "absolute",
                  top: 0,
                  right: 24,
                  transform: [{ translateY: scrollYAnim.interpolate({ inputRange: [0, maxScrollY], outputRange: [-14, railHeight - 14], extrapolate: "clamp" }) }],
                  minWidth: 86,
                  maxWidth: 176,
                  borderRadius: 999,
                  backgroundColor: withAlpha(colors.background, "F2"),
                  borderWidth: 1,
                  borderColor: withAlpha(colors.primary, "77"),
                  paddingHorizontal: 8,
                  paddingVertical: 5,
                }}
              >
                <Text style={{ color: colors.primary, fontSize: 10, fontWeight: "900", textAlign: "center" }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
                  {SECTION_LABELS.find((section) => section.key === activeSection)?.label}
                </Text>
              </Animated.View>
            </View>
          </View>
        ) : null}
          {/* FAB — go back to section overview */}
          <TouchableOpacity
            onPress={() => { preopModeRef.current = "overview"; setPreopMode("overview") }}
            style={{
              position: "absolute", bottom: insets.bottom + 24, right: 20,
              width: 50, height: 50, borderRadius: 25,
              backgroundColor: colors.primary, alignItems: "center", justifyContent: "center",
              shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 8,
            }}
          >
            <Ionicons name="grid-outline" size={23} color="#fff" />
          </TouchableOpacity>
        </View>}
      </KeyboardAvoidingView>
    </>
  )
}
