import React from "react"
import { Text, TouchableOpacity, View } from "react-native"
import { colors, withAlpha, useThemeRefresh } from "@/theme/colors"
import {
  FPSR_SCORES,
  NRS_SCORES,
  painBandLabel,
  scaleText,
  type PainBand,
  type PainLanguage,
  type ScaleItem,
} from "@lospor/core/postop-pain"

/**
 * The postoperative pain and delirium scales, entered the way each is defined
 * (10.0.0): FLACC, NIPS and PAED item by item, FPS-R by face, NRS by number.
 * No sliders. A second tap on the chosen answer clears it.
 */

function bandColor(band: PainBand): string {
  return band === "none" ? colors.success : band === "mild" ? colors.primary : band === "moderate" ? colors.warning : colors.danger
}

export function ScaleTotal({ label, total, max, band, bandText, language, notComplete }: {
  label: string
  total: number | null
  max: number
  band?: PainBand | null
  /** A band in the scale's own words (PAED), in place of a pain band. */
  bandText?: string | null
  language: PainLanguage
  notComplete: string
}) {
  useThemeRefresh()
  const tone = band ? bandColor(band) : colors.textSecondary
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 10, marginTop: 4 }}>
      <Text style={{ color: colors.textSecondary, fontSize: 13, fontWeight: "800" }}>{label}</Text>
      <Text testID={`${label.toLowerCase().replace(/[^a-z]/g, "")}-total`} style={{ color: total == null ? colors.textMuted : tone, fontSize: 18, fontWeight: "900", fontVariant: ["tabular-nums"] }}>
        {total ?? "—"}<Text style={{ color: colors.textMuted, fontSize: 13 }}> / {max}</Text>
      </Text>
      <Text style={{ flex: 1, color: total == null ? colors.textMuted : tone, fontSize: 12, fontWeight: "700" }}>
        {total == null ? notComplete : bandText ?? (band ? painBandLabel(band, language) : "")}
      </Text>
    </View>
  )
}

/** A scale scored item by item: each row its behaviour, each button an answer with its points. */
export function ItemScale<K extends string>({ items, values, onChange, language, testID }: {
  items: readonly ScaleItem<K>[]
  values: Partial<Record<K, number | null | undefined>>
  onChange: (key: K, value: number | null) => void
  language: PainLanguage
  testID: string
}) {
  useThemeRefresh()
  return (
    <View testID={testID} style={{ gap: 12 }}>
      {items.map(item => (
        <View key={item.key}>
          <Text style={{ color: colors.textPrimary, fontSize: 14, fontWeight: "800", marginBottom: 6 }}>{scaleText(item, language)}</Text>
          <View style={{ flexDirection: "row", gap: 6 }}>
            {item.choices.map(choice => {
              const selected = values[item.key] === choice.points
              return (
                <TouchableOpacity
                  key={`${choice.points}-${choice.labelEn}`}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => onChange(item.key, selected ? null : choice.points)}
                  style={{
                    flex: 1,
                    minHeight: 64,
                    borderRadius: 12,
                    borderCurve: "continuous",
                    borderWidth: 1,
                    borderColor: selected ? colors.primary : colors.border,
                    backgroundColor: selected ? colors.primarySoft : colors.surfaceRaised,
                    paddingVertical: 8,
                    paddingHorizontal: 4,
                    alignItems: "center",
                  }}
                >
                  <Text style={{ color: selected ? colors.primary : colors.textMuted, fontSize: 16, fontWeight: "900" }}>{choice.points}</Text>
                  <Text numberOfLines={3} style={{ color: selected ? colors.textPrimary : colors.textMuted, fontSize: 10, lineHeight: 12, textAlign: "center", marginTop: 2 }}>
                    {scaleText(choice, language)}
                  </Text>
                </TouchableOpacity>
              )
            })}
          </View>
        </View>
      ))}
    </View>
  )
}

/** FPS-R's six faces (0, 2 ... 10) or NRS's eleven numbers, as buttons. */
export function SelfReportScale({ kind, value, onChange, lowLabel, highLabel }: {
  kind: "FPS_R" | "NRS"
  value: number | null | undefined
  onChange: (value: number | null) => void
  lowLabel: string
  highLabel: string
}) {
  useThemeRefresh()
  const scores: readonly number[] = kind === "FPS_R" ? FPSR_SCORES : NRS_SCORES
  return (
    <View testID={kind === "FPS_R" ? "fpsr-scale" : "nrs-scale"}>
      <View style={{ flexDirection: "row", gap: kind === "FPS_R" ? 6 : 3 }}>
        {scores.map(score => {
          const selected = value === score
          return (
            <TouchableOpacity
              key={score}
              accessibilityRole="button"
              accessibilityLabel={`${kind === "FPS_R" ? "FPS-R" : "NRS"} ${score}`}
              accessibilityState={{ selected }}
              onPress={() => onChange(selected ? null : score)}
              style={{
                flex: 1,
                minHeight: kind === "FPS_R" ? 58 : 44,
                borderRadius: 10,
                borderCurve: "continuous",
                borderWidth: 1,
                borderColor: selected ? colors.warning : colors.border,
                backgroundColor: selected ? withAlpha(colors.warning, "22") : colors.surfaceRaised,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {kind === "FPS_R" ? <Face score={score} color={selected ? colors.warning : colors.textSecondary} /> : null}
              <Text style={{ color: selected ? colors.warning : colors.textSecondary, fontSize: kind === "FPS_R" ? 12 : 14, fontWeight: "800" }}>{score}</Text>
            </TouchableOpacity>
          )
        })}
      </View>
      <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 4 }}>
        <Text style={{ color: colors.textMuted, fontSize: 10 }}>{lowLabel}</Text>
        <Text style={{ color: colors.textMuted, fontSize: 10 }}>{highLabel}</Text>
      </View>
    </View>
  )
}

/**
 * A plain face for each FPS-R step, for orientation only: the child is shown
 * the scale's own faces, which are not reproduced here. Drawn with views so
 * no drawing library is needed: a level mouth at 0 turning down.
 */
function Face({ score, color }: { score: number; color: string }) {
  const step = score / 2
  return (
    <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: color, alignItems: "center", marginBottom: 2 }}>
      <View style={{ flexDirection: "row", gap: 6, marginTop: 6 }}>
        <View style={{ width: 3, height: 3, borderRadius: 1.5, backgroundColor: color }} />
        <View style={{ width: 3, height: 3, borderRadius: 1.5, backgroundColor: color }} />
      </View>
      <View style={{
        marginTop: 3 + step * 0.4,
        width: 10,
        height: Math.max(1.5, step * 1.4),
        borderTopLeftRadius: 6,
        borderTopRightRadius: 6,
        borderTopWidth: 1.5,
        borderLeftWidth: step > 0 ? 1.5 : 0,
        borderRightWidth: step > 0 ? 1.5 : 0,
        borderColor: color,
      }} />
    </View>
  )
}
