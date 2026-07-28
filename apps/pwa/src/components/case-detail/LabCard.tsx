import React from "react"
import { View, Text } from "react-native"
import { colors, withAlpha } from "@/theme/colors"
import type { ClinicalStringKey } from "@/lib/preferences-context"
import { SummaryCard } from "./CaseDetailPrimitives"
import {
  type LabResult,
} from "@/lib/case-detail-summary"

export function LabCard({ labResults, tc }: { labResults?: LabResult[]; tc: (key: ClinicalStringKey) => string }) {
  if (!labResults?.length) {
    return (
      <SummaryCard title={tc("cardLabs")} defaultOpen={false}>
        <Text style={{ color: colors.textMuted, fontSize: 12 }}>{tc("noLabResults")}</Text>
      </SummaryCard>
    )
  }

  const numCols = labResults.length <= 9 ? 1 : labResults.length <= 15 ? 2 : 3
  const columns: LabResult[][] = Array.from({ length: numCols }, () => [])
  labResults.forEach((item, i) => columns[i % numCols].push(item))

  return (
    <SummaryCard title={tc("cardLabs")} badge={labResults.length} defaultOpen={false}>
      <View style={{ flexDirection: "row", gap: 12 }}>
        {columns.map((col, ci) => (
          <View key={`col-${ci}`} style={{ flex: 1 }}>
            {col.map((lab, li) => (
              <View key={`lab-${ci}-${li}`} style={{
                flexDirection: "row", justifyContent: "space-between",
                paddingVertical: 5, borderBottomWidth: 1,
                borderBottomColor: withAlpha(colors.border, "77"),
              }}>
                <Text style={{ color: colors.textSecondary, fontSize: 11, fontWeight: "700", flex: 1 }}>
                  {lab.test}
                </Text>
                <Text style={{ color: colors.textPrimary, fontSize: 11, fontWeight: "600" }}>
                  {lab.value}{lab.unit ? ` ${lab.unit}` : ""}
                </Text>
              </View>
            ))}
          </View>
        ))}
      </View>
    </SummaryCard>
  )
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

