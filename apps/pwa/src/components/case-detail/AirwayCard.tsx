import React from "react"
import { View, Text } from "react-native"
import { colors, withAlpha } from "@/theme/colors"
import type { ClinicalStringKey } from "@/lib/preferences-context"
import { SummaryCard, InfoRow, Chip, ChipRow } from "./CaseDetailPrimitives"
import {
  type CaseData,
} from "@/lib/case-detail-summary"

export function AirwayCard({ preop, tc }: { preop: CaseData["preop"]; tc: (key: ClinicalStringKey) => string }) {
  const mallampatiColor = (v?: string): string => {
    if (!v) return colors.textMuted
    if (v === "I") return colors.success
    if (v === "II") return "#fbbf24"
    if (v === "III") return colors.warning
    if (v === "IV") return colors.danger
    return colors.textPrimary
  }

  const neckColor = (v?: string): string => {
    if (!v) return colors.textMuted
    if (v === "FULL") return colors.success
    if (v === "LIMITED") return colors.warning
    if (v === "FIXED") return colors.danger
    return colors.textPrimary
  }

  const ulbtLabel = (v?: string): string | null => {
    if (!v) return null
    if (v === "CLASS_I") return "Class I"
    if (v === "CLASS_II") return "Class II"
    if (v === "CLASS_III") return "Class III"
    return v
  }

  const features: string[] = []
  if (preop?.retrognathia) features.push(tc("summaryRetro"))
  if (preop?.prominentIncisors) features.push(tc("summaryIncisors"))
  if (preop?.facialHair) features.push(tc("summaryFacialHair"))

  const hasData = preop?.mallampati || preop?.mouthOpeningCm != null
    || preop?.thyromental != null || preop?.neckMobility
    || preop?.upperLipBiteTest || preop?.cormackLehane
    || features.length > 0 || preop?.difficultAirwayHistory

  if (!hasData) {
    return (
      <SummaryCard title={tc("cardAirwayAssessment")}>
        <Text style={{ color: colors.textMuted, fontSize: 12 }}>{tc("notAssessed")}</Text>
      </SummaryCard>
    )
  }

  return (
    <SummaryCard title={tc("cardAirwayAssessment")}>
      {preop?.difficultAirwayHistory && (
        <View style={{
          borderWidth: 1, borderColor: withAlpha(colors.danger, "66"),
          borderRadius: 10, padding: 10, marginBottom: 12,
          backgroundColor: withAlpha(colors.danger, "11"),
        }}>
          <Text style={{ color: colors.danger, fontSize: 13, fontWeight: "700" }}>
            {"⚠️"} {tc("summaryDifficultAirway")}
          </Text>
          {preop.difficultAirwayNotes ? (
            <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 4 }}>
              {preop.difficultAirwayNotes}
            </Text>
          ) : null}
        </View>
      )}

      <View style={{ flexDirection: "row", gap: 16 }}>
        <View style={{ flex: 1 }}>
          <InfoRow
            label={tc("summaryMallampati")}
            value={preop?.mallampati ?? null}
            valueColor={mallampatiColor(preop?.mallampati ?? undefined)}
          />
          <InfoRow
            label={tc("summaryMouthOpening")}
            value={preop?.mouthOpeningCm != null ? `${preop.mouthOpeningCm} cm` : null}
          />
          <InfoRow
            label={tc("summaryThyromental")}
            value={preop?.thyromental != null ? `${preop.thyromental} cm` : null}
          />
        </View>
        <View style={{ flex: 1 }}>
          <InfoRow
            label={tc("summaryNeckMobility")}
            value={preop?.neckMobility ?? null}
            valueColor={neckColor(preop?.neckMobility ?? undefined)}
          />
          <InfoRow
            label="ULBT"
            value={ulbtLabel(preop?.upperLipBiteTest ?? undefined)}
          />
          <InfoRow
            label={tc("summaryCL")}
            value={preop?.cormackLehane ?? null}
          />
        </View>
      </View>

      {features.length > 0 && (
        <ChipRow>
          {features.map((f, i) => <Chip key={`af-${i}`} label={f} color={colors.warning} />)}
        </ChipRow>
      )}
    </SummaryCard>
  )
}

// ─── Card 4: Intraoperative ───────────────────────────────────────────────────

