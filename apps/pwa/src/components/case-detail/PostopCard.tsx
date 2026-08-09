import React from "react"
import { View, Text } from "react-native"
import { colors, withAlpha } from "@/theme/colors"
import { usePreferences, type ClinicalStringKey, type TranslationKey } from "@/lib/preferences-context"
import { displayClinicalCode } from "@/lib/clinical-display"
import { SummaryCard, Divider, AldreteRow } from "./CaseDetailPrimitives"
import {
  formatHandoverItem,
  type CaseData,
} from "@/lib/case-detail-summary"
import { aldreteBand, aldreteTotal } from "@lospor/core/postop"

type AldreteCriterion = {
  field: keyof NonNullable<CaseData["postop"]>
  label: string
  descriptions: [string, string, string]
}

export function PostopCard({ postop, tc, t }: { postop: CaseData["postop"]; tc: (key: ClinicalStringKey) => string; t: (key: TranslationKey) => string }) {
  const { language } = usePreferences()

  const ALDRETE_CRITERIA: AldreteCriterion[] = [
    { field: "aldreteActivity", label: tc("aldreteActivity"), descriptions: [tc("aldreteNoMovement"), tc("aldrete2Extremities"), tc("aldreteAllExtremities")] },
    { field: "aldreteRespiration", label: tc("aldreteRespiration"), descriptions: [tc("aldreteApnoeic"), tc("aldreteShallow"), tc("aldreteDeepBreath")] },
    { field: "aldreteCirculation", label: tc("aldreteCirculation"), descriptions: [tc("aldreteBP50"), tc("aldreteBP20to49"), tc("aldreteBP20")] },
    { field: "aldreteConsciousness", label: tc("aldreteConsciousness"), descriptions: [tc("aldreteNoResponse"), tc("aldreteArousable"), tc("aldreteAwake")] },
    { field: "aldreteSpO2", label: tc("aldreteSpO2"), descriptions: [tc("aldreteSpO2Low"), tc("aldreteSpO2Mid"), tc("aldreteSpO2High")] },
  ]

  if (!postop) {
    return (
      <SummaryCard title={tc("cardPostop")} defaultOpen={false}>
        <Text style={{ color: colors.textMuted, fontSize: 12 }}>{tc("notYetRecorded")}</Text>
      </SummaryCard>
    )
  }

  // Null until all five components are recorded. A stored aldreteTotal from
  // before this distinction existed is still shown as-is.
  const total = postop.aldreteTotal ?? aldreteTotal(postop)
  const totalStatus = total == null ? null : aldreteBand(total)
  const totalColor = totalStatus === null
    ? colors.textMuted
    : totalStatus === "ready"
    ? colors.success
    : totalStatus === "observe" ? colors.warning : colors.danger
  const totalLabel = totalStatus === null
    ? tc("aldreteNotAssessed")
    : totalStatus === "ready"
    ? tc("summaryReady")
    : totalStatus === "observe" ? tc("summaryMonitor") : tc("summaryContinueRecovery")

  const dispColor = (d?: string): string => {
    if (d === "WARD") return colors.success
    if (d === "PACU") return colors.warning
    if (d === "ICU") return colors.danger
    return colors.textMuted
  }

  return (
    <SummaryCard title={tc("cardPostop")} defaultOpen={false}>
      {ALDRETE_CRITERIA.map(c => (
        <AldreteRow
          key={String(c.field)}
          label={c.label}
          value={postop[c.field] as number | undefined}
          descriptions={c.descriptions}
        />
      ))}

      {/* Total */}
      <View style={{
        flexDirection: "row", alignItems: "center", justifyContent: "space-between",
        paddingVertical: 12,
      }}>
        <Text style={{ color: colors.textPrimary, fontSize: 14, fontWeight: "800" }}>
          {tc("summaryAldrete")}
        </Text>
        <View style={{
          paddingHorizontal: 14, paddingVertical: 6, borderRadius: 999,
          backgroundColor: withAlpha(totalColor, "22"),
          borderWidth: 1, borderColor: withAlpha(totalColor, "66"),
        }}>
          <Text style={{ color: totalColor, fontSize: 14, fontWeight: "900" }}>
            {total}/10 — {totalLabel}
          </Text>
        </View>
      </View>

      <Divider />

      {/* Recovery metrics */}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
        {postop.recoveryBpSystolic != null && postop.recoveryBpDiastolic != null && (
          <View style={{
            flex: 1, minWidth: 92,
            backgroundColor: withAlpha(colors.danger, "11"),
            borderWidth: 1, borderColor: withAlpha(colors.danger, "44"),
            borderRadius: 10, padding: 8, alignItems: "center",
          }}>
            <Text style={{ color: colors.danger, fontSize: 16, fontWeight: "800" }}>
              {postop.recoveryBpSystolic}/{postop.recoveryBpDiastolic}
            </Text>
            <Text style={{ color: colors.textMuted, fontSize: 10, marginTop: 2 }}>BP mmHg</Text>
          </View>
        )}
        {postop.recoveryHeartRate != null && (
          <View style={{
            flex: 1, minWidth: 70,
            backgroundColor: withAlpha(colors.success, "11"),
            borderWidth: 1, borderColor: withAlpha(colors.success, "44"),
            borderRadius: 10, padding: 8, alignItems: "center",
          }}>
            <Text style={{ color: colors.success, fontSize: 16, fontWeight: "800" }}>{postop.recoveryHeartRate}</Text>
            <Text style={{ color: colors.textMuted, fontSize: 10, marginTop: 2 }}>HR bpm</Text>
          </View>
        )}
        {postop.recoverySpO2 != null && (
          <View style={{
            flex: 1, minWidth: 70,
            backgroundColor: withAlpha(colors.primary, "11"),
            borderWidth: 1, borderColor: withAlpha(colors.primary, "44"),
            borderRadius: 10, padding: 8, alignItems: "center",
          }}>
            <Text style={{ color: colors.primary, fontSize: 16, fontWeight: "800" }}>{postop.recoverySpO2}%</Text>
            <Text style={{ color: colors.textMuted, fontSize: 10, marginTop: 2 }}>SpO₂</Text>
          </View>
        )}
        {postop.temperatureCelsius != null && (
          <View style={{
            flex: 1, minWidth: 70,
            backgroundColor: withAlpha(colors.temp, "11"),
            borderWidth: 1, borderColor: withAlpha(colors.temp, "44"),
            borderRadius: 10, padding: 8, alignItems: "center",
          }}>
            <Text style={{ color: colors.temp, fontSize: 16, fontWeight: "800" }}>
              {postop.temperatureCelsius}
            </Text>
            <Text style={{ color: colors.textMuted, fontSize: 10, marginTop: 2 }}>Temp °C</Text>
          </View>
        )}
        {postop.painScoreNRS != null && (
          <View style={{
            flex: 1, minWidth: 70,
            backgroundColor: withAlpha(colors.warning, "11"),
            borderWidth: 1, borderColor: withAlpha(colors.warning, "44"),
            borderRadius: 10, padding: 8, alignItems: "center",
          }}>
            <Text style={{ color: colors.warning, fontSize: 16, fontWeight: "800" }}>
              {postop.painScoreNRS}/10
            </Text>
            <Text style={{ color: colors.textMuted, fontSize: 10, marginTop: 2 }}>{tc("summaryPain")} NRS</Text>
          </View>
        )}
        {postop.ponv != null && (
          <View style={{
            flex: 1, minWidth: 60,
            backgroundColor: withAlpha(postop.ponv ? colors.danger : colors.textMuted, "11"),
            borderWidth: 1, borderColor: withAlpha(postop.ponv ? colors.danger : colors.textMuted, "44"),
            borderRadius: 10, padding: 8, alignItems: "center",
          }}>
            <Text style={{
              color: postop.ponv ? colors.danger : colors.textMuted,
              fontSize: 14, fontWeight: "800",
            }}>
              {postop.ponv ? t("yesLabel") : t("noLabel")}
            </Text>
            <Text style={{ color: colors.textMuted, fontSize: 10, marginTop: 2 }}>{tc("summaryPONV")}</Text>
          </View>
        )}
      </View>

      {postop.disposition && (
        <View style={{
          paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, alignSelf: "flex-start",
          backgroundColor: withAlpha(dispColor(postop.disposition), "22"),
          borderWidth: 1, borderColor: withAlpha(dispColor(postop.disposition), "55"),
          marginBottom: 10,
        }}>
          <Text style={{
            color: dispColor(postop.disposition), fontSize: 13, fontWeight: "800",
          }}>
            {tc("summaryDischarge")}: {displayClinicalCode("option:DISPOSITION", postop.disposition, language)}
          </Text>
        </View>
      )}

      {(postop.handoverItems?.length ?? 0) > 0 && (
        <View>
          <Text style={{
            color: colors.textMuted, fontSize: 11, textTransform: "uppercase",
            letterSpacing: 0.5, marginBottom: 6,
          }}>
            {tc("summaryHandover")}
          </Text>
          {postop.handoverItems!.map((item, i) => (
            <View key={`hi-${i}`} style={{
              flexDirection: "row", alignItems: "center",
              paddingVertical: 4, gap: 8,
            }}>
              <View style={{ width: 7, height: 7, borderRadius: 999, backgroundColor: colors.success }} />
              <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
                {formatHandoverItem(item, language)}
              </Text>
            </View>
          ))}
        </View>
      )}
    </SummaryCard>
  )
}

// ─── Card 6: Laboratory Results ───────────────────────────────────────────────

