import React, { useCallback, useEffect, useMemo, useState } from "react"
import {
  View, Text, ScrollView, TouchableOpacity,
  ActivityIndicator,
} from "react-native"
import { useLocalSearchParams, useRouter, Stack } from "expo-router"
import { apiFetch, apiJson } from "@/lib/api"
import { autosaveManager } from "@/lib/autosave-manager"
import { notify, confirmAction } from "@/lib/notify"
import { openPrintCase } from "@/lib/print-case"
import { AppHeader } from "@/components/AppHeader"
import { EditWindowBanner } from "@/components/EditWindowBanner"
import { STATUS_META, statusLabel } from "@/components/ui"
import { colors, withAlpha } from "@/theme/colors"
import { usePreferences } from "@/lib/preferences-context"
import { AirwayCard, IntraopCard, LabCard, MedicalHistoryCard, PostopCard, PreopCard } from "@/components/case-detail/CaseDetailCards"
import { SummaryTimetable } from "@/components/case-detail/SummaryTimetable"
import {
  computedDisplayStatus,
  type CaseData,
} from "@/lib/case-detail-summary"
import { INTRAOP_RESUME_WINDOW_MS } from "@lospor/core/intraop-engine"

// ─── Types ────────────────────────────────────────────────────────────────────

export default function CaseSummaryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const { tc, t, language } = usePreferences()
  const [caseData, setCaseData] = useState<CaseData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [unfinalizing, setUnfinalizing] = useState(false)

  const loadCase = useCallback(async () => {
    try {
      setError(null)
      const data = await apiJson<CaseData>(`/api/cases/${id}`)
      setCaseData(data)
    } catch {
      setError(tc("caseLoadFailed"))
    } finally {
      setLoading(false)
    }
  }, [id, tc])

  useEffect(() => { loadCase() }, [loadCase])

  const editWindowOpen = useMemo(() => {
    if (!caseData?.finalizedAt) return true
    return Date.now() - new Date(caseData.finalizedAt).getTime() < INTRAOP_RESUME_WINDOW_MS
  }, [caseData?.finalizedAt])

  const canEdit = caseData?.status !== "COMPLETE"

  const handleUnfinalize = useCallback(() => {
    void confirmAction(t("unfinalizeCase"), t("unfinalizeCaseMsg"), { destructive: true, confirmLabel: tc("actionUnfinalize"), cancelLabel: tc("cancelLabel") })
      .then(async ok => {
        if (!ok) return
        setUnfinalizing(true)
        try {
          await apiFetch(`/api/cases/${id}/unfinalize`, { method: "POST" })
          await loadCase()
        } catch {
          notify(tc("errorLabel"), t("couldNotUnfinalize"))
        } finally {
          setUnfinalizing(false)
        }
      })
  }, [id, loadCase, t, tc])

  const handleDelete = useCallback(() => {
    void confirmAction(t("deleteCaseTitle"), t("deleteCaseMsg"), { destructive: true, confirmLabel: tc("actionDelete"), cancelLabel: tc("cancelLabel") })
      .then(async ok => {
        if (!ok) return
        try {
          await apiFetch(`/api/cases/${id}`, { method: "DELETE" })
          router.back()
        } catch {
          notify(tc("errorLabel"), t("couldNotDelete"))
        }
      })
  }, [id, router, t, tc])

  const [printing, setPrinting] = useState(false)
  const handlePrint = useCallback(async () => {
    setPrinting(true)
    try {
      const ok = await openPrintCase(id, language, caseData?.caseCode)
      if (!ok) notify(tc("errorLabel"), tc("printFailed"))
    } finally {
      setPrinting(false)
    }
  }, [id, language, caseData?.caseCode, tc])

  const [finalizing, setFinalizing] = useState(false)

  const handleFinalize = useCallback(() => {
    void confirmAction(tc("actionFinalise"), tc("finalisePrintPrompt"), { confirmLabel: tc("actionFinalise"), cancelLabel: tc("cancelLabel") })
      .then(async ok => {
        if (!ok) return
        setFinalizing(true)
        try {
          await autosaveManager.flushCase(id)
          await autosaveManager.waitForCase(id)
          if (autosaveManager.getState(id).pending > 0) {
            notify(tc("errorLabel"), "Some changes are still waiting to sync. Reconnect and try again.")
            return
          }
          const res = await apiFetch(`/api/cases/${id}/finalize`, { method: "POST" })
          const body = await res.json().catch(() => null)
          setCaseData(prev => prev ? { ...prev, status: "COMPLETE", finalizedAt: body?.finalizedAt ?? new Date().toISOString() } : prev)
          // Case is finished — offer the two-page record straight away.
          const wantsPrint = await confirmAction(tc("caseFinalised"), tc("printCasePromptMsg"), { confirmLabel: tc("actionPrintCase"), cancelLabel: tc("cancelLabel") })
          if (wantsPrint) {
            const printed = await openPrintCase(id, language, caseData?.caseCode)
            if (!printed) notify(tc("errorLabel"), tc("printFailed"))
          }
        } catch {
          notify(tc("errorLabel"), "Could not finalise case.")
        } finally {
          setFinalizing(false)
        }
      })
  }, [caseData?.caseCode, id, language, tc])

  const screenTitle = caseData?.caseCode ?? (loading ? "…" : tc("cardPreop"))

  const procedureTitle = caseData?.preop?.proceduresJson?.[0]?.label
    ?? caseData?.preop?.plannedProcedure
    ?? t("caseDetails")

  const diagnosisSubtitle = caseData?.preop?.diagnosesJson?.[0]?.label
    ?? caseData?.preop?.diagnosis

  const metaParts: string[] = []
  if (caseData?.preop?.ageYears != null) metaParts.push(`${caseData.preop.ageYears} yr`)
  if (caseData?.preop?.sex) {
    const sx = caseData.preop.sex === "MALE" ? "M" : caseData.preop.sex === "FEMALE" ? "F" : caseData.preop.sex
    metaParts.push(sx)
  }
  if (caseData?.preop?.asaScore) metaParts.push(`ASA ${caseData.preop.asaScore}`)
  if (caseData?.intraop?.monthYear) metaParts.push(caseData.intraop.monthYear)

  // ── Loading state ──────────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <Stack.Screen options={{ headerShown: false }} />
        <AppHeader eyebrow="LOSPOR" title="Case" showNewCase={false} />
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 12 }}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={{ color: colors.textMuted, fontSize: 13 }}>{tc("loadingCase")}</Text>
        </View>
      </View>
    )
  }

  // ── Error state ────────────────────────────────────────────────────────────
  if (error || !caseData) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <Stack.Screen options={{ headerShown: false }} />
        <AppHeader eyebrow="LOSPOR" title="Case" showNewCase={false} />
        <View style={{
          flex: 1, alignItems: "center", justifyContent: "center",
          paddingHorizontal: 32, gap: 16,
        }}>
          <Text style={{
            color: colors.danger, fontSize: 16, fontWeight: "700", textAlign: "center",
          }}>
            {error ?? t("caseNotFound")}
          </Text>
          <TouchableOpacity
            onPress={loadCase}
            style={{
              paddingHorizontal: 24, paddingVertical: 10, borderRadius: 999,
              backgroundColor: withAlpha(colors.primary, "22"),
              borderWidth: 1, borderColor: withAlpha(colors.primary, "66"),
            }}
          >
            <Text style={{ color: colors.primary, fontSize: 14, fontWeight: "700" }}>{t("retry")}</Text>
          </TouchableOpacity>
        </View>
      </View>
    )
  }

  // ── Main render ────────────────────────────────────────────────────────────
  const displayStatus = computedDisplayStatus(caseData)
  const sc = STATUS_META[displayStatus]?.color ?? colors.textMuted
  const displayStatusLabel = statusLabel(displayStatus, language)

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Stack.Screen options={{ headerShown: false }} />
      <AppHeader eyebrow="LOSPOR" title={screenTitle} showNewCase={false} />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 48, paddingTop: 12 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Status + meta row */}
        <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
          <View style={{
            paddingHorizontal: 12, paddingVertical: 5, borderRadius: 999,
            backgroundColor: withAlpha(sc, "22"),
            borderWidth: 1, borderColor: withAlpha(sc, "66"),
          }}>
            <Text style={{
              color: sc, fontSize: 11, fontWeight: "800",
              textTransform: "uppercase", letterSpacing: 0.5,
            }}>
              {displayStatusLabel}
            </Text>
          </View>
          {caseData.caseCode ? (
            <Text style={{ color: colors.textMuted, fontSize: 12 }}>{caseData.caseCode}</Text>
          ) : null}
          {caseData.institution?.name ? (
            <Text style={{ color: colors.textMuted, fontSize: 12 }} numberOfLines={1}>
              {caseData.institution.name}
              {caseData.institution.city ? `, ${caseData.institution.city}` : ""}
            </Text>
          ) : null}
        </View>

        {/* ── Hero bar ───────────────────────────────────────────────────────── */}
        <View style={{
          backgroundColor: colors.surfaceRaised, borderRadius: 16,
          borderWidth: 1, borderColor: colors.border, padding: 16, marginBottom: 12,
        }}>
          <Text style={{
            color: colors.textPrimary, fontSize: 20, fontWeight: "900", lineHeight: 26, marginBottom: 4,
          }} numberOfLines={2}>
            {procedureTitle}
          </Text>

          {diagnosisSubtitle ? (
            <Text style={{ color: colors.textMuted, fontSize: 13, marginBottom: 10 }} numberOfLines={2}>
              {diagnosisSubtitle}
            </Text>
          ) : null}

          {metaParts.length > 0 && (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 4 }}>
              {metaParts.map((part, i) => (
                <View key={`meta-${i}`} style={{
                  paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999,
                  backgroundColor: withAlpha(colors.primary, "11"),
                  borderWidth: 1, borderColor: withAlpha(colors.primary, "33"),
                }}>
                  <Text style={{ color: colors.textSecondary, fontSize: 11, fontWeight: "600" }}>
                    {part}
                  </Text>
                </View>
              ))}
            </View>
          )}

          {/* Case finalised green banner */}
          {caseData.status === "COMPLETE" && !editWindowOpen && (
            <View style={{
              marginTop: 10, borderRadius: 10, padding: 10,
              backgroundColor: withAlpha(colors.success, "11"),
              borderWidth: 1, borderColor: withAlpha(colors.success, "55"),
            }}>
              <Text style={{ color: colors.success, fontSize: 12, fontWeight: "700" }}>
                {"✓"} {tc("caseFinalised")}
              </Text>
            </View>
          )}
        </View>

        {/* ── Edit window subheader (shown when case is finalised and window open) */}
        {caseData.finalizedAt != null && editWindowOpen && (
          <EditWindowBanner finalizedAt={caseData.finalizedAt} />
        )}

        {/* ── Review bar ─────────────────────────────────────────────────────── */}
        <View style={{
          marginBottom: 16, borderRadius: 12,
          borderWidth: 1, borderColor: withAlpha(sc, "44"),
          backgroundColor: withAlpha(sc, "0d"),
          overflow: "hidden",
        }}>
          {/* Edit row */}
          {canEdit && (
            <View style={{ flexDirection: "row", padding: 12, paddingBottom: 8, gap: 8 }}>
              <Text style={{ color: colors.textMuted, fontSize: 11, alignSelf: "center", marginRight: 2 }}>
                Edit:
              </Text>
              {(["Preop", "Intraop", "Postop"] as const).map((section) => {
                const onPress = () => {
                  if (section === "Preop")   router.push(`/(app)/cases/new?continue=${id}`)
                  if (section === "Intraop") router.push(`/(app)/cases/intraop/${id}`)
                  if (section === "Postop")  router.push(`/(app)/cases/postop/${id}`)
                }
                return (
                  <TouchableOpacity
                    key={section}
                    onPress={onPress}
                    style={{
                      paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8,
                      borderWidth: 1, borderColor: withAlpha(sc, "66"),
                      backgroundColor: withAlpha(sc, "11"),
                    }}
                  >
                    <Text style={{ color: sc, fontSize: 12, fontWeight: "700" }}>{section}</Text>
                  </TouchableOpacity>
                )
              })}
            </View>
          )}

          {/* Action row */}
          <View style={{ flexDirection: "row", flexWrap: "wrap", padding: 12, paddingTop: canEdit ? 0 : 12, gap: 8 }}>
            {caseData.status !== "COMPLETE" && (
              <TouchableOpacity
                onPress={handleFinalize}
                disabled={finalizing}
                style={{
                  flex: 1, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10,
                  backgroundColor: finalizing ? withAlpha(colors.warning, "55") : colors.warning,
                  alignItems: "center",
                }}
              >
                <Text style={{ color: "#fff", fontSize: 13, fontWeight: "800" }}>
                  {finalizing ? "Finalising…" : tc("actionFinalise")}
                </Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              onPress={handlePrint}
              disabled={printing}
              style={{
                flex: 1, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10,
                borderWidth: 1, borderColor: withAlpha(colors.textSecondary, "55"),
                backgroundColor: withAlpha(colors.textSecondary, "0d"),
                alignItems: "center", opacity: printing ? 0.6 : 1,
              }}
            >
              <Text style={{ color: colors.textSecondary, fontSize: 13, fontWeight: "700" }}>
                {printing ? `⏳ ${tc("printGenerating")}` : tc("actionPrintPDF")}
              </Text>
            </TouchableOpacity>

            {caseData.status === "COMPLETE" && (
              <TouchableOpacity
                onPress={handleUnfinalize}
                disabled={unfinalizing}
                style={{
                  paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10,
                  borderWidth: 1, borderColor: withAlpha(colors.warning, "66"),
                  backgroundColor: withAlpha(colors.warning, "0d"),
                  alignItems: "center",
                }}
              >
                <Text style={{ color: colors.warning, fontSize: 13, fontWeight: "700" }}>
                  {unfinalizing ? `⏳ ${t("unfinalizing")}` : tc("actionUnfinalize")}
                </Text>
              </TouchableOpacity>
            )}

            {caseData.status !== "COMPLETE" && (
              <TouchableOpacity
                onPress={handleDelete}
                style={{
                  paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10,
                  borderWidth: 1, borderColor: withAlpha(colors.danger, "66"),
                  backgroundColor: withAlpha(colors.danger, "0d"),
                  alignItems: "center",
                }}
              >
                <Text style={{ color: colors.danger, fontSize: 13, fontWeight: "700" }}>
                  {tc("actionDelete")}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* ── Six summary cards ──────────────────────────────────────────────── */}
        <PreopCard preop={caseData.preop} tc={tc} t={t} />
        <MedicalHistoryCard preop={caseData.preop} tc={tc} />
        <AirwayCard preop={caseData.preop} tc={tc} />
        {/* Read-only timetable card (same projected data the printed record
            uses). Ongoing case: tap opens the live intraop cockpit. Finished
            case: tap opens the read-only timetable viewer — the cockpit is an
            editing surface and closed cases are read-only. */}
        <SummaryTimetable
          keyEvents={caseData.intraop?.keyEvents}
          startISO={caseData.intraop?.startTime}
          onPress={() => router.push(
            caseData.status === "COMPLETE"
              ? `/(app)/cases/timetable/${id}`
              : `/(app)/cases/intraop/${id}`,
          )}
          actionLabel={caseData.status === "COMPLETE" ? tc("summaryViewTimetable") : undefined}
        />
        <IntraopCard intraop={caseData.intraop} preop={caseData.preop} tc={tc} t={t} />
        <PostopCard postop={caseData.postop} tc={tc} t={t} />
        <LabCard labResults={caseData.preop?.labResults ?? undefined} tc={tc} />
      </ScrollView>
    </View>
  )
}
