import { Text, View } from "react-native"
import { colors, withAlpha, useThemeRefresh } from "@/theme/colors"
import { riskColor, type RiskLevel } from "@/lib/case-detail-summary"

export function ScoreBadge({ label, score, max, riskLabel, unavailable }: {
  label: string
  score: number
  max: number
  /** The band core gives this score. Its level sets the colour, so the colour and the words cannot disagree. */
  riskLabel?: { label: string; level: RiskLevel }
  /** A score with an input the hospital switched off: said instead of a number that understates the risk. */
  unavailable?: string
}) {
  useThemeRefresh()
  if (unavailable) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 15, paddingVertical: 12, paddingHorizontal: 6, alignItems: "center" }}>
        <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: "900" }}>{label}</Text>
        <Text style={{ color: colors.textMuted, fontSize: 9, textAlign: "center", marginTop: 4 }}>{unavailable}</Text>
      </View>
    )
  }
  // One cut-off for every score coloured an RCRI of 3 and an Apfel of 3 amber
  // though both are high, and an Apfel of 1 green though it is medium.
  const color = riskLabel ? riskColor(riskLabel.level) : colors.textMuted
  return (
    <View style={{ flex: 1, backgroundColor: colors.surface, borderWidth: 1, borderColor: withAlpha(color, "66"), borderRadius: 15, paddingVertical: 12, alignItems: "center" }}>
      <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: "900" }}>{label}</Text>
      <Text style={{ color, fontSize: 24, fontWeight: "900", marginTop: 3 }}>{score}<Text style={{ color: colors.textMuted, fontSize: 15 }}>/{max}</Text></Text>
      {!!riskLabel && (
        <Text style={{ color, fontSize: 9, fontWeight: "800", textAlign: "center", marginTop: 4, paddingHorizontal: 4 }} numberOfLines={1}>{riskLabel.label}</Text>
      )}
    </View>
  )
}
