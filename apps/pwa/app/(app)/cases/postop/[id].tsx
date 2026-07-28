import { useCallback, useEffect, useRef, useState } from "react"
import {
  View, Text, ScrollView, TextInput, TouchableOpacity,
  ActivityIndicator, Switch, KeyboardAvoidingView, Platform,
} from "react-native"
import { useLocalSearchParams, useRouter, Stack } from "expo-router"
import { notify } from "@/lib/notify"
import { useForm, Controller, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { apiJson } from "@/lib/api"
import type { CasePatchResponse, CasePatchResult } from "@/lib/offline-case-patches"
import { autosaveManager } from "@/lib/autosave-manager"
import { useLiveRefresh } from "@/lib/use-live-refresh"
import { ScreenState } from "@/components/clinical-ui"
import { AppHeader } from "@/components/AppHeader"
import { EditWindowBanner } from "@/components/EditWindowBanner"
import { VitalNumber } from "@/components/VitalStepper"
import { convertedMeasurement } from "@/lib/use-converted-measurement"
import { colors, withAlpha } from "@/theme/colors"
import { useCaseLock } from "@/lib/use-case-lock"
import { WatchingOverlay } from "@/components/WatchingOverlay"
import { usePreferences } from "@/lib/preferences-context"
import { useRangeSpec } from "@/lib/use-option-library"
import { normaliseHandoverCodes, postopFormSchema, type PostopFormData as FormData, type PostopFormInput as FormInput } from "@/lib/postop-form-schema"
import { DispositionPicker, Field, HandoverChecklist, NRSRow, RecoverySummary, ScoreRow, SectionHeader } from "@/components/postop/PostopFormSections"
import { canonicalizePostopPatch } from "@lospor/core/case-payloads"
import type { BlockedSaveIssue } from "@lospor/core/sync"
import {
  aldreteBand,
  aldreteTotal as calculateAldreteTotal,
} from "@lospor/core/postop"

// ─── Schema ───────────────────────────────────────────────────────────────────

type AutosaveState = "idle" | "saving" | "saved" | "queued" | "blocked" | "error"

// ─── Data ─────────────────────────────────────────────────────────────────────

export default function PostopFormScreen() {
  const { id, continuedItems } = useLocalSearchParams<{ id: string; continuedItems?: string }>()
  const router    = useRouter()
  const { tc, t, heightUnit, weightUnit, temperatureUnit, etco2Unit } = usePreferences()
  const unitPrefs = { heightUnit, weightUnit, temperatureUnit, etco2Unit }
  const recoveryBpSystolicRange  = useRangeSpec("BP_SYSTOLIC_RANGE")
  const recoveryBpDiastolicRange = useRangeSpec("BP_DIASTOLIC_RANGE")
  const recoveryHeartRateRange   = useRangeSpec("HEART_RATE_RANGE")
  const recoverySpo2Range        = useRangeSpec("SPO2_RANGE")
  const recoveryTemperatureRange = useRangeSpec("TEMPERATURE_RANGE")
  const _painNrsRange            = useRangeSpec("PAIN_NRS_RANGE")
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
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ─── ALDRETE_CRITERIA defined inside component so it can use tc() ──────────
  const ALDRETE_CRITERIA: {
    field: keyof Pick<FormData, "aldreteActivity" | "aldreteRespiration" | "aldreteCirculation" | "aldreteConsciousness" | "aldreteSpO2">
    label: string
    descriptions: [string, string, string]
  }[] = [
    {
      field: "aldreteActivity",
      label: tc("aldreteActivity"),
      descriptions: [tc("aldreteNoMovement"), tc("aldrete2Extremities"), tc("aldreteAllExtremities")],
    },
    {
      field: "aldreteRespiration",
      label: tc("aldreteRespiration"),
      descriptions: [tc("aldreteApnoeic"), tc("aldreteShallow"), tc("aldreteDeepBreath")],
    },
    {
      field: "aldreteCirculation",
      label: tc("aldreteCirculation"),
      descriptions: [tc("aldreteBP50"), tc("aldreteBP20to49"), tc("aldreteBP20")],
    },
    {
      field: "aldreteConsciousness",
      label: tc("aldreteConsciousness"),
      descriptions: [tc("aldreteNoResponse"), tc("aldreteArousable"), tc("aldreteAwake")],
    },
    {
      field: "aldreteSpO2",
      label: tc("aldreteSpO2"),
      descriptions: [tc("aldreteSpO2Low"), tc("aldreteSpO2Mid"), tc("aldreteSpO2High")],
    },
  ]

  const { control, handleSubmit, reset, getValues, setValue } = useForm<FormInput, unknown, FormData>({
    resolver: zodResolver(postopFormSchema),
    defaultValues: {
      aldreteActivity:      0,
      aldreteRespiration:   0,
      aldreteCirculation:   0,
      aldreteConsciousness: 0,
      aldreteSpO2:          0,
      ponv:               false,
      handoverItems:      [],
    },
  })

  // Watch all five Aldrete score fields to compute the live total
  const aldreteActivity      = useWatch({ control, name: "aldreteActivity" })
  const aldreteRespiration   = useWatch({ control, name: "aldreteRespiration" })
  const aldreteCirculation   = useWatch({ control, name: "aldreteCirculation" })
  const aldreteConsciousness = useWatch({ control, name: "aldreteConsciousness" })
  const aldreteSpO2          = useWatch({ control, name: "aldreteSpO2" })
  const disposition        = useWatch({ control, name: "disposition" })
  const handoverItems      = useWatch({ control, name: "handoverItems" }) ?? []
  const dispositionNotes   = useWatch({ control, name: "dispositionNotes" })
  const painScoreNRS       = useWatch({ control, name: "painScoreNRS" })
  const ponv               = useWatch({ control, name: "ponv" })
  const formValues         = useWatch({ control })

  useEffect(() => {
    if (disposition === "WARD" || disposition === "PACU") return
    if (handoverItems.length) setValue("handoverItems", [], { shouldDirty: true })
    if (dispositionNotes) setValue("dispositionNotes", "", { shouldDirty: true })
  }, [disposition, dispositionNotes, handoverItems.length, setValue])

  const aldreteTotal = calculateAldreteTotal({
    aldreteActivity,
    aldreteRespiration,
    aldreteCirculation,
    aldreteConsciousness,
    aldreteSpO2,
  })
  const aldreteStatus = aldreteBand(aldreteTotal)

  const aldreteLabel =
    aldreteStatus === "ready"
      ? tc("summaryReadyDischarge")
      : aldreteStatus === "observe"
      ? tc("summaryMonitor")
      : tc("summaryContinueRecovery")

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
  type CaseResponse = { postop?: PostopRecord; finalizedAt?: string | null; status?: string }

  const valuesFromPostop = useCallback((p: PostopRecord): FormData => {
    return {
      aldreteActivity:      p.aldreteActivity      ?? p.activityScore      ?? 0,
      aldreteRespiration:   p.aldreteRespiration   ?? p.respirationScore   ?? 0,
      aldreteCirculation:   p.aldreteCirculation   ?? p.circulationScore   ?? 0,
      aldreteConsciousness: p.aldreteConsciousness ?? p.consciousnessScore ?? 0,
      aldreteSpO2:          p.aldreteSpO2          ?? p.spO2Score          ?? 0,
      // Recovery vitals — same ranges + random pre-fill as the preop exam form
      recoveryBpSystolic:   p.recoveryBpSystolic  ?? (Math.floor(Math.random() * 11) + 120),
      recoveryBpDiastolic:  p.recoveryBpDiastolic ?? (Math.floor(Math.random() * 16) + 70),
      recoveryHeartRate:    p.recoveryHeartRate   ?? (Math.floor(Math.random() * 31) + 60),
      recoverySpO2:         p.recoverySpO2        ?? (Math.floor(Math.random() * 5)  + 95),
      temperatureCelsius:   p.temperatureCelsius  ?? p.temperaturePostop ?? parseFloat((36 + Math.random()).toFixed(1)),
      recoveryBpUnobtainable:          p.recoveryBpUnobtainable          ?? false,
      recoveryHeartRateUnobtainable:   p.recoveryHeartRateUnobtainable   ?? false,
      recoverySpO2Unobtainable:        p.recoverySpO2Unobtainable        ?? false,
      recoveryTemperatureUnobtainable: p.recoveryTemperatureUnobtainable ?? false,
      painScoreNRS:       p.painScoreNRS,
      ponv:               p.ponv               ?? false,
      disposition:        p.disposition,
      dispositionNotes:   p.dispositionNotes   ?? "",
      handoverItems:      normaliseHandoverCodes(Array.isArray(p.handoverItems) ? p.handoverItems : []),
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
        const serverValues = valuesFromPostop(p)
        const queuedPostop = await autosaveManager.outbox.load<Record<string, unknown>>(id, "postop")
        const nextValues = valuesFromPostop({ ...p, ...(queuedPostop ?? {}) })
        lastSavedJsonRef.current = JSON.stringify(payloadFrom(nextValues))
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
      .catch((err: Error) => notify(tc("errorLabel"), err.message))
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
      } catch (err) {
        setAutosaveErrMsg(err instanceof Error ? err.message : null)
        setAutosaveState("error")
      }
    }, 900)

    return () => {
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current)
    }
  }, [formValues, getValues, loading, persistPostop, payloadFrom])

  useLiveRefresh(async () => {
    await autosaveManager.flushCase(id)
    if (autosaveManager.getState(id).pending === 0) markSaveResult("saved")
  }, { enabled: !loading && autosaveState === "queued", intervalMs: 10_000 })

  async function onSubmit(data: FormData) {
    setSaving(true)
    try {
      const result = await persistPostop(data)
      if (result === "saved") {
        router.replace(`/(app)/cases/${id}`)
      } else if (result === "blocked") {
        notify(tc("draftBlocked"), autosaveManager.getState(id).error ?? tc("autosaveError"))
      } else {
        notify(t("savedLocally"), t("savedLocallyMsg"))
      }
    } catch (err) {
      notify(tc("errorLabel"), err instanceof Error ? err.message : t("couldNotOverwrite"))
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
        <ScrollView style={{ paddingHorizontal: 20, paddingTop: 2 }} contentContainerStyle={{ paddingBottom: 80 }}>
          <RecoverySummary
            total={aldreteTotal}
            label={aldreteLabel}
            disposition={disposition}
            pain={painScoreNRS}
            ponv={ponv}
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
          {/* ── Modified Aldrete Score ─────────────────────────────── */}
          <SectionHeader title={tc("aldreteScore")} />

          {ALDRETE_CRITERIA.map((criterion) => (
            <View key={criterion.field} className="mb-4">
              <Text style={{ color: colors.textPrimary, fontSize: 15, fontWeight: "800", marginBottom: 8 }}>{criterion.label}</Text>
              <Controller
                control={control}
                name={criterion.field}
                render={({ field: { onChange, value } }) => (
                  <ScoreRow
                    label={criterion.label}
                    value={value as number}
                    onChange={onChange}
                    descriptions={criterion.descriptions}
                  />
                )}
              />
            </View>
          ))}

          {/* ── Recovery vitals ────────────────────────────────────── */}
          <SectionHeader title={tc("recoveryVitals")} />

          <View style={{ flexDirection: "row", gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Controller control={control} name="recoveryBpSystolic" render={({ field }) => (
                <Controller control={control} name="recoveryBpUnobtainable" render={({ field: uto }) => (
                  <VitalNumber label={tc("sbpLabel")} unit="mmHg" value={field.value} onChange={field.onChange} min={recoveryBpSystolicRange?.min ?? 1} max={recoveryBpSystolicRange?.max ?? 300} step={recoveryBpSystolicRange?.step ?? 1} unobtainable={!!uto.value} onToggleUnobtainable={() => { uto.onChange(!uto.value); if (!uto.value) field.onChange(undefined) }} labelUnableToObtain={tc("unableToObtain")} />
                )} />
              )} />
            </View>
            <View style={{ flex: 1 }}>
              <Controller control={control} name="recoveryBpDiastolic" render={({ field }) => (
                <Controller control={control} name="recoveryBpUnobtainable" render={({ field: uto }) => (
                  <VitalNumber label={tc("dbpLabel")} unit="mmHg" value={field.value} onChange={field.onChange} min={recoveryBpDiastolicRange?.min ?? 1} max={recoveryBpDiastolicRange?.max ?? 200} step={recoveryBpDiastolicRange?.step ?? 1} unobtainable={!!uto.value} onToggleUnobtainable={() => { uto.onChange(!uto.value); if (!uto.value) field.onChange(undefined) }} labelUnableToObtain={tc("unableToObtain")} />
                )} />
              )} />
            </View>
          </View>

          <Controller control={control} name="recoveryHeartRate" render={({ field }) => (
            <Controller control={control} name="recoveryHeartRateUnobtainable" render={({ field: uto }) => (
              <VitalNumber label={tc("heartRateLabel")} unit="bpm" value={field.value} onChange={field.onChange} min={recoveryHeartRateRange?.min ?? 1} max={recoveryHeartRateRange?.max ?? 300} step={recoveryHeartRateRange?.step ?? 1} unobtainable={!!uto.value} onToggleUnobtainable={() => { uto.onChange(!uto.value); if (!uto.value) field.onChange(undefined) }} labelUnableToObtain={tc("unableToObtain")} />
            )} />
          )} />

          <Controller control={control} name="recoverySpO2" render={({ field }) => (
            <Controller control={control} name="recoverySpO2Unobtainable" render={({ field: uto }) => (
              <VitalNumber label={tc("spO2Label")} unit="%" value={field.value} onChange={field.onChange} min={recoverySpo2Range?.min ?? 0} max={recoverySpo2Range?.max ?? 100} step={recoverySpo2Range?.step ?? 1} unobtainable={!!uto.value} onToggleUnobtainable={() => { uto.onChange(!uto.value); if (!uto.value) field.onChange(undefined) }} labelUnableToObtain={tc("unableToObtain")} />
            )} />
          )} />

          <Controller control={control} name="temperatureCelsius" render={({ field }) => (
            <Controller control={control} name="recoveryTemperatureUnobtainable" render={({ field: uto }) => {
              const cv = convertedMeasurement("temperature", unitPrefs, field.value, field.onChange, recoveryTemperatureRange?.min ?? 0, recoveryTemperatureRange?.max ?? 45, recoveryTemperatureRange?.step ?? 0.1)
              return <VitalNumber label={tc("temperatureLabel")} unit={cv.unit} value={cv.value} onChange={cv.onChange} min={cv.min} max={cv.max} step={cv.step} precision={cv.precision || 1} unobtainable={!!uto.value} onToggleUnobtainable={() => { uto.onChange(!uto.value); if (!uto.value) field.onChange(undefined) }} labelUnableToObtain={tc("unableToObtain")} />
            }} />
          )} />

          <Field label={tc("painNRS")}>
            <Controller
              control={control}
              name="painScoreNRS"
              render={({ field: { onChange, value } }) => (
                <NRSRow value={value} onChange={onChange} />
              )}
            />
          </Field>

          <Field label={tc("ponvLabel")}>
            <Controller
              control={control}
              name="ponv"
              render={({ field: { onChange, value } }) => (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: value ? colors.warning : colors.border, borderRadius: 14, borderCurve: "continuous", paddingHorizontal: 14, paddingVertical: 10 }}>
                  <Switch
                    value={value}
                    onValueChange={onChange}
                    trackColor={{ false: colors.borderStrong, true: withAlpha(colors.warning, "66") }}
                    ios_backgroundColor={colors.borderStrong}
                    thumbColor="#fff"
                  />
                  <Text style={{ color: value ? colors.warning : colors.textSecondary, fontSize: 14, fontWeight: "800" }}>{value ? tc("ponvPresent") : tc("ponvAbsent")}</Text>
                </View>
              )}
            />
          </Field>

          {/* ── Disposition ────────────────────────────────────────── */}
          <SectionHeader title={tc("dispositionLabel")} />

          <View className="mb-4">
            <Controller
              control={control}
              name="disposition"
              render={({ field: { onChange, value } }) => (
                <DispositionPicker
                  value={value}
                  onChange={(next) => {
                    onChange(next)
                    if (next !== "WARD" && next !== "PACU") {
                      setValue("handoverItems", [], { shouldDirty: true })
                      setValue("dispositionNotes", "", { shouldDirty: true })
                    }
                  }}
                  wardLabel={tc("dispWard")}
                  pacuLabel={tc("dispPACU")}
                  icuLabel={tc("dispICU")}
                />
              )}
            />
          </View>

          {(disposition === "WARD" || disposition === "PACU") && (
          <Field label={tc("dispNotes")}>
            <Controller
              control={control}
              name="dispositionNotes"
              render={({ field: { onChange, value } }) => (
                <TextInput
                  placeholderTextColor={colors.textMuted}
                  placeholder={t("handoverNotesPlaceholder")}
                  value={value ?? ""}
                  onChangeText={onChange}
                  multiline
                  style={{
                    minHeight: 92,
                    textAlignVertical: "top",
                    backgroundColor: colors.surface,
                    color: colors.textPrimary,
                    borderRadius: 14,
                    borderCurve: "continuous",
                    paddingHorizontal: 14,
                    paddingVertical: 12,
                    fontSize: 16,
                    borderWidth: 1,
                    borderColor: colors.border,
                  }}
                />
              )}
            />
            {blockedIssue?.field === "dispositionNotes" ? (
              <Text style={{ color: colors.danger, fontSize: 12, marginTop: 6 }}>
                {blockedMessage(blockedIssue)}
              </Text>
            ) : null}
          </Field>
          )}

          {/* ── Handover checklist ─────────────────────────────────── */}
          {(disposition === "WARD" || disposition === "PACU") && (
            <>
              <SectionHeader title={tc("handoverChecklist")} />
              <Controller
                control={control}
                name="handoverItems"
                render={({ field: { onChange, value } }) => (
                  <HandoverChecklist value={value ?? []} onChange={onChange} />
                )}
              />
            </>
          )}

          {/* ── Save ───────────────────────────────────────────────── */}
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
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={{ color: colors.background, fontWeight: "900", fontSize: 16 }}>{tc("continueToSummary")}</Text>
            )}
          </TouchableOpacity>

        </ScrollView>
      </KeyboardAvoidingView>
    </>
  )
}
